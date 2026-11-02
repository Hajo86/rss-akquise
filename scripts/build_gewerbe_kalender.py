#!/usr/bin/env python3
"""
Gewerbegebiets-Kalender Landkreis Stade und Rotenburg (Wümme) im App-Format
(wie abfuhr-<gemeinde>.json: ortsteile[] mit restmuell_termine[]), dazu
termine-index.json neu aus allen abfuhr-*.json zusammenbauen.

Stade: Kreis-Schnittstelle (JSONP) je Straße, Containerarten R22 (14-tägl.),
R24 (4-wöchentl.), R31 (wöchentlich) + Tonne R02/R04. Ganzes Jahr 2026.
Rotenburg: AWR-plus-Kalender ist nur im Browser lesbar; Termine Nov/Dez 2026
liegen in scripts/row_days.json (per Playwright gelesen, 02.11.2026).

Aufruf: python3 build_gewerbe_kalender.py   (aus scripts/)
"""
import json, re, subprocess, datetime, glob, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
WD = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

# ---------------- Stade ----------------
E = 'https://abfall.landkreis-stade.de/api_v2/collection_dates/1'
def get(p):
    import time
    for i in range(4):
        t = subprocess.run(['curl', '-s', '--max-time', '25', f'{E}/{p}?callback=cb&limit=1000'], capture_output=True, text=True).stdout
        try:
            return json.loads(re.sub(r'^[^(]*\(|\)\s*;?\s*$', '', t, flags=re.S))
        except Exception:
            time.sleep(1.5 * (i + 1))
    raise RuntimeError('Stade-API antwortet nicht: ' + p)

ART = {'R02': 'Restmülltonne 14-täglich', 'R04': 'Restmülltonne 4-wöchentlich',
       'R22': 'Container 14-täglich', 'R24': 'Container 4-wöchentlich', 'R31': 'Container wöchentlich', 'P04': 'Altpapier'}

# Gewerbegebiet -> (Ort-ID, Leitstraße, lat, lng, weitere Straßen)
STADE = [
    ('Stade-Süd (Heidbecker Damm, Carl-Benz, Airbus)', 38, 'Heidbecker Damm', 53.578, 9.492, ['Carl-Benz-Str.', 'Robert-Bosch-Str.', 'Gottlieb-Daimler-Str.', 'Rudolf-Diesel-Str.', 'Ottenbecker Damm', 'Odamm', 'Airbus-Str.', 'Klarenstrecker Damm', 'Am Schwarzen Berg']),
    ('Stade-Nord (Hansestraße)', 38, 'Hansestr.', 53.605, 9.468, ['Altländer Str.']),
    ('Bützfleth Industriestraße', 38, 'Bützflether Industriestr.', 53.632, 9.505, []),
    ('Buxtehude-Ost (Alter Postweg, Rudolf-Diesel)', 10, 'Alter Postweg', 53.463, 9.717, ['Rudolf-Diesel-Str.', 'Carl-Zeiss-Str.', 'Hamburger Chaussee']),
    ('Buxtehude Harburger Straße', 10, 'Harburger Str.', 53.466, 9.722, []),
    ('Buxtehude Konrad-Adenauer-Allee', 10, 'Konrad-Adenauer-Allee', 53.472, 9.700, []),
    ('Buxtehude Moisburger Landstraße', 10, 'Moisburger Landstr.', 53.455, 9.690, []),
    ('Horneburg Industriestraße', 27, 'Industriestr.', 53.505, 9.578, ['Issendorfer Str.']),
    ('Harsefeld Weißenfelder Straße', 23, 'Weißenfelder Str.', 53.452, 9.515, ['Friedrich-Huth-Str.']),
]

def stade():
    out = {'gemeinde_id': 'stade', 'gemeinde': 'Landkreis Stade (Gewerbegebiete)', 'jahr': 2026, 'ortsteile': []}
    streets_cache = {}
    for name, oid, lead, lat, lng, more in STADE:
        if oid not in streets_cache:
            streets_cache[oid] = {s['strassenbezeichnung']: s['strassennummer'] for s in get(f'ort/{oid}/strassen')['strassen']}
        rest, pap, seen = [], [], set()
        for sn in [lead] + more:
            nr = streets_cache[oid].get(sn)
            if nr is None:
                print('  Straße nicht gefunden:', oid, sn, file=sys.stderr); continue
            k = get(f'ort/{oid}/strasse/{nr}/hausnummern/0/abfallarten/R02-R04-R22-R24-R31-P04/kalender').get('termine', {})
            for art, lst in k.items():
                for x in lst:
                    d = datetime.datetime.strptime(x['datum'], '%d.%m.%y').date()
                    key = (d.isoformat(), art)
                    if key in seen: continue
                    seen.add(key)
                    rec = {'datum': d.isoformat(), 'wochentag': WD[d.weekday()], 'art': ART.get(art, art), 'strasse': sn}
                    (pap if art == 'P04' else rest).append(rec)
        rest.sort(key=lambda r: (r['datum'], r['art'])); pap.sort(key=lambda r: r['datum'])
        wdays = sorted({r['wochentag'] for r in rest if 'Container' in r['art']}, key=WD.index)
        out['ortsteile'].append({'name': name, 'strukturID': f'{oid}', 'gebietID': lead, 'lat': lat, 'lng': lng,
                                 'restmuell_wochentag': '/'.join(wdays), 'restmuell_termine': rest,
                                 'papier_wochentag': (pap[0]['wochentag'] if pap else ''), 'papier_termine': pap})
        print('Stade:', name, len(rest), 'Termine')
    return out

