#!/usr/bin/env python3
"""
Abfuhrkalender-Scraper Landkreis Harburg (NOLIS-Portal).

Entschlüsselte Kette:
  1) Gemeinde-Select (statisch)            value = Gemeinde-ID
  2) Ortsteile einer Gemeinde:
     GET /ajax/abfall_gebiete_struktur_select.html?parent=<gemeindeId>&ebene=1&portal=1&selected_ebene=0
     -> <option value="strukturID">Ortsteilname</option>
  3) Kalenderseite eines Ortsteils (Blatt):
     GET /abfallkalender/abfallkalender_struktur_daten_suche.html?selected_ebene=<strukturID>&owner=20100
     -> enthaelt makeLinkAbfallarten(this, <gebietID>)
  4) iCal pro Jahr:
     GET /abfallkalender/icalendar/ical.html?id=<gebietID>&gebietOwner=20100&strukturID=<strukturID>&year=<Y>
     -> VEVENT mit DTSTART + SUMMARY (Abfallart)

Fuer RSS relevant: SUMMARY enthaelt "Hausmuell" (= Restmuell) oder "Altpapier" (= Pappe/Papier).

Aufruf:  python3 scrape_lkharburg.py <gemeindeId> <Ausgabedatei.json> [jahr]
Beispiel: python3 scrape_lkharburg.py 1124 ../data/abfuhr-seevetal.json 2026
"""
import sys, re, json, ssl, time, urllib.parse, urllib.request
from datetime import datetime

# macOS python.org-Builds haben oft kein CA-Bundle -> certifi nutzen, sonst ungeprueft
try:
    import certifi
    SSLCTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSLCTX = ssl._create_unverified_context()

BASE = "https://www.landkreis-harburg.de"
OWNER = "20100"
UA = {"User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest"}
WD = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"]

# Abfallart-SUMMARY -> unsere Fraktion (nur die fuer RSS wichtigen)
def fraktion_of(summary):
    s = summary.lower()
    if "hausm" in s or "restm" in s:   return "restmuell"
    if "altpapier" in s or "papier" in s or "pappe" in s: return "papier"
    return None  # Bio/Gelb/Gruen ignorieren

def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30, context=SSLCTX) as r:
        return r.read().decode("utf-8", "replace")

def ortsteile(gemeinde_id):
    url = f"{BASE}/ajax/abfall_gebiete_struktur_select.html?parent={gemeinde_id}&ebene=1&portal=1&selected_ebene=0"
    html = get(url)
    out = []
    for m in re.finditer(r'<option value="(\d+)">([^<]+)</option>', html):
        sid, name = m.group(1), m.group(2).strip()
        if sid != "0":
            out.append((sid, name))
    return out

def gebiet_id(struktur_id):
    url = f"{BASE}/abfallkalender/abfallkalender_struktur_daten_suche.html?selected_ebene={struktur_id}&owner={OWNER}"
    html = get(url)
    m = re.search(r'makeLinkAbfallarten\(this,\s*(\d+)\)', html)
    return m.group(1) if m else None

def ical_dates(gebiet, struktur_id, year):
    url = (f"{BASE}/abfallkalender/icalendar/ical.html?id={gebiet}&gebietOwner={OWNER}"
           f"&strukturID={struktur_id}&year={year}")
    ics = get(url)
    # VEVENT-Bloecke: DTSTART + SUMMARY
    events = {"restmuell": [], "papier": []}
    cur = {}
    for line in ics.splitlines():
        if line.startswith("DTSTART"):
            v = line.split(":",1)[1].strip()
            cur["date"] = v[:8]  # YYYYMMDD
        elif line.startswith("SUMMARY"):
            cur["sum"] = line.split(":",1)[1].strip()
        elif line.startswith("END:VEVENT"):
            fr = fraktion_of(cur.get("sum",""))
            if fr and "date" in cur:
                try:
                    d = datetime.strptime(cur["date"], "%Y%m%d").date()
                    events[fr].append({"datum": d.isoformat(), "wochentag": WD[d.weekday()],
                                        "art": cur.get("sum","")})
                except ValueError:
                    pass
            cur = {}
    return events

def geocode_ort(name, gemeinde):
    """Ortsteil-Mittelpunkt via OpenStreetMap Nominatim (kostenlos, kein Key).
    Klammerzusaetze wie '(westlich der A 7)' werden entfernt."""
    base = re.sub(r"\s*\(.*?\)", "", name).strip()
    q = urllib.parse.quote(f"{base}, {gemeinde}, Landkreis Harburg, Deutschland")
    url = f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1"
    req = urllib.request.Request(url, headers={"User-Agent": "RSS-Akquise/1.0 (Routenplanung)"})
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSLCTX) as r:
            d = json.loads(r.read().decode("utf-8", "replace"))
        if d:
            return round(float(d[0]["lat"]), 6), round(float(d[0]["lon"]), 6)
    except Exception:
        pass
    return None, None

def dominant_weekday(items):
    if not items: return None
    from collections import Counter
    c = Counter(i["wochentag"] for i in items)
    return c.most_common(1)[0][0]

def main():
    gemeinde = sys.argv[1] if len(sys.argv) > 1 else "1124"
    outfile  = sys.argv[2] if len(sys.argv) > 2 else "../data/abfuhr-seevetal.json"
    year     = sys.argv[3] if len(sys.argv) > 3 else "2026"
    gem_name = sys.argv[4] if len(sys.argv) > 4 else "Seevetal"

    ots = ortsteile(gemeinde)
    print(f"Gemeinde {gem_name} ({gemeinde}): {len(ots)} Ortsteile", file=sys.stderr)
    result = {"gemeinde_id": gemeinde, "gemeinde": gem_name, "jahr": int(year), "ortsteile": []}
    for sid, name in ots:
        gid = gebiet_id(sid)
        if not gid:
            print(f"  · {name}: kein Gebiet (uebersprungen)", file=sys.stderr)
            continue
        ev = ical_dates(gid, sid, year)
        rest_wd = dominant_weekday(ev["restmuell"])
        pap_wd  = dominant_weekday(ev["papier"])
        lat, lng = geocode_ort(name, gem_name)
        time.sleep(1.1)  # Nominatim fair-use
        result["ortsteile"].append({
            "name": name, "strukturID": sid, "gebietID": gid,
            "lat": lat, "lng": lng,
            "restmuell_wochentag": rest_wd, "restmuell_termine": ev["restmuell"],
            "papier_wochentag": pap_wd, "papier_termine": ev["papier"],
        })
        print(f"  ✓ {name}: Restmuell {rest_wd} · Papier {pap_wd} · "
              f"geo {'OK' if lat else 'fehlt'}", file=sys.stderr)

    with open(outfile, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\nGeschrieben: {outfile} ({len(result['ortsteile'])} Ortsteile)", file=sys.stderr)

if __name__ == "__main__":
    main()
