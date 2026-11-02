#!/usr/bin/env python3
"""
Luftbild-Prescore (Stufe 2 der Akquise-Pipeline).

Für jedes Ziel aus ziele.geojson:
  1) DOP20-Luftbild (20 cm, kostenlos, LGLN Niedersachsen) zentriert auf die Koordinate
  2) Gemini-2.5-Flash-Vision klassifiziert den Hof
  3) lokaler Score (A/B/C) + luft_prescore-Objekt wird ins GeoJSON geschrieben

Ehrliche Grenze: das Luftbild erkennt GROSSE Container/Mulden/Trailer und ob ein
Entsorgungs-Hof existiert — NICHT die exakte Volumenklasse kleiner 240/1100-L-Tonnen.
Der Prescore priorisiert Ziele; die Endklassifikation macht Street View / Feldfoto.

Key:   Umgebungsvariable GEMINI_API_KEY  oder  --key AIza…
Aufruf:
  python3 prescore_luftbild.py ../data/ziele.geojson            # alle hoch+flaeche
  python3 prescore_luftbild.py ../data/ziele.geojson --limit 20 # Testlauf 20 Ziele
  python3 prescore_luftbild.py ../data/ziele.geojson --prio hoch,flaeche,niedrig

Ausgabe: <input>_scored.geojson  +  <input>_scored.csv  (App-Import-Format)
"""
import sys, os, csv, ssl, json, math, time, base64, argparse, urllib.request

try:
    import certifi
    SSLCTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSLCTX = ssl._create_unverified_context()