# ---------------- Rotenburg ----------------
ROW_POS = {
    ('Zeven', 'Industriestraße'): ('Zeven Industriestraße / Bremervörder Straße', 53.295, 9.283),
    ('Rotenburg (Wümme)', 'Industriestraße'): ('Rotenburg Industriestraße / Hohenesch', 53.102, 9.405),
    ('Sittensen', 'Bahnhofstraße'): ('Sittensen Gewerbegebiet A1 (Bahnhof-/Industriestraße)', 53.282, 9.503),
    ('Elsdorf', 'An der Autobahn'): ('Elsdorf LogIn Park (An der Autobahn)', 53.232, 9.343),
    ('Sottrum', 'Industriestraße'): ('Sottrum Industriestraße (A1)', 53.116, 9.236),
    ('Bremervörde', 'Industriestraße'): ('Bremervörde Industriestraße', 53.486, 9.172),
    ('Gyhum-Bockel', 'An der Autobahn'): ('Gyhum-Bockel Gewerbegebiet (An der Autobahn)', 53.195, 9.290),
}
def parse_de(s):  # 'Mi 11.11.2026' -> date
    m = re.search(r'(\d{2})\.(\d{2})\.(\d{4})', s)
    return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))

def rotenburg():
    rows = json.load(open(os.path.join(HERE, 'row_days.json')))
    out = {'gemeinde_id': 'rotenburg', 'gemeinde': 'Landkreis Rotenburg (Gewerbegebiete)', 'jahr': 2026, 'ortsteile': []}
    for e in rows:
        name, lat, lng = ROW_POS.get((e['ort'], e['strasse']), (f"{e['ort']} {e['strasse']}", None, None))
        rest = []
        for s in e.get('hausmuell14', []):
            d = parse_de(s); rest.append({'datum': d.isoformat(), 'wochentag': WD[d.weekday()], 'art': 'Hausmüll 14-täglich'})
        for s in e.get('hausmuell4', []):
            d = parse_de(s); rest.append({'datum': d.isoformat(), 'wochentag': WD[d.weekday()], 'art': 'Hausmüll 4-wöchentlich'})
        pap = []
        for s in e.get('papier', []):
            d = parse_de(s); pap.append({'datum': d.isoformat(), 'wochentag': WD[d.weekday()], 'art': 'Altpapier'})
        rest.sort(key=lambda r: (r['datum'], r['art']))
        out['ortsteile'].append({'name': name, 'strukturID': 'row', 'gebietID': e['strasse'], 'lat': lat, 'lng': lng,
                                 'restmuell_wochentag': rest[0]['wochentag'] if rest else '', 'restmuell_termine': rest,
                                 'papier_wochentag': pap[0]['wochentag'] if pap else '', 'papier_termine': pap,
                                 'hinweis': 'AWR-plus-Kalender, nur Nov/Dez 2026 gelesen; ' + e.get('bemerkung', '')})
        print('Rotenburg:', name, len(rest), 'Termine')
    return out

# ---------------- Index ----------------
def build_index():
    gem = json.load(open(os.path.join(DATA, 'gemeinden.json')))
    idx = {}
    for g in gem:
        d = json.load(open(os.path.join(DATA, g['file'])))
        byday = {}
        for o in d['ortsteile']:
            base = o['name'].split(' (')[0]
            for t in o.get('restmuell_termine', []):
                byday.setdefault(t['datum'], {'r': set(), 'p': set()})['r'].add(base)
            for t in o.get('papier_termine', []):
                byday.setdefault(t['datum'], {'r': set(), 'p': set()})['p'].add(base)
        for day, v in byday.items():
            idx.setdefault(day, []).append({'id': g['id'], 'name': g['name'], 'r': sorted(v['r']), 'p': sorted(v['p'])})
    for day in idx:
        idx[day].sort(key=lambda e: e['name'])
    json.dump(dict(sorted(idx.items())), open(os.path.join(DATA, 'termine-index.json'), 'w'), ensure_ascii=False, indent=1)
    print('Index:', len(idx), 'Tage')

if __name__ == '__main__':
    s = stade(); json.dump(s, open(os.path.join(DATA, 'abfuhr-stade.json'), 'w'), ensure_ascii=False, indent=1)
    r = rotenburg(); json.dump(r, open(os.path.join(DATA, 'abfuhr-rotenburg.json'), 'w'), ensure_ascii=False, indent=1)
    gem = json.load(open(os.path.join(DATA, 'gemeinden.json')))
    gem = [g for g in gem if g['id'] not in ('stade', 'rotenburg')]
    gem.append({'id': 'stade', 'name': 'LK Stade · Gewerbe', 'file': 'abfuhr-stade.json', 'jahr': 2026, 'lat': 53.55, 'lng': 9.55, 'ortsteile': len(s['ortsteile'])})
    gem.append({'id': 'rotenburg', 'name': 'LK Rotenburg · Gewerbe', 'file': 'abfuhr-rotenburg.json', 'jahr': 2026, 'lat': 53.25, 'lng': 9.35, 'ortsteile': len(r['ortsteile'])})
    json.dump(gem, open(os.path.join(DATA, 'gemeinden.json'), 'w'), ensure_ascii=False, indent=2)
    build_index()
