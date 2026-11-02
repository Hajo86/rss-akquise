#!/usr/bin/env python3
"""
Ziel-Ernte Landkreis Harburg (Stufe 1 der Luftbild-Akquise-Pipeline).

Holt ALLE Gewerbe-Ziele des Landkreises per Overpass (OSM), priorisiert sie nach
Behälter-Wahrscheinlichkeit und schreibt sie als GeoJSON. Kostenlos, keine Keys.

Priorisierung:
  hoch    = Betriebstyp mit erfahrungsgemäß viel Rest-/Verpackungsmüll
            (Supermarkt, Kfz, Bäcker, Baumarkt, Handwerk, …) -> Bild-Prescore lohnt
  flaeche = Industrie-/Gewerbefläche (landuse) -> Hof-Scan lohnt
  niedrig = Friseur/Anwalt/Versicherung … -> überspringen

Aufruf:  python3 harvest_ziele.py [ausgabe.geojson]
Beispiel: python3 harvest_ziele.py ../data/ziele.geojson

Weiter mit:  python3 prescore_luftbild.py ../data/ziele.geojson
"""
import sys, json, ssl, time, urllib.parse, urllib.request

try:
    import certifi
    SSLCTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSLCTX = ssl._create_unverified_context()

OVERPASS = "https://overpass-api.de/api/interpreter"
UA = {"User-Agent": "rss-akquise-harvest/1.0"}

# Betriebstypen mit hoher Behälter-/Restmüll-Wahrscheinlichkeit
HIGH_SHOP = {
    "supermarket", "doityourself", "hardware", "car_repair", "car", "bakery",
    "butcher", "convenience", "farm", "trade", "garden_centre", "furniture",
    "beverages", "greengrocer", "deli", "wholesale", "tyres", "car_parts",
}
HIGH_CRAFT = {
    "carpenter", "bakery", "butcher", "brewery", "joiner", "metal_construction",
    "painter", "plumber", "gardener", "car_repair", "electrician", "roofer",
    "stonemason", "tiler", "window_construction", "sawmill",
}

# Eine Overpass-Abfrage über den ganzen Kreis
QUERY = """[out:json][timeout:90];
area["name"="Landkreis Harburg"]["admin_level"="6"]->.a;
( nwr["shop"](area.a);
  nwr["craft"](area.a);
  nwr["office"](area.a);
  nwr["industrial"](area.a);
  nwr["landuse"="industrial"](area.a);
  nwr["landuse"="commercial"](area.a);
);
out center tags;"""


def fetch_overpass():
    data = urllib.parse.urlencode({"data": QUERY}).encode()
    req = urllib.request.Request(OVERPASS, data=data, headers=UA)
    with urllib.request.urlopen(req, context=SSLCTX, timeout=120) as r:
        return json.load(r)


def classify(t):
    """-> (prio, kategorie)"""
    if t.get("landuse") in ("industrial", "commercial"):
        return "flaeche", "landuse=" + t["landuse"]
    if "industrial" in t:
        return "flaeche", "industrial"
    shop = t.get("shop")
    craft = t.get("craft")
    if shop in HIGH_SHOP:
        return "hoch", "shop=" + shop
    if craft in HIGH_CRAFT:
        return "hoch", "craft=" + craft
    if shop:
        return "niedrig", "shop=" + shop
    if craft:
        return "niedrig", "craft=" + craft
    if t.get("office"):
        return "niedrig", "office=" + t["office"]
    return "niedrig", "sonstige"


def addr_of(t):
    parts = [
        (t.get("addr:street", "") + " " + t.get("addr:housenumber", "")).strip(),
        (t.get("addr:postcode", "") + " " + t.get("addr:city", "")).strip(),
    ]
    return ", ".join(p for p in parts if p)


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "../data/ziele.geojson"
    print("Ernte Gewerbe-Ziele im Landkreis Harburg (Overpass) …", file=sys.stderr)
    d = fetch_overpass()
    els = d.get("elements", [])

    feats, counts = [], {"hoch": 0, "flaeche": 0, "niedrig": 0}
    for e in els:
        c = e.get("center") or ({"lat": e.get("lat"), "lon": e.get("lon")})
        if not c.get("lat"):
            continue
        t = e.get("tags", {})
        prio, kat = classify(t)
        counts[prio] += 1
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(c["lon"], 6), round(c["lat"], 6)]},
            "properties": {
                "osm_id": f"{e['type']}/{e['id']}",
                "name": t.get("name") or t.get("operator") or "(ohne Namen)",
                "kategorie": kat,
                "prio": prio,
                "adresse": addr_of(t),
                "website": t.get("website") or t.get("contact:website", ""),
                # Prescore füllt prescore_luftbild.py später
                "luft_prescore": None,
                "score": None,
            },
        })

    # hoch zuerst, dann Fläche, dann niedrig -> Prescore arbeitet die wichtigsten zuerst ab
    order = {"hoch": 0, "flaeche": 1, "niedrig": 2}
    feats.sort(key=lambda f: order[f["properties"]["prio"]])

    fc = {"type": "FeatureCollection", "features": feats}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, indent=1)

    print(f"\n{len(feats)} Ziele -> {out_path}", file=sys.stderr)
    print(f"  hoch    (Bild-Prescore lohnt):  {counts['hoch']}", file=sys.stderr)
    print(f"  flaeche (Hof-Scan lohnt):       {counts['flaeche']}", file=sys.stderr)
    print(f"  niedrig (überspringen):         {counts['niedrig']}", file=sys.stderr)
    print(f"  -> Prescore nötig für ~{counts['hoch']+counts['flaeche']} Ziele", file=sys.stderr)


if __name__ == "__main__":
    main()