def load_dotenv():
    """Lädt scripts/.env in os.environ (ohne bestehende Werte zu überschreiben)."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


load_dotenv()

WMS = "https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms"
GEMINI = ("https://generativelanguage.googleapis.com/v1beta/models/"
          "gemini-2.5-flash:generateContent?key=")
UA = {"User-Agent": "rss-akquise-prescore/1.0"}

PROMPT = (
    "Du siehst ein senkrechtes Luftbild (20 cm/Pixel) eines Grundstücks in einem "
    "deutschen Gewerbegebiet, zentriert auf einen Betrieb.\n"
    "Beurteile die ABFALL-/CONTAINER-Infrastruktur auf dem Hof. Wichtig: bei 20 cm "
    "sind einzelne 120–240-L-Tonnen nur 3–4 Pixel groß und NICHT sicher erkennbar — "
    "rate sie nicht. Zähle nur, was klar erkennbar ist.\n"
    "Erkennbar und zu zählen sind GROSSE Objekte: Abroll-/Absetzmulden, Press-/"
    "Großcontainer, Wechselbrücken/Container an Laderampen, Sattelauflieger, LKW.\n"
    "Schätze außerdem, ob überhaupt ein befestigter Hof/Ladebereich existiert und wie "
    "groß er ist.\n"
    "Antworte NUR als JSON, kein Text davor/danach:\n"
    '{"hat_hof":true,"hof_groesse":"klein|mittel|gross|sehr_gross",'
    '"container_cluster":true,"grosse_container":0,"trailer_lkw":0,'
    '"kleine_tonnen":"keine|einzelne|reihe|n_a","konfidenz":"niedrig|mittel|hoch",'
    '"hinweis":"kurz"}'
)


def ll2utm32(lat, lon):
    a = 6378137.0; f = 1 / 298.257223563; e2 = f * (2 - f); ep2 = e2 / (1 - e2)
    k0 = 0.9996; lon0 = math.radians(9)
    la = math.radians(lat); lo = math.radians(lon)
    N = a / math.sqrt(1 - e2 * math.sin(la) ** 2)
    T = math.tan(la) ** 2; C = ep2 * math.cos(la) ** 2; A = math.cos(la) * (lo - lon0)
    M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * la
             - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * la)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * la)
             - (35 * e2 ** 3 / 3072) * math.sin(6 * la))
    E = k0 * N * (A + (1 - T + C) * A ** 3 / 6
                  + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000
    Nn = k0 * (M + N * math.tan(la) * (A ** 2 / 2
               + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24
               + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720))
    return E, Nn


def fetch_dop(lat, lon, box_m=120, px=800):
    """DOP20-JPEG als Bytes. EPSG:25832, WMS 1.3.0 -> BBOX in E,N-Reihenfolge."""
    E, N = ll2utm32(lat, lon); h = box_m / 2
    q = {
        "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap",
        "LAYERS": "ni_dop20", "STYLES": "", "CRS": "EPSG:25832",
        "WIDTH": px, "HEIGHT": px, "FORMAT": "image/jpeg",
        "BBOX": f"{E-h:.1f},{N-h:.1f},{E+h:.1f},{N+h:.1f}",
    }
    url = WMS + "?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=SSLCTX, timeout=40) as r:
        return r.read()


def gemini_vision(jpeg, key):
    body = json.dumps({
        "contents": [{"parts": [
            {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(jpeg).decode()}},
            {"text": PROMPT},
        ]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 1024,
                             "thinkingConfig": {"thinkingBudget": 0}},
    }).encode()
    # Referer setzen: der App-Key ist HTTP-Referrer-beschränkt (nur hajo86.github.io).
    # Ohne diesen Header blockt Google mit 403 "Requests from referer <empty>".
    referer = os.environ.get("GEMINI_REFERER", "https://hajo86.github.io/rss-akquise/")
    req = urllib.request.Request(GEMINI + urllib.parse.quote(key), data=body,
                                headers={**UA, "Content-Type": "application/json",
                                         "Referer": referer})
    with urllib.request.urlopen(req, context=SSLCTX, timeout=60) as r:
        dd = json.load(r)
    parts = dd.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    txt = "".join(p.get("text", "") for p in parts)
    i, j = txt.find("{"), txt.rfind("}")
    if i < 0 or j < 0:
        raise ValueError("keine JSON-Antwort")
    return json.loads(txt[i:j + 1])


def score_of(ps):
    """Deterministischer A/B/C-Score aus dem Prescore-Objekt."""
    big = int(ps.get("grosse_container", 0) or 0)
    truck = int(ps.get("trailer_lkw", 0) or 0)
    cluster = bool(ps.get("container_cluster"))
    groß = ps.get("hof_groesse") in ("gross", "sehr_gross")
    if cluster and (big >= 2 or groß):
        return "A"
    if ps.get("hat_hof") and (cluster or big >= 1 or truck >= 1):
        return "B"
    return "C"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("geojson")
    ap.add_argument("--key", default=os.environ.get("GEMINI_API_KEY", ""))
    ap.add_argument("--prio", default="hoch,flaeche")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--box", type=int, default=120, help="Kantenlänge Luftbild in m")
    ap.add_argument("--sleep", type=float, default=0.4)
    args = ap.parse_args()

    if not args.key:
        sys.exit("Fehlt: GEMINI_API_KEY (env) oder --key AIza…")
    prios = set(args.prio.split(","))

    with open(args.geojson, encoding="utf-8") as f:
        fc = json.load(f)
    feats = fc["features"]
    todo = [ft for ft in feats
            if ft["properties"]["prio"] in prios and not ft["properties"].get("score")]
    if args.limit:
        todo = todo[:args.limit]
    print(f"{len(todo)} Ziele zu prescoren (prio: {args.prio})", file=sys.stderr)

    out_gj = args.geojson.replace(".geojson", "_scored.geojson")
    done = 0
    for ft in todo:
        p = ft["properties"]
        lon, lat = ft["geometry"]["coordinates"]
        try:
            jpeg = fetch_dop(lat, lon, box_m=args.box)
            ps = gemini_vision(jpeg, args.key)
            p["luft_prescore"] = ps
            p["score"] = score_of(ps)
        except urllib.error.HTTPError as e:
            if e.code == 429:  # Rate-Limit -> warten und einmal erneut
                time.sleep(5)
                try:
                    p["luft_prescore"] = gemini_vision(jpeg, args.key)
                    p["score"] = score_of(p["luft_prescore"])
                except Exception as e2:
                    p["luft_prescore"] = {"fehler": str(e2)}
            else:
                p["luft_prescore"] = {"fehler": f"HTTP {e.code}"}
        except Exception as e:
            p["luft_prescore"] = {"fehler": str(e)}
        done += 1
        s = p.get("score") or "?"
        print(f"  [{done}/{len(todo)}] {s}  {p['name'][:40]:40s} {p['kategorie']}", file=sys.stderr)
        if done % 25 == 0:  # Zwischenspeichern (Resume-fähig)
            json.dump(fc, open(out_gj, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        time.sleep(args.sleep)

    json.dump(fc, open(out_gj, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # CSV im App-Import-Format (A-Leads zuerst)
    out_csv = args.geojson.replace(".geojson", "_scored.csv")
    rank = {"A": 0, "B": 1, "C": 2, None: 3}
    rows = sorted((ft["properties"] for ft in feats if ft["properties"].get("score")),
                  key=lambda r: rank.get(r["score"], 3))
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["score", "name", "kategorie", "adresse", "grosse_container",
                    "trailer_lkw", "hof_groesse", "konfidenz", "streetview", "lat", "lon", "website"])
        for r in rows:
            ps = r.get("luft_prescore") or {}
            geo = next(ft["geometry"]["coordinates"] for ft in feats
                       if ft["properties"] is r)
            lat, lon = geo[1], geo[0]
            sv = f"https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={lat},{lon}"
            r["streetview"] = sv  # auch ins GeoJSON schreiben (App-Import)
            w.writerow([r["score"], r["name"], r["kategorie"], r["adresse"],
                        ps.get("grosse_container", ""), ps.get("trailer_lkw", ""),
                        ps.get("hof_groesse", ""), ps.get("konfidenz", ""),
                        sv, lat, lon, r["website"]])

    # GeoJSON erneut schreiben – jetzt inkl. streetview-Link je Feature
    json.dump(fc, open(out_gj, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    n = {"A": 0, "B": 0, "C": 0}
    for r in rows:
        n[r["score"]] = n.get(r["score"], 0) + 1
    print(f"\nFertig: {out_gj}\n        {out_csv}", file=sys.stderr)
    print(f"  A-Leads: {n['A']}   B: {n['B']}   C: {n['C']}", file=sys.stderr)


if __name__ == "__main__":
    main()
