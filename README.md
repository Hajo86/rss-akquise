# RSS Akquise-App

Mobile-first **PWA** als Feld-Akquise-Tool für RSS (Recycling Solution Service, Müllbroker LK Harburg).

> **Kernlogik:** Ein Gewerbebetrieb, der am Abfuhrtag eine teure (kommunale) Pflichttonne
> rausstellt, ist Zielkunde. Die App macht aus der Beobachtung im Vorbeifahren in Sekunden
> einen qualifizierten Lead: **Foto → GPS → Adresse → Firmenname → Score → CRM.**

Gegenstück zum bestehenden Street-View-Scanner [`../rss-leads.html`](../rss-leads.html):
dort _remote_ erkannt, hier _real vor Ort_ erfasst.

## Stack

- **Vanilla JS PWA** (kein Build-Schritt) — `index.html` + `app.js`
- **Offline-first**: Leads + komprimierte Fotos in **IndexedDB**; Anreicherung/Sync laufen
  automatisch nach, sobald wieder Netz da ist
- **Google Maps Platform**: Reverse Geocoding (Adresse) + Places Nearby (Firma/Tel/Website)
- **Leaflet + OpenStreetMap** für die Kartenansicht (kein extra Key nötig)
- **Supabase optional** als Cloud-Sync (Postgres + Storage). Ohne Supabase läuft alles lokal.
- Branding: **OMR-Style schwarz/weiß**

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | App-Shell + OMR-CSS, lädt Leaflet (CDN) + `app.js` |
| `app.js` | Gesamte Logik: State, IndexedDB, Capture, Scoring, Anreicherung, Karte, Supabase, Export |
| `manifest.json` | PWA-Manifest (installierbar, standalone) |
| `sw.js` | Service Worker — App-Shell-Cache für Offline-Start |
| `icons/` | PWA-Icons (192/512/maskable) |

> `sw.js` + `manifest.json` sind bewusst **separate** Dateien (Service-Worker-Scope verlangt
> es) — Abweichung von der Single-File-Konvention der übrigen Projekte. App-Logik bleibt in
> `index.html` + `app.js`.

## Setup

1. **Hosten über https** (Pflicht — Kamera, GPS und Service Worker brauchen Secure Context).
   `file://` reicht **nicht**. Lokal testen via `localhost` (gilt als Secure Context):
   ```bash
   cd akquise && python3 -m http.server 8000
   # → http://localhost:8000   (Desktop Chrome: Kamera/GPS testbar)
   ```
2. **API-Keys** in der App unter **Setup** eintragen (werden nur lokal im Browser gespeichert):
   - **Google Maps Platform** Key mit aktivierten APIs: *Geocoding API* + *Places API (New)*.
     $200 Gratis-Guthaben/Monat reichen für den Feldstart locker.
   - **Supabase** (optional): Project URL + Anon Key. Leer lassen = nur lokal.
3. **Aufs Handy:** gehostete URL öffnen → „Zum Home-Bildschirm" → als App installiert.

## Deployment: GitHub Pages

```bash
cd akquise
git init && git add . && git commit -m "RSS Akquise PWA"
gh repo create rss-akquise --public --source=. --push
# GitHub → Repo → Settings → Pages → Branch: main / root → Save
# URL: https://<user>.github.io/rss-akquise/
```

## Datenmodell (ein Lead)

| Feld | Typ | Quelle |
|---|---|---|
| `id` | text | lokal generiert |
| `created_at` | timestamp | auto |
| `abfuhrtag` | date | heute (auto) |
| `lat`,`lng`,`accuracy` | float/int | Browser Geolocation |
| `photoBlob` / `foto_url` | blob / text | Kamera (lokal) / Supabase Storage |
| `fraktion` | text | restmuell·papier·bio·gelb |
| `volumen` | int | 120·240·660·1100 (L) |
| `anzahl` | int | Stepper |
| `entsorger_logo` | bool | Logo erkennbar? |
| `firmenname`,`telefon`,`website`,`place_id` | text | Google Places |
| `adresse` | text | Reverse Geocoding |
| `notiz` | text | Freitext / Sprachnotiz |
| `status` | text | neu·kontaktiert·angebot·gewonnen·verloren |
| `score` | float | Volumen × Anzahl × Fraktion-Faktor |
| `hot_lead` | bool | 1100 L Restmüll → auto |
| `kosten_monat`,`ersparnis_monat`,`ersparnis_jahr` | int | Kostenschätzung |
| `sync_state` | text | local·pending·synced |

### Scoring & Kosten (in `app.js` → `CONFIG`, editierbar)

```
score    = volFaktor[volumen] × anzahl × fraktFaktor[fraktion]
volFaktor   = {120:1, 240:2, 660:5, 1100:9}
fraktFaktor = {restmuell:1.0, bio:0.5, papier:0.3, gelb:0.2}
hot_lead    = (1100 L && Restmüll)
```

Kostenschätzung aus `CONFIG.markt` (€/Monat je Behälter, geerdet in echten
Remondis-/LK-Harburg-Werten: 1100 L Restmüll Markt ~150–300 €/Mt.). Angebot = 10 % unter Markt.
Realistische Ersparnis-Spanne laut RSS-Playbook: **200–1.500 €/Jahr**.

## Supabase-Schema (optional)

```sql
create table leads (
  id text primary key,
  created_at timestamptz,
  abfuhrtag date,
  lat double precision, lng double precision, accuracy int,
  foto_url text,
  fraktion text, volumen int, anzahl int, entsorger_logo bool,
  firmenname text, telefon text, website text, place_id text, adresse text,
  notiz text, status text,
  score real, hot_lead bool,
  kosten_monat int, ersparnis_monat int, ersparnis_jahr int
);
alter table leads enable row level security;
-- MVP (Single-User, anon): einfache Policy. Für Multi-User: Auth + user_id ergänzen.
create policy "anon all" on leads for all using (true) with check (true);
```
Storage: öffentlichen Bucket **`lead-photos`** anlegen (oder signierte URLs nutzen).

## Offline-Verhalten

1. Kamera + GPS funktionieren offline.
2. Lead wird **sofort** lokal gespeichert + angezeigt (Score schon berechnet, „Adresse wird ermittelt…").
3. Adress-/Firmen-Anreicherung + Supabase-Sync laufen automatisch nach, sobald online
   (`online`-Event / App-Start / „Jetzt synchronisieren").

## DSGVO (kurz, keine Rechtsberatung)

- Tonnen/Firmenfassaden auf öffentlicher Straße fotografieren ist i.d.R. unkritisch —
  **keine Personen, keine Kennzeichen** mit aufnehmen.
- Sobald Ansprechpartner-Namen gespeichert werden = personenbezogene Daten →
  Verarbeitungsverzeichnis + berechtigtes Interesse (Art. 6 (1) f DSGVO) dokumentieren.
- Vor dem Skalieren einmal anwaltlich gegenchecken.

## Roadmap

- **Phase 2:** Impressum-Anreicherung (§5 TMG → Ansprechpartner), Dashboard/Funnel,
  Pain×Power×Budget×Timing-Score (Hormozi).
- **Phase 3:** Routenplanung über Abfuhrkalender, Angebots-Generator aus der Kostenschätzung.
