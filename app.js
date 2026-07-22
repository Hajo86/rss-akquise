/* ===================================================================
   RSS Akquise-App — Feld-Tool (Vanilla JS, offline-first PWA)
   Foto → GPS → Adresse → Firma → Score → CRM
   =================================================================== */

/* ---------- CONFIG: Scoring + Kostenmodell ----------
   Werte geerdet in echten LK-Harburg/Veolia-Zahlen (Stand 2026):
   1100 L Restmüll Markt ~150 €/14-täglich … ~300 €/wöchentlich.
   Default = mittlere Annahme (Abfuhrrhythmus bei Capture unbekannt),
   im Lead-Detail editierbar. Alles hier ist anpassbar. */
var CONFIG = {
  volFaktor:   { 120:1, 240:2, 660:5, 1100:9 },     // nur für Capture-Schnellscore
  fraktFaktor: { restmuell:1.0, bio:0.5, papier:0.3, gelb:0.2 }
};

/* ===== Echte Kalkulation: LK Harburg Satzung 2026 + Veolia-EK =====
   Kommunale Restmüll-Jahresgebühr (€/Jahr, inkl. Grundgebühr).
   rhythmus: 'woe'=wöchentlich, '14t'=14-täglich, '4woe'=4-wöchentlich.
   660 L gibt es kommunal NICHT (private Größe). */
var TARIF = {
  restmuell: {
    40:   { '4woe':77.90, '14t':115.80 },
    60:   { '14t':153.70 },
    80:   { '14t':191.60 },
    120:  { '14t':267.40 },
    240:  { '14t':494.80, 'woe':1074.60 },
    1100: { '14t':2124.50, 'woe':4459.00 }
  },
  pflichtJahr: 77.90   // kleinste Pflichttonne (40 L 4-wö) — bleibt IMMER
};
// Veolia-EK netto: Miete €/Monat + variabel €/Leerung (Preisliste ULB, gültig bis 31.12.2026)
// 1100 L = 1,1 cbm ULB. Leerung = Grundpreis + CO2-/Maut-Pauschale (7,10) + BEHG-Pauschale (5,05 €/cbm, nur Restmüll).
var VEOLIA = {
  restmuell: { 1100: { miete:4.00, leerung:42.66 } },  // 30,00 + 7,10 CO2/Maut + 5,56 BEHG (5,05×1,1 cbm)
  papier:    { 1100: { miete:4.00, leerung:12.10 } }   // 5,00 + 7,10 CO2/Maut (kein BEHG auf Papier)
};
var LEER_MT = { 'woe':52/12, '14t':26/12, '4woe':13/12 };  // Leerungen pro Monat
var RABATT  = 0.10;   // Kunde spart 10 % seiner Kommunalkosten

/* Wirtschaftlichkeit eines Leads.
   Modell (vom Kunden bestätigt): RSS-Preis = 10 % unter Kommunal.
   Die kleinste Pflichttonne (40 L) zahlt der Kunde zusätzlich an die Stadt
   -> seine Ersparnis sinkt genau um die Pflichttonne. Marge bleibt voll bei RSS. */
function kalkulation(x){
  var rh=(x&&x.rhythmus)||'14t';
  var rabatt=(x&&x.rabatt!=null)?x.rabatt:RABATT;
  var kommunal=0, ekRest=0, ekPap=0, unbekannteEK=false, privat=false, papier1100=false;
  containersOf(x).forEach(function(c){
    var n=c.anzahl||1;
    if(c.fraktion==='restmuell'){
      var t=TARIF.restmuell[c.volumen];
      var jahr=t?(t[rh]!=null?t[rh]:t['14t']):null;
      if(jahr!=null) kommunal+=(jahr/12)*n; else privat=true;        // 660 L = privat
      var ek=VEOLIA.restmuell[c.volumen];
      if(ek) ekRest+=(ek.miete+ek.leerung*LEER_MT[rh])*n; else unbekannteEK=true;
    } else if(c.fraktion==='papier' && c.volumen>=1100){
      var ekp=VEOLIA.papier[1100]; ekPap+=(ekp.miete+ekp.leerung*LEER_MT[rh])*n; papier1100=true;
      // 240-L-Papier: kommunal gratis -> 0
    } // bio/gelb: kommunal inklusive -> 0
  });
  var pflicht  = TARIF.pflichtJahr/12;        // 6,49 €/Mt – Kunde zahlt an die Stadt
  var rssPreis = kommunal*(1-rabatt);          // 10 % unter Kommunal
  var ekGesamt = ekRest + ekPap;               // RSS-Kosten (Veolia-EK; Papier RSS-getragen)
  var margeMt  = rssPreis - ekGesamt;
  var neuGesamt= rssPreis + pflicht;           // neue Gesamtkosten des Kunden
  var ersparnisMt = kommunal - neuGesamt;      // = kommunal*rabatt − Pflichttonne
  return {
    rhythmus:rh, rabatt:rabatt, kosten_monat:kommunal,
    rss_preis_monat:rssPreis, pflicht_monat:pflicht, neu_gesamt_monat:neuGesamt,
    ersparnis_monat:ersparnisMt, ersparnis_jahr:ersparnisMt*12,
    rss_marge_monat:margeMt, rss_marge_jahr:margeMt*12,
    ek_rest_monat:ekRest, ek_pap_monat:ekPap, rss_kosten_monat:ekGesamt,
    papier1100:papier1100, ek_unvollstaendig:unbekannteEK, privat:privat
  };
}

var FRAKTION = {
  restmuell: { label:'Restmüll', sw:'#111' },
  papier:    { label:'Papier',   sw:'#1c4fd6' },
  bio:       { label:'Bio',      sw:'#3a7d2c' },
  gelb:      { label:'Gelb',     sw:'#e8c400' }
};
var VOLUMEN = [120,240,660,1100];
var STATUS = ['neu','kontaktiert','angebot','gewonnen','verloren'];
var STATUS_LBL = { neu:'Neu', kontaktiert:'Kontakt', angebot:'Angebot', gewonnen:'Gewonnen', verloren:'Verloren' };
var APP_VERSION = 'v53 · Website oben im Lead + „Anreichern": Website-Impressum → Ansprechpartner + E-Mail (CORS-Proxy)';
var WD = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
// Places-Typen, die fast nie Gewerbekunden mit Tonne sind -> aus Route ausblenden
var STOP_EXCLUDE = ['bus_stop','transit_station','locality','political','park','school',
  'primary_school','secondary_school','place_of_worship','church','cemetery','tourist_attraction',
  'parking','bus_station','train_station','light_rail_station'];

// Restmüll-intensive Zielbranchen (Google Places New primaryType) + Potenzial-Gewicht.
// Belegt durch amtliche EGW-Faktoren + Benchmark-Studien: 3 = Wunschkunde (1100 L wahrscheinlich),
// 2 = stark, 1 = solide. Kliniken/Pflege/Supermarkt = höchstes Restmüllvolumen pro Standort.
var TARGET_TYPES = {
  hospital:          { w:3, lbl:'Klinik' },
  supermarket:       { w:3, lbl:'Supermarkt' },
  grocery_store:     { w:2, lbl:'Lebensmittel' },
  wholesaler:        { w:2, lbl:'Großhandel' },
  restaurant:        { w:2, lbl:'Restaurant' },
  meal_takeaway:     { w:2, lbl:'Imbiss/To-Go' },
  hotel:             { w:2, lbl:'Hotel' },
  bar:               { w:1, lbl:'Bar' },
  cafe:              { w:1, lbl:'Café' },
  preschool:         { w:1, lbl:'Kita' },
  child_care_agency: { w:1, lbl:'Kita' }
};
var TARGET_TYPE_KEYS = Object.keys(TARGET_TYPES);
// Pflege-/Altenheime haben in Places (New) KEINEN eigenen Typ -> per Textsuche holen (Top-Ziel!)
var TARGET_TEXT = [{ q:'Pflegeheim Altenheim Seniorenheim', w:3, lbl:'Pflegeheim' }];
function potText(w){ return w>=3?'hoch':(w>=2?'stark':'solide'); }

/* ---------- State ---------- */
var S = {
  tab: 'erfassen',
  leads: [],
  draft: null,
  filter: 'alle',
  sort: 'score',
  leadView: 'list',    // 'list' | 'board' (Pipeline-Kanban) im Leads-Tab
  secEdit: false,      // Lead-Sheet: Bearbeiten-Bereich (Tonnen/Firma/Notiz) auf/zu
  crmSync: true,       // Kontakt-/CRM-Felder mit Supabase syncen? auto-false, falls Spalten fehlen

  modal: null,         // lead id im Detail-Sheet
  picker: null,        // { leadId, candidates } Firmen-Auswahl
  online: navigator.onLine,
  keys: loadKeys(),
  map: null,
  route: null,        // geladene Abfuhr-/Routendaten der AKTIVEN Gemeinde
  gemeinden: null,    // Manifest data/gemeinden.json (alle Kommunen)
  gemeindeId: null,   // aktuell geladene Gemeinde
  termineIndex: null, // data/termine-index.json: Datum -> [{id,name,r[],p[]}] (ganzer LK, für Erinnerung)
  showReminder: false,// „Nächste Abfuhr"-Overlay beim App-Start
  showFollowups: false,// „Meine Termine heute" (fällige Wiedervorlagen) als Start-Overlay
  routeLoading: false,// verhindert Doppel-Fetch beim Rendern
  routeDate: null,    // angezeigtes ISO-Datum (Default = heute)
  stops: {},          // Gebietsname -> [Zielkunden]  (on demand)
  parks: {},          // Gebietsname -> [Gewerbepark-Cluster]
  stopsLoading: {},   // Gebietsname -> bool
  lastSaved: null,    // {id,score,hot} -> Bestätigungsbanner nach dem Speichern
  calcOpen: false,    // aufklappbare Detail-Rechnung im Lead-Sheet
  lastSyncError: null,// letzter Sync-Fehler (sichtbar in Setup)
  watchId: null,      // navigator.geolocation.watchPosition-ID (Live-Tracking im Auto)
  gpsTick: null,      // Intervall, das das Fix-Alter in der GPS-Pille aktualisiert
  gpsRefreshing: false// gerade ein frischer Fix angefordert (verhindert Doppel-Requests)
};
function freshDraft(){
  return { photoBlob:null, lat:null, lng:null, accuracy:null, gpsState:'wait', gpsMsg:'', gpsTime:null,
           behaelter:[{fraktion:'restmuell',volumen:1100,anzahl:1}], rhythmus:'14t', rabatt:0.10,
           entsorger_logo:true, entsorger:'', notiz:'', analyzing:false, labelScanning:false,
           preset:null, fromStop:false,               // fromStop = aus Route-Stop (springt nach Speichern zu „Heute")
           companyState:'idle', companyCands:null, companyMsg:'', showCands:false };
  // preset = { firmenname, adresse, telefon, website, place_id, ortsteil }
}

/* ---------- Keys / Settings persistence ---------- */
function loadKeys(){ try{ return JSON.parse(localStorage.getItem('rss_keys')) || {}; }catch(e){ return {}; } }
function saveKeys(k){ S.keys = k; localStorage.setItem('rss_keys', JSON.stringify(k)); }

/* ---------- DOM helpers ---------- */
var $app = document.getElementById('app');
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function eur(n){ return Math.round(n).toLocaleString('de-DE') + ' €'; }
function eur2(n){ return (Number(n)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €'; }
function httpize(u){ u=(u||'').trim(); if(!u) return ''; return /^https?:\/\//i.test(u)?u:('https://'+u); }
function hostOf(u){ try{ return new URL(httpize(u)).host.replace(/^www\./,''); }catch(e){ return (u||'').replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0]; } }
// Absender für Kunden-Angebote (RSS Recycling Solution Service UG i. Gr.)
var RSS_ABSENDER = {
  firma:'RSS Recycling Solution Service UG',
  zusatz:'(i. Gr.)',
  strasse:'Barmbeker Straße 23a',
  ort:'22303 Hamburg',
  gf:'Sören Rohde',
  tel:'+49 176 14081987',
  mail:'rohde@rss-entsorgung.de',
  web:'rss-entsorgung.de'
};
// Termin/Video-Standard (RSS-Google-Konto). In Setup pro Gerät überschreibbar.
var RSS_TERMIN = {
  booking:'https://calendar.app.google/8aMLyBSo6RnzC26P8',
  meet:'https://meet.google.com/csq-fmki-nrz'
};
function bookingURL(){ return ((S.keys&&S.keys.bookingLink||'').trim()) || RSS_TERMIN.booking; }
function meetURL(){ return ((S.keys&&S.keys.meetLink||'').trim()) || RSS_TERMIN.meet; }
var _toastT;
function toast(msg){
  var t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(_toastT); _toastT=setTimeout(function(){t.classList.remove('show');},2600);
}

/* ---------- IndexedDB ---------- */
var DB;
function openDB(){
  return new Promise(function(res,rej){
    var r = indexedDB.open('rss_akquise',1);
    r.onupgradeneeded = function(e){
      var db=e.target.result;
      if(!db.objectStoreNames.contains('leads')) db.createObjectStore('leads',{keyPath:'id'});
    };
    r.onsuccess=function(){ DB=r.result; res(DB); };
    r.onerror=function(){ rej(r.error); };
  });
}
function tx(mode){ return DB.transaction('leads',mode).objectStore('leads'); }
function dbPut(lead){ return new Promise(function(res,rej){ var rq=tx('readwrite').put(lead); rq.onsuccess=function(){res();}; rq.onerror=function(){rej(rq.error);}; }); }
function dbDel(id){ return new Promise(function(res,rej){ var rq=tx('readwrite').delete(id); rq.onsuccess=function(){res();}; rq.onerror=function(){rej(rq.error);}; }); }
function dbClear(){ return new Promise(function(res,rej){ var rq=tx('readwrite').clear(); rq.onsuccess=function(){res();}; rq.onerror=function(){rej(rq.error);}; }); }
function dbAll(){ return new Promise(function(res,rej){ var rq=tx('readonly').getAll(); rq.onsuccess=function(){res(rq.result||[]);}; rq.onerror=function(){rej(rq.error);}; }); }

async function loadLeads(){
  S.leads = await dbAll();
  S.leads.sort(function(a,b){ return (b.created_at||0)-(a.created_at||0); });
}

/* ---------- Scoring + Kosten ---------- */
// Liste der Behälter eines Drafts/Leads (abwärtskompatibel zu Alt-Leads mit Einzelfeldern)
function containersOf(x){
  if(x && x.behaelter && x.behaelter.length) return x.behaelter;
  return [{ fraktion:(x&&x.fraktion)||'restmuell', volumen:(x&&x.volumen)||1100, anzahl:(x&&x.anzahl)||1 }];
}
function scoreLead(d){
  var s=containersOf(d).reduce(function(a,c){
    return a + (CONFIG.volFaktor[c.volumen]||1) * (c.anzahl||1) * (CONFIG.fraktFaktor[c.fraktion]||0.2);
  },0);
  return Math.round(s*10)/10;
}
function isHot(d){ return containersOf(d).some(function(c){ return c.volumen===1100 && c.fraktion==='restmuell'; }); }
function costEstimate(d){ return kalkulation(d); }
function totalAnzahl(d){ return containersOf(d).reduce(function(a,c){ return a+(c.anzahl||1); },0); }
// dominanter Behälter (größter, Restmüll bevorzugt) -> für kompatible Primärfelder + Karte
function dominantContainer(d){
  var list=containersOf(d), best=list[0], bv=-1;
  list.forEach(function(c){ var v=(c.volumen||0)*(c.anzahl||1)*(c.fraktion==='restmuell'?2:1); if(v>bv){bv=v;best=c;} });
  return best;
}
function behaelterSummary(d){
  return containersOf(d).map(function(c){
    return (FRAKTION[c.fraktion]?FRAKTION[c.fraktion].label:c.fraktion)+' '+c.volumen+'L ×'+(c.anzahl||1);
  }).join(' · ');
}

/* ---------- Photo ---------- */
function compressPhoto(file){
  return new Promise(function(res){
    var img=new Image(); var url=URL.createObjectURL(file);
    img.onload=function(){
      var max=1568, w=img.width, h=img.height;   // höhere Auflösung -> kleine Tonnen bleiben erkennbar
      if(w>h && w>max){ h=Math.round(h*max/w); w=max; }
      else if(h>=w && h>max){ w=Math.round(w*max/h); h=max; }
      var c=document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);
      c.toBlob(function(b){ res(b); },'image/jpeg',0.72);
    };
    img.onerror=function(){ URL.revokeObjectURL(url); res(file); };
    img.src=url;
  });
}
function photoURL(lead){
  if(lead.photoBlob){ if(!lead._url) lead._url=URL.createObjectURL(lead.photoBlob); return lead._url; }
  if(lead.foto_url) return lead.foto_url;   // von anderen Nutzern gesynct (Supabase Storage)
  return null;
}
function extraPhotoURLs(lead){
  if(!lead.photos||!lead.photos.length) return [];
  lead._purls=lead._purls||[];
  return lead.photos.map(function(b,i){ if(!lead._purls[i]) lead._purls[i]=URL.createObjectURL(b); return lead._purls[i]; });
}
function blobToB64(blob){
  return new Promise(function(res,rej){
    var r=new FileReader(); r.onloadend=function(){ res(String(r.result).split(',')[1]); }; r.onerror=rej;
    r.readAsDataURL(blob);
  });
}
// Text aus einer Gemini-Antwort robust einsammeln: ALLE Parts aller Kandidaten
// zusammenfassen (nicht nur parts[0]) und den finishReason mitgeben (MAX_TOKENS etc.).
function geminiText(dd){
  var out='', reason='';
  var cs=(dd&&dd.candidates)||[];
  for(var i=0;i<cs.length;i++){
    if(cs[i].finishReason) reason=cs[i].finishReason;
    var parts=cs[i].content&&cs[i].content.parts||[];
    for(var j=0;j<parts.length;j++){ if(parts[j].text) out+=parts[j].text; }
  }
  return { text:out, reason:reason };
}

/* ---------- Bilderkennung (Gemini Vision) ---------- */
function snapVol(v){ var o=[120,240,660,1100]; v=parseInt(v,10)||1100;
  return o.reduce(function(a,b){ return Math.abs(b-v)<Math.abs(a-v)?b:a; }); }
function normBin(c){
  var fr=String(c.fraktion||'').toLowerCase();
  if(fr.indexOf('rest')>=0||fr.indexOf('haus')>=0||fr.indexOf('schwarz')>=0||fr.indexOf('grau')>=0) fr='restmuell';
  else if(fr.indexOf('pap')>=0||fr.indexOf('blau')>=0) fr='papier';
  else if(fr.indexOf('bio')>=0||fr.indexOf('braun')>=0) fr='bio';
  else if(fr.indexOf('gelb')>=0) fr='gelb';
  else fr='restmuell';
  return { fraktion:fr, volumen:snapVol(c.volumen), anzahl:Math.max(1,parseInt(c.anzahl,10)||1) };
}
async function analyzePhoto(){
  var d=S.draft;
  if(!d.photoBlob){ toast('Erst Foto aufnehmen'); return; }
  if(!S.keys.gemini){ toast('Erst Gemini-Key in Setup eintragen'); return; }
  if(d.analyzing) return;
  d.analyzing=true; render();
  var prompt=
    'Du analysierst ein Foto von Mülltonnen vor einem deutschen Gewerbebetrieb am Abfuhrtag.\n'+
    'Zähle GENAU die tatsächlich im Bild sichtbaren Tonnen: übersieh keine echte, aber erfinde auch keine.\n'+
    'Melde NUR Objekte, die klar als Mülltonne/Container erkennbar sind. Nimm NICHT automatisch an, dass eine Restmülltonne dabei ist. '+
    'Wenn du unsicher bist, ob etwas eine Tonne ist (Kiste, Sack, Schatten, anderes Objekt), lass es weg.\n'+
    'Fraktion nach Deckel-/Korpusfarbe: schwarz/anthrazit/grau = restmuell, blau = papier, braun ODER grün = bio, gelb/gelber Deckel = gelb. '+
    'Ordne die Fraktion nach der sichtbaren Farbe zu, nicht nach Vermutung.\n'+
    'Volumen bei 2-Rad-Tonnen: schmal/niedrig = 120, normal/breiter = 240. Große 4-Rad-Container = 660 oder 1100. Runde auf 120, 240, 660 oder 1100.\n'+
    'Fasse gleiche Fraktion+Größe zu einem Eintrag mit anzahl zusammen. Kleine 120-L-Biotonnen (braun/grün) nicht übersehen.\n'+
    'Lies das Entsorger-Logo/den Aufdruck auf der Tonne ab und gib den Namen in "entsorger" zurück '+
    '(z.B. Remondis, Veolia, Alba, PreZero, Suez, oder den Namen des kommunalen Entsorgers). '+
    'Unklar/keins -> "entsorger":"unbekannt". "entsorger_logo" = true, wenn überhaupt ein Logo/Aufdruck sichtbar ist.\n'+
    'Wenn KEINE Tonne klar erkennbar ist, gib "behaelter":[] zurück.\n'+
    'Antworte NUR als JSON, kein Text davor/danach:\n'+
    '{"behaelter":[{"fraktion":"restmuell","volumen":1100,"anzahl":2},{"fraktion":"bio","volumen":120,"anzahl":1}],"entsorger":"Remondis","entsorger_logo":true,"hinweis":"kurz"}';
  try{
    var b64=await blobToB64(d.photoBlob);
    var r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+encodeURIComponent(S.keys.gemini),{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ contents:[{parts:[{inlineData:{mimeType:'image/jpeg',data:b64}},{text:prompt}]}],
        generationConfig:{temperature:0.1,maxOutputTokens:2048,thinkingConfig:{thinkingBudget:0}} })
    });
    if(!r.ok){ var e=await r.json().catch(function(){return{};}); throw new Error((e.error&&e.error.message)||('HTTP '+r.status)); }
    var dd=await r.json();
    var txt=geminiText(dd).text;
    var m=txt&&txt.match(/\{[\s\S]*\}/);
    if(!m) throw new Error('keine Tonnen erkannt');
    var res=JSON.parse(m[0]);
    var bins=(res.behaelter||[]).map(normBin);
    if(bins.length){ d.behaelter=bins; }
    if(typeof res.entsorger_logo==='boolean') d.entsorger_logo=res.entsorger_logo;
    if(res.entsorger){ var en=String(res.entsorger).trim(); if(en && en.toLowerCase()!=='unbekannt'){ d.entsorger=en; d.entsorger_logo=true; } }
    if(res.hinweis && !d.notiz) d.notiz=String(res.hinweis);
    d.analyzing=false; render();
    toast(bins.length?('Erkannt: '+behaelterSummary(d)+(d.entsorger?(' · '+d.entsorger):'')):'Keine Tonnen erkannt – manuell setzen');
  }catch(err){ d.analyzing=false; render(); toast('Analyse: '+(err.message||'Fehler')); }
}

// Firmenschild / Fassade auslesen -> Firma + Adresse in den Lead schreiben
async function analyzeSign(lead, blob){
  if(!S.keys.gemini){ toast('Erst Gemini-Key in Setup'); return; }
  lead._scanning=true; renderSheet();
  var prompt=
    'Auf dem Foto ist ein Firmenschild, eine Hausfassade oder ein Eingang eines deutschen Gewerbebetriebs.\n'+
    'Lies den Firmennamen und – falls sichtbar – die Adresse (Straße, Hausnummer, PLZ, Ort) und Telefonnummer ab.\n'+
    'Nur ablesen, was wirklich im Bild steht. Felder leer lassen, wenn nicht lesbar.\n'+
    'Antworte NUR als JSON: {"firmenname":"","adresse":"","telefon":""}';
  try{
    var b64=await blobToB64(blob);
    var r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+encodeURIComponent(S.keys.gemini),{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ contents:[{parts:[{inlineData:{mimeType:'image/jpeg',data:b64}},{text:prompt}]}],
        generationConfig:{temperature:0.1,maxOutputTokens:1024,thinkingConfig:{thinkingBudget:0}} })
    });
    if(!r.ok){ var e=await r.json().catch(function(){return{};}); throw new Error((e.error&&e.error.message)||('HTTP '+r.status)); }
    var dd=await r.json();
    var txt=geminiText(dd).text;
    var m=txt&&txt.match(/\{[\s\S]*\}/);
    if(!m) throw new Error('nichts lesbar');
    var res=JSON.parse(m[0]);
    if(res.firmenname) lead.firmenname=String(res.firmenname).trim();
    if(res.adresse)    lead.adresse=String(res.adresse).trim();
    if(res.telefon && !lead.telefon) lead.telefon=String(res.telefon).trim();
    lead.enriched=true; lead._scanning=false; dedupeFlag(lead);
    await dbPut(stripRuntime(lead)); syncLead(lead); renderSheet();
    toast(res.firmenname?('Erkannt: '+res.firmenname):'Schild nicht lesbar – manuell eintragen');
  }catch(err){ lead._scanning=false; renderSheet(); toast('Schild: '+(err.message||'Fehler')); }
}

// Firma zu einer gelesenen Adresse finden (Aufkleber/Schild). Klassische Geocoding-API
// geht mit referrer-beschränkten Keys nicht -> Places Text-Suche (liefert Firma + Geo).
async function companiesAtAddress(query, biasLat, biasLng){
  if(!S.keys.google || !S.online || !query) return [];
  var bLat=(biasLat!=null)?biasLat:53.35, bLng=(biasLng!=null)?biasLng:9.92;   // Fallback: LK Harburg
  var res=await placesSearchText(query, bLat, bLng, 2500, 8);
  var top=res[0];
  if(top && top.lat!=null){                       // an der getroffenen Adresse noch die Nachbarbetriebe ziehen
    try{
      var near=await placesNearby(top.lat, top.lng, 60, 8);
      near.forEach(function(n){ if(!res.some(function(r){return r.place_id===n.place_id;})) res.push(n); });
    }catch(e){}
  }
  return res.filter(function(p){ return p.firmenname && STOP_EXCLUDE.indexOf(p.primaryType)<0; });
}

// Amtlichen LK-Harburg-Behälter-Aufkleber lesen: Volumen + Fraktion + Grundstück-Adresse,
// daraus die Tonne setzen UND die Firma an der Adresse suchen.  mode: 'draft' | 'lead'
async function scanBinLabel(blob, mode, leadId){
  if(!S.keys.gemini){ toast('Erst Gemini-Key in Setup'); return; }
  var draft = mode==='draft' ? S.draft : null;
  var lead  = mode==='lead'  ? S.leads.find(function(x){return x.id===leadId;}) : null;
  if(mode==='lead' && !lead) return;
  if(draft){ draft.labelScanning=true; render(); } else { lead._scanning=true; renderSheet(); }
  var prompt=
    'Auf dem Foto ist ein amtlicher Abfallbehälter-Aufkleber (Landkreis Harburg) auf einer Mülltonne.\n'+
    'Lies GENAU ab, was auf dem Aufkleber steht:\n'+
    '- Volumen in Litern (typisch 120, 240, 660 oder 1100)\n'+
    '- Abfallart/Fraktion: Restabfall/Restmüll, Bioabfall, Papier oder Gelber Sack/Wertstoff\n'+
    '- Behälter-Nr. (Ziffernfolge nach "Behälter-Nr.:")\n'+
    '- Grundstück-Adresse unter "Ausgegeben für das Grundstück": Ort/Ortsteil, Straße + Hausnummer, ggf. PLZ\n'+
    'Nur ablesen, was wirklich im Bild steht; unklare Felder leer lassen.\n'+
    'Antworte NUR als JSON: {"volumen":1100,"fraktion":"restmuell","behaelter_nr":"","strasse":"","hausnummer":"","plz":"","ort":""}';
  try{
    var b64=await blobToB64(blob);
    var r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+encodeURIComponent(S.keys.gemini),{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ contents:[{parts:[{inlineData:{mimeType:'image/jpeg',data:b64}},{text:prompt}]}],
        generationConfig:{temperature:0.1,maxOutputTokens:2048,thinkingConfig:{thinkingBudget:0}} })
    });
    if(!r.ok){ var e=await r.json().catch(function(){return{};}); throw new Error((e.error&&e.error.message)||('HTTP '+r.status)); }
    var dd=await r.json();
    var gt=geminiText(dd), txt=gt.text;
    var m=txt&&txt.match(/\{[\s\S]*\}/);
    if(!m) throw new Error(gt.reason==='MAX_TOKENS'?'Antwort zu lang (erneut versuchen)':(txt?('unlesbar: '+txt.slice(0,60)):'keine Antwort vom Modell'));
    var res=JSON.parse(m[0]);
    var strasse=String(res.strasse||'').trim(), hnr=String(res.hausnummer||'').trim();
    var ort=String(res.ort||'').trim(), plz=String(res.plz||'').trim(), behNr=String(res.behaelter_nr||'').trim();
    var strasseVoll=(strasse+' '+hnr).trim();
    var adresse=[strasseVoll,[plz,ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    var bin=(res.volumen||res.fraktion)?normBin({fraktion:res.fraktion,volumen:res.volumen,anzahl:1}):null;
    // Firma an der Adresse suchen (Straße + Ort als Query)
    var query=strasseVoll?(strasseVoll+(ort?(', '+ort):'')):adresse;
    var cands=[];
    try{ cands=await companiesAtAddress(query,(draft&&draft.lat)||(lead&&lead.lat),(draft&&draft.lng)||(lead&&lead.lng)); }catch(e){}

    if(draft){
      if(bin) draft.behaelter=[bin];
      draft.preset=draft.preset||{firmenname:'',adresse:'',telefon:'',website:'',place_id:'',ortsteil:''};
      if(adresse) draft.preset.adresse=adresse;
      if(behNr && (draft.notiz||'').indexOf(behNr)<0) draft.notiz=(draft.notiz?draft.notiz+' · ':'')+'Beh.-Nr. '+behNr;
      if(cands.length && !draft.preset._manual){
        var c=cands[0];
        draft.preset.firmenname=c.firmenname; draft.preset.telefon=c.telefon||''; draft.preset.website=c.website||''; draft.preset.place_id=c.place_id||'';
        if(c.adresse) draft.preset.adresse=c.adresse;
      }
      draft.companyCands=cands; draft.companyState=cands.length?'ok':'empty'; draft.showCands=false;
      draft.labelScanning=false; render();
      toast(cands.length?('Adresse + Firma: '+cands[0].firmenname):(adresse?('Adresse erkannt: '+adresse+' – Firma manuell'):'Aufkleber nicht lesbar'));
    } else {
      if(bin){ lead.behaelter=[bin]; }
      if(adresse) lead.adresse=adresse;
      if(behNr && (lead.notiz||'').indexOf(behNr)<0) lead.notiz=(lead.notiz?lead.notiz+' · ':'')+'Beh.-Nr. '+behNr;
      if(cands.length){ applyCompany(lead,cands[0]); lead._candidates=cands; }
      lead.enriched=true; lead._scanning=false; dedupeFlag(lead);
      recalcLead(lead);                 // speichert + synct + renderSheet()
      toast(cands.length?('Firma: '+cands[0].firmenname):(adresse?('Adresse: '+adresse+' – Firma manuell'):'Aufkleber nicht lesbar'));
    }
  }catch(err){
    if(draft){ draft.labelScanning=false; render(); } else { lead._scanning=false; renderSheet(); }
    toast('Aufkleber: '+(err.message||'Fehler'));
  }
}

/* ---------- GPS ----------
   Im Auto ist ein einmaliger Fix schnell veraltet („Handy noch am alten Ort").
   Lösung: dauerhaftes Live-Tracking (watchPosition, maximumAge:0) solange man
   erfasst. Die Koordinaten bleiben so immer aktuell; das Fix-Alter ist sichtbar. */
function gpsCommon(draft){
  if(!navigator.geolocation){ draft.gpsState='err'; draft.gpsMsg='Gerät ohne Standort'; return false; }
  if(!window.isSecureContext){ draft.gpsState='err'; draft.gpsMsg='Nur über https (nicht file://)'; return false; }
  if(navigator.permissions && navigator.permissions.query){
    navigator.permissions.query({name:'geolocation'}).then(function(p){
      if(p.state==='denied'){
        draft.gpsState='err';
        draft.gpsMsg='In Chrome blockiert (Standort = denied) – Schloss-Symbol → Berechtigungen → Standort → Zulassen';
        updateGpsPill(draft);
      }
    }).catch(function(){});
  }
  return true;
}
function gpsOk(draft,p){
  draft.lat=p.coords.latitude; draft.lng=p.coords.longitude;
  draft.accuracy=Math.round(p.coords.accuracy); draft.gpsState='ok'; draft.gpsMsg=''; draft.gpsTime=Date.now();
}
function gpsFail(draft,e){
  draft.gpsState='err';
  draft.gpsMsg = e && e.code===1 ? 'Standort-Freigabe verweigert – im Browser/Handy erlauben'
               : e && e.code===2 ? 'Standort nicht verfügbar'
               : 'Zeitüberschreitung – Pille antippen für neuen Versuch';
}
// Einmaliger, frischer Fix (maximumAge:0 – nie ein alter Cache-Wert)
function getGPS(draft){
  if(!gpsCommon(draft)){ render(); return; }
  draft.gpsState='wait'; render();
  navigator.geolocation.getCurrentPosition(function(p){
    var first=(draft.companyState==='idle');
    gpsOk(draft,p); render();
    if(first) maybeLookupCompany(draft);   // Firma direkt beim ersten Fix ziehen
  }, function(e){
    if(e && (e.code===3 || e.code===2)){
      navigator.geolocation.getCurrentPosition(function(p){ gpsOk(draft,p); render(); },
        function(er){ gpsFail(draft,er); render(); },
        { enableHighAccuracy:false, timeout:15000, maximumAge:0 });
    } else { gpsFail(draft,e); render(); }
  }, { enableHighAccuracy:true, timeout:15000, maximumAge:0 });
}
// Nur den Positions-Watch (neu) starten – ohne Tick/Company-Reset anzufassen.
function rearmGPSWatch(draft){
  if(S.watchId!=null){ try{ navigator.geolocation.clearWatch(S.watchId); }catch(e){} S.watchId=null; }
  try{
    S.watchId=navigator.geolocation.watchPosition(function(p){
      var first=(draft.companyState==='idle');
      gpsOk(draft,p);
      if(S.tab==='erfassen') updateGpsPill(draft);   // nur die Pille – kein Full-Render (kein Flackern)
      if(first) maybeLookupCompany(draft);
    }, function(e){
      if(draft.gpsState!=='ok'){ gpsFail(draft,e); if(S.tab==='erfassen') updateGpsPill(draft); }  // laufenden Fix bei Aussetzern behalten
    }, { enableHighAccuracy:true, timeout:20000, maximumAge:0 });
  }catch(e){}
}
// Frischen Fix ERZWINGEN (maximumAge:0) und den Watch danach neu bewaffnen.
// Heilt den Kernbug: watchPosition liefert auf vielen Handys (v.a. iOS/Chrome) nach
// einer Weile / nach Bildschirmsperre keine Updates mehr -> Standort klebt am alten Ort.
function refreshFix(draft){
  if(!navigator.geolocation || S.gpsRefreshing) return;
  S.gpsRefreshing=true;
  navigator.geolocation.getCurrentPosition(function(p){
    S.gpsRefreshing=false; gpsOk(draft,p);
    if(S.tab==='erfassen') updateGpsPill(draft);
    rearmGPSWatch(draft);
  }, function(){
    S.gpsRefreshing=false; rearmGPSWatch(draft);
  }, { enableHighAccuracy:true, timeout:15000, maximumAge:0 });
}
// Live-Tracking starten (nur im Erfassen-Tab): hält lat/lng dauerhaft aktuell.
function startGPSWatch(draft){
  if(!gpsCommon(draft)){ render(); return; }
  stopGPSWatch();
  if(draft.gpsState!=='ok') draft.gpsState='wait';
  rearmGPSWatch(draft);
  refreshFix(draft);                 // sofort einen garantiert frischen Fix holen
  // Jede Sekunde: Fix-Alter aktualisieren + veralteten Fix aktiv nachfrischen.
  if(S.gpsTick) clearInterval(S.gpsTick);
  S.gpsTick=setInterval(function(){
    if(S.tab!=='erfassen' || !S.draft) return;
    updateGpsPill(S.draft);
    var age = S.draft.gpsTime ? (Date.now()-S.draft.gpsTime) : Infinity;
    if(age>25000 && !S.gpsRefreshing) refreshFix(S.draft);   // Watch hängt -> nachfrischen
  }, 1000);
}
function stopGPSWatch(){
  if(S.watchId!=null){ try{ navigator.geolocation.clearWatch(S.watchId); }catch(e){} S.watchId=null; }
  if(S.gpsTick){ clearInterval(S.gpsTick); S.gpsTick=null; }
  S.gpsRefreshing=false;
}
function gpsAgeText(draft){
  if(draft.gpsState!=='ok'||!draft.gpsTime) return '';
  var s=Math.round((Date.now()-draft.gpsTime)/1000);
  return s<3 ? 'live' : ('vor '+(s<60?(s+' s'):(Math.round(s/60)+' min')));
}
// GPS-Pille direkt im DOM aktualisieren, ohne das ganze Formular neu zu bauen
function updateGpsPill(draft){
  var el=document.querySelector('.gps'); if(!el) return;
  var stale=draft.gpsState==='ok'&&draft.gpsTime&&(Date.now()-draft.gpsTime>12000);
  el.className='gps '+(draft.gpsState==='ok'?(stale?'':'ok'):(draft.gpsState==='err'?'err':''));
  var age=gpsAgeText(draft);
  var txt = draft.gpsState==='ok' ? ('GPS ±'+draft.accuracy+' m · '+age)
          : draft.gpsState==='err' ? ('GPS: '+(draft.gpsMsg||'nicht verfügbar'))
          : 'GPS wird ermittelt…';
  if(draft.gpsState==='ok') txt+=' · TIPPEN für neuen Fix';
  else if(draft.gpsState!=='ok') txt+=' · TIPPEN zum Aktivieren';
  el.innerHTML='<span class="dot"></span>'+esc(txt);
}

/* ---------- Google APIs ---------- */
async function placesNearby(lat,lng,radius,max,includedTypes){
  var key=S.keys.google; if(!key) throw new Error('Kein Google-Key');
  var body={ maxResultCount:(max||5), rankPreference:'DISTANCE',
      locationRestriction:{ circle:{ center:{latitude:lat,longitude:lng}, radius:(radius||75.0) } } };
  if(includedTypes && includedTypes.length) body.includedTypes=includedTypes;   // nur Zielbranchen
  var r=await fetch('https://places.googleapis.com/v1/places:searchNearby',{
    method:'POST',
    headers:{ 'Content-Type':'application/json','X-Goog-Api-Key':key,
      'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.primaryType,places.primaryTypeDisplayName,places.location' },
    body:JSON.stringify(body)
  });
  if(!r.ok){ var e=await r.json().catch(function(){return{};}); throw new Error((e.error&&e.error.message)||'Places fehlgeschlagen'); }
  var d=await r.json();
  return (d.places||[]).map(function(p){
    return { place_id:p.id, firmenname:(p.displayName&&p.displayName.text)||'',
      adresse:p.formattedAddress||'', telefon:p.nationalPhoneNumber||'',
      website:p.websiteUri||'', typ:(p.primaryTypeDisplayName&&p.primaryTypeDisplayName.text)||'',
      primaryType:p.primaryType||'',
      lat:(p.location&&p.location.latitude), lng:(p.location&&p.location.longitude) };
  });
}
// Text-Suche (Places New) – für Kategorien ohne eigenen Typ, z.B. Pflegeheime
async function placesSearchText(query,lat,lng,radius,max){
  var key=S.keys.google; if(!key) throw new Error('Kein Google-Key');
  var r=await fetch('https://places.googleapis.com/v1/places:searchText',{
    method:'POST',
    headers:{ 'Content-Type':'application/json','X-Goog-Api-Key':key,
      'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.primaryType,places.primaryTypeDisplayName,places.location' },
    body:JSON.stringify({ textQuery:query, maxResultCount:(max||10),
      locationBias:{ circle:{ center:{latitude:lat,longitude:lng}, radius:(radius||2500) } } })
  });
  if(!r.ok){ var e=await r.json().catch(function(){return{};}); throw new Error((e.error&&e.error.message)||'Text-Suche fehlgeschlagen'); }
  var d=await r.json();
  return (d.places||[]).map(function(p){
    return { place_id:p.id, firmenname:(p.displayName&&p.displayName.text)||'',
      adresse:p.formattedAddress||'', telefon:p.nationalPhoneNumber||'',
      website:p.websiteUri||'', typ:(p.primaryTypeDisplayName&&p.primaryTypeDisplayName.text)||'',
      primaryType:p.primaryType||'',
      lat:(p.location&&p.location.latitude), lng:(p.location&&p.location.longitude) };
  });
}

/* ---------- Firma live beim Erfassen (Ist-Aufnahme) ----------
   Sobald ein GPS-Fix da ist, holen wir die nächstgelegenen Betriebe und
   zeigen die Firma schon VOR dem Speichern an – änderbar per Auswahl/Freitext.
   Nur EIN Places-Call pro Draft (Kosten), zusätzlich manuell auslösbar. */
function maybeLookupCompany(draft){
  if(draft.companyState!=='idle') return;   // pro Draft nur einmal automatisch
  lookupCompany(draft);
}
async function lookupCompany(draft){
  if(draft.lat==null){ toast('Erst GPS aktivieren'); return; }
  if(!S.keys.google){ draft.companyState='err'; draft.companyMsg='Kein Google-Key (Setup)'; render(); return; }
  if(!S.online){ draft.companyState='err'; draft.companyMsg='Offline – Firma später im Lead'; render(); return; }
  draft.companyState='loading'; render();
  try{
    var cands=await placesNearby(draft.lat,draft.lng,90,6);
    cands=cands.filter(function(p){ return p.firmenname && STOP_EXCLUDE.indexOf(p.primaryType)<0; });
    draft.companyCands=cands;
    if(cands.length && !(draft.preset&&draft.preset._manual)){
      var c=cands[0];
      draft.preset={ firmenname:c.firmenname, adresse:c.adresse, telefon:c.telefon||'',
                     website:c.website||'', place_id:c.place_id, ortsteil:(draft.preset&&draft.preset.ortsteil)||'' };
    }
    draft.companyState=cands.length?'ok':'empty';
  }catch(e){ draft.companyState='err'; draft.companyMsg=(e&&e.message)||'Fehler'; }
  safeRender();   // nicht neu rendern, wenn der Nutzer gerade Firma/Adresse tippt
}
function pickDraftCompany(i){
  var d=S.draft, c=d.companyCands&&d.companyCands[i]; if(!c) return;
  d.preset={ firmenname:c.firmenname, adresse:c.adresse, telefon:c.telefon||'',
             website:c.website||'', place_id:c.place_id, ortsteil:(d.preset&&d.preset.ortsteil)||'' };
  d.showCands=false; render();
}

/* ---------- Anreicherung (offline-first Outbox) ---------- */
async function enrich(lead){
  if(!S.online || !S.keys.google) return;
  // Ohne Koordinaten (z.B. Lead nur aus Aufkleber-Adresse) keine Nearby-Suche möglich
  // -> als erledigt markieren, sonst endlose Retry-Schleife mit leeren Koordinaten.
  if(lead.lat==null || lead.lng==null){ lead.enriched=true; await dbPut(stripRuntime(lead)); return; }
  try{
    // Places-only: die Nearby-Antwort liefert Firma UND formatierte Adresse.
    // (Die klassische Geocoding-API akzeptiert keine referrer-beschränkten Keys.)
    var cands = await placesNearby(lead.lat,lead.lng);
    lead._candidates = cands;
    if(cands.length){
      lead.adresse = cands[0].adresse || lead.adresse;
      if(!lead.firmenname) applyCompany(lead,cands[0]);  // nächster Treffer auto, im Detail änderbar
    }
    lead.enriched = true;
    dedupeFlag(lead);
    await dbPut(stripRuntime(lead));
    syncLead(lead);
  }catch(err){ /* bleibt pending, nächster online-Versuch */ }
}
// Anreicherung: Website-Impressum -> Ansprechpartner (GF/Inhaber) + E-Mail (§5 DDG/TMG, in DE Pflichtangabe)
async function enrichImpressum(id){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  if(!S.online){ toast('Anreichern braucht Internet'); return; }
  if(!l.website && l.lat!=null && S.keys.google){ toast('Firma/Website wird gesucht…'); try{ await enrich(l); renderSheet(); }catch(e){} }
  if(!l.website){ toast('Keine Website – oben eintragen'); return; }
  toast('Impressum wird gelesen…');
  try{
    var base=httpize(l.website).replace(/\/+$/,''), host=hostOf(l.website);
    var proxy=function(u){ return 'https://corsproxy.io/?url='+encodeURIComponent(u); };
    var getT=function(u){ return Promise.race([ fetch(proxy(u)).then(function(r){return r.ok?r.text():'';}),
      new Promise(function(res){ setTimeout(function(){res('');},9000); }) ]); };
    var home=''; try{ home=await getT(base); }catch(e){}
    var impUrl=''; var m=home.match(/href\s*=\s*["']([^"']*impressum[^"']*)["']/i);
    if(m){ impUrl=m[1]; if(!/^https?:/i.test(impUrl)) impUrl=base+'/'+impUrl.replace(/^\//,''); } else impUrl=base+'/impressum';
    var imp=''; try{ imp=await getT(impUrl); }catch(e){}
    var raw=imp+' '+home;
    var plain=raw.replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ');
    var emails=[];
    (raw.match(/mailto:([^"'?>\s]+@[^"'?>\s]+)/gi)||[]).forEach(function(x){ emails.push(x.replace(/mailto:/i,'')); });
    (plain.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)||[]).forEach(function(x){ emails.push(x); });
    emails=emails.map(function(e){return e.trim().toLowerCase();}).filter(function(e){ return !/\.(png|jpe?g|gif|webp|svg)$/.test(e) && !/(sentry|wixpress|example\.|@2x|godaddy|cloudflare|schema\.org)/.test(e); });
    var dom=(host||'').split('.')[0];
    var email=emails.find(function(e){ return dom && e.split('@')[1] && e.split('@')[1].indexOf(dom)>=0; }) || emails.find(function(e){return /^(info|kontakt|office|mail|hallo)@/.test(e);}) || emails[0] || '';
    var gf=''; var g=plain.match(/(?:Gesch[aä]ftsf[uü]hrer(?:in)?|Inhaber(?:in)?|Vertreten durch|Vertretungsberechtigte[rn]?)\s*:?\s*(?:Herr |Frau )?([A-ZÄÖÜ][a-zäöüß.\-]+(?:\s+[A-ZÄÖÜ][a-zäöüß.\-]+){1,2})/);
    if(g) gf=g[1].trim();
    var got=[];
    if(email && !l.ap_email){ l.ap_email=email; got.push('E-Mail'); }
    if(gf && !l.ap_name){ l.ap_name=gf; got.push('Ansprechpartner'); }
    if(got.length){ l.updated_at=Date.now(); dbPut(stripRuntime(l)).then(function(){ syncLead(l); }); pushHist(l,'notiz','Angereichert (Impressum): '+got.join(' + ')+(email?(' · '+email):'')); renderSheet(); toast('✓ '+got.join(' + ')+' übernommen'); }
    else if(email||gf){ renderSheet(); toast('Gefunden ('+(gf||email)+'), aber Felder schon belegt'); }
    else toast('Nichts gefunden (Seite blockt / Impressum als PDF?) – manuell eintragen');
  }catch(e){ toast('Anreichern fehlgeschlagen'); }
}
function applyCompany(lead,c){
  lead.firmenname=c.firmenname; lead.telefon=c.telefon; lead.website=c.website;
  lead.place_id=c.place_id; lead.typ=c.typ;
  if(c.adresse) lead.adresse=c.adresse;
}
function dedupeFlag(lead){
  if(!lead.adresse) return;
  var dup=S.leads.find(function(l){ return l.id!==lead.id && l.adresse && norm(l.adresse)===norm(lead.adresse); });
  lead.duplikat = !!dup;
}
function norm(s){ return String(s).toLowerCase().replace(/[^a-z0-9]/g,''); }

async function processOutbox(){
  var pend = S.leads.filter(function(l){ return !l.enriched; });
  for(var i=0;i<pend.length;i++){ await enrich(pend[i]); }
  var unsynced = S.leads.filter(function(l){ return l.sync_state==='pending'; });
  for(var j=0;j<unsynced.length;j++){ await syncLead(unsynced[j]); }
  if(pend.length||unsynced.length) render();
}

/* ---------- Supabase: zentraler Team-Sync (push + pull) ---------- */
function supaKeyClean(){ return (S.keys.supaKey||'').replace(/\s+/g,''); }  // Copy-Paste-Müll raus
function supaOn(){ return !!((S.keys.supaUrl||'').replace(/\s+/g,'') && supaKeyClean()); }
function supaBase(){
  return (S.keys.supaUrl||'').replace(/\s+/g,'').replace(/\/+$/,'').replace(/^(?!https?:\/\/)/i,'https://');
}
function supaHeaders(extra){
  var key=supaKeyClean();
  var h={ 'apikey':key, 'Authorization':'Bearer '+key };
  if(extra) for(var k in extra) h[k]=extra[k];
  return h;
}
// rendert nur, wenn der Nutzer nicht gerade in einem Eingabefeld tippt
function safeRender(){
  var a=document.activeElement;
  if(a && a.dataset && (a.dataset.edit||a.dataset.act==='note'||a.dataset.act==='manualfirma'||a.dataset.act==='manualadr'||a.dataset.key)) return;
  render();
}
async function syncLead(lead){
  lead.updated_at = Date.now();                         // letzte Änderung (für Konfliktauflösung)
  if(!supaOn()){ lead.sync_state='local'; await dbPut(stripRuntime(lead)); return; }
  if(!S.online){ lead.sync_state='pending'; await dbPut(stripRuntime(lead)); return; }
  try{
    var base=supaBase();
    if(lead.photoBlob && !lead.foto_url){
      var path=lead.id+'.jpg';
      var up=await fetch(base+'/storage/v1/object/lead-photos/'+path,{
        method:'POST', headers:supaHeaders({'Content-Type':'image/jpeg','x-upsert':'true'}), body:lead.photoBlob });
      if(up.ok) lead.foto_url=base+'/storage/v1/object/public/lead-photos/'+path;
    }
    var doPost=function(){ return fetch(base+'/rest/v1/leads?on_conflict=id',{
      method:'POST', headers:supaHeaders({'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'}),
      body:JSON.stringify([toRow(lead)]) }); };
    var res=await doPost();
    if(!res.ok){
      var et=await res.text();
      // CRM-Spalten fehlen serverseitig? -> einmalig auf lokal-first zurückschalten und erneut pushen
      if(res.status===400 && S.crmSync!==false && /column|PGRST204|schema cache|Could not find/i.test(et)){
        S.crmSync=false; res=await doPost(); et = res.ok ? null : await res.text();
      }
      if(res.ok){ lead.sync_state='synced'; S.lastSyncError=null; }
      else { lead.sync_state='pending'; S.lastSyncError='Push '+res.status+': '+((et||'')+'').slice(0,160); }
    } else { lead.sync_state='synced'; S.lastSyncError=null; }
  }catch(e){ lead.sync_state='pending'; S.lastSyncError='Netzwerk: '+(e&&e.message||'Fehler'); }
  await dbPut(stripRuntime(lead));
}
function toRow(l){
  var row={ id:l.id, created_at:new Date(l.created_at).toISOString(),
    updated_at:new Date(l.updated_at||l.created_at).toISOString(), abfuhrtag:l.abfuhrtag,
    lat:l.lat, lng:l.lng, accuracy:l.accuracy, foto_url:l.foto_url||null,
    fraktion:l.fraktion, volumen:l.volumen, anzahl:l.anzahl, entsorger_logo:l.entsorger_logo, entsorger:l.entsorger||null,
    behaelter:l.behaelter||null,
    firmenname:l.firmenname||null, telefon:l.telefon||null, website:l.website||null,
    place_id:l.place_id||null, adresse:l.adresse||null, notiz:l.notiz||null,
    status:l.status, score:l.score, hot_lead:l.hot_lead,
    // int-Spalten -> auf ganze Euro runden (sonst lehnt Postgres Kommazahlen mit 400 ab)
    kosten_monat:rnd(l.kosten_monat), ersparnis_monat:rnd(l.ersparnis_monat), ersparnis_jahr:rnd(l.ersparnis_jahr) };
  // Kontakt-/CRM-Felder mitsynchronisieren, SOBALD die Spalten existieren. Fehlen sie serverseitig,
  // schaltet syncLead S.crmSync=false (dann fallen diese Felder weg -> lokal-first, kein Sync-Bruch).
  if(S.crmSync!==false){
    row.email=l.email||null; row.wiedervorlage=l.wiedervorlage||null; row.naechste_aktion=l.naechste_aktion||null;
    row.ap_name=l.ap_name||null; row.ap_rolle=l.ap_rolle||null; row.ap_telefon=l.ap_telefon||null; row.ap_email=l.ap_email||null;
    row.historie=(l.historie&&l.historie.length)?l.historie:null;
  }
  return row;
}
function rnd(n){ return (n==null||isNaN(n))?null:Math.round(n); }
function fromRow(rl, local){
  return {
    id:rl.id,
    created_at: rl.created_at?Date.parse(rl.created_at):Date.now(),
    updated_at: rl.updated_at?Date.parse(rl.updated_at):Date.now(),
    abfuhrtag:rl.abfuhrtag, lat:rl.lat, lng:rl.lng, accuracy:rl.accuracy,
    foto_url:rl.foto_url||null, photoBlob:(local&&local.photoBlob)||null, photos:(local&&local.photos)||[],
    angebote:(local&&local.angebote)||[],   // Angebote nur lokal – beim Sync-Pull nicht verlieren
    behaelter:rl.behaelter||null, fraktion:rl.fraktion, volumen:rl.volumen, anzahl:rl.anzahl,
    entsorger_logo:rl.entsorger_logo, entsorger:rl.entsorger||'',
    firmenname:rl.firmenname||'', telefon:rl.telefon||'', website:rl.website||'',
    place_id:rl.place_id||'', adresse:rl.adresse||'', notiz:rl.notiz||'',
    status:rl.status||'neu', score:rl.score, hot_lead:rl.hot_lead,
    kosten_monat:rl.kosten_monat, ersparnis_monat:rl.ersparnis_monat, ersparnis_jahr:rl.ersparnis_jahr,
    // CRM-Felder: 'feld' in rl unterscheidet „Spalte existiert (auch null=gelöscht) -> Remote gewinnt"
    // von „Spalte fehlt (nicht migriert) -> lokalen Wert behalten". Sonst käme eine echte Löschung wieder.
    email:('email' in rl)?(rl.email||''):((local&&local.email)||''),
    wiedervorlage:('wiedervorlage' in rl)?(rl.wiedervorlage||null):((local&&local.wiedervorlage)||null),
    naechste_aktion:('naechste_aktion' in rl)?(rl.naechste_aktion||''):((local&&local.naechste_aktion)||''),
    ap_name:('ap_name' in rl)?(rl.ap_name||''):((local&&local.ap_name)||''),
    ap_rolle:('ap_rolle' in rl)?(rl.ap_rolle||''):((local&&local.ap_rolle)||''),
    ap_telefon:('ap_telefon' in rl)?(rl.ap_telefon||''):((local&&local.ap_telefon)||''),
    ap_email:('ap_email' in rl)?(rl.ap_email||''):((local&&local.ap_email)||''),
    historie:('historie' in rl)?(rl.historie||[]):((local&&local.historie)||[]),
    enriched:true, sync_state:'synced', duplikat:false
  };
}
// alle Leads vom Server holen und in die lokale Liste mergen (Team-Pool)
async function pullLeads(){
  if(!supaOn() || !S.online) return 0;
  var r=await fetch(supaBase()+'/rest/v1/leads?select=*', { headers:supaHeaders() });
  if(!r.ok) throw new Error('pull '+r.status);
  var rows=await r.json(), added=0;
  for(var i=0;i<rows.length;i++){
    var rl=rows[i];
    var local=S.leads.find(function(x){return x.id===rl.id;});
    var rU=rl.updated_at?Date.parse(rl.updated_at):0;
    var lU=local?(local.updated_at||local.created_at||0):0;
    if(local && lU>=rU) continue;           // lokale Version ist neuer/gleich -> behalten
    var merged=fromRow(rl, local);
    await dbPut(stripRuntime(merged));
    if(local){ for(var k in merged){ if(k!=='photoBlob'&&k!=='photos') local[k]=merged[k]; } }
    else { S.leads.push(merged); added++; }
  }
  // woanders gelöschte Leads auch hier entfernen: synchronisierte Leads, die in der Cloud fehlen
  var remoteIds={}; rows.forEach(function(r){ remoteIds[r.id]=1; });
  var removed=[];
  S.leads=S.leads.filter(function(l){
    if(l.sync_state==='synced' && !remoteIds[l.id]){ removed.push(l.id); return false; }
    return true;
  });
  removed.forEach(function(id){ if(S.modal===id) S.modal=null; dbDel(id); });
  S.leads.sort(function(a,b){ return (b.created_at||0)-(a.created_at||0); });
  return added;
}
// kompletter Abgleich: erst lokale Änderungen hoch, dann Team-Leads runter
async function syncAll(opts){
  if(!supaOn() || !S.online) return;
  var pend=S.leads.filter(function(l){ return l.sync_state!=='synced'; });
  for(var i=0;i<pend.length;i++){ await syncLead(pend[i]); }
  var stillPending=S.leads.filter(function(l){ return l.sync_state!=='synced'; }).length;
  var pushed=pend.length-stillPending;
  var added=0;
  try{ added=await pullLeads(); }catch(e){ S.lastSyncError='Pull fehlgeschlagen ('+(e&&e.message||'Fehler')+') — URL + Anon-Key in Setup prüfen (sauber einfügen, keine Leerzeichen).'; }
  safeRender();
  if(opts&&opts.toast){
    toast('▲ '+pushed+' hochgeladen'+(stillPending?(' · '+stillPending+' Fehler!'):'')+' · ▼ '+added+' geladen');
  }
}
function stripRuntime(l){
  var c={}; for(var k in l){ if(k.charAt(0)!=='_') c[k]=l[k]; } return c;  // alle _runtime-Felder raus
}

/* ---------- Lead speichern ---------- */
async function saveDraft(){
  var d=S.draft;
  if(!d.photoBlob){ toast('Bitte zuerst ein Foto aufnehmen'); return; }
  var cost=kalkulation(d);
  var pre=d.preset;
  var dom=dominantContainer(d);   // Primärfelder = teuerster Behälter (Abwärtskompatibilität)
  var lead={
    id:'lead-'+Date.now()+'-'+Math.floor(Math.random()*1e4),
    created_at:Date.now(), updated_at:Date.now(), abfuhrtag:new Date().toISOString().slice(0,10),
    lat:d.lat, lng:d.lng, accuracy:d.accuracy, photoBlob:d.photoBlob, photos:[],
    behaelter:d.behaelter.map(function(c){return {fraktion:c.fraktion,volumen:c.volumen,anzahl:c.anzahl||1};}),
    fraktion:dom.fraktion, volumen:dom.volumen, anzahl:totalAnzahl(d), entsorger_logo:d.entsorger_logo, entsorger:d.entsorger||'',
    firmenname:pre?pre.firmenname:'', telefon:pre?pre.telefon:'', website:pre?pre.website:'',
    place_id:pre?pre.place_id:'', adresse:pre?pre.adresse:'', typ:'', ortsteil:pre?pre.ortsteil:'',
    notiz:d.notiz, status:'neu', score:scoreLead(d), hot_lead:isHot(d), rhythmus:d.rhythmus||'14t', rabatt:(d.rabatt!=null?d.rabatt:0.10),
    kosten_monat:cost.kosten_monat, ersparnis_monat:cost.ersparnis_monat, ersparnis_jahr:cost.ersparnis_jahr,
    rss_marge_monat:cost.rss_marge_monat, rss_marge_jahr:cost.rss_marge_jahr,
    // schon beim Erfassen per Places gefunden? -> enriched, kein zweiter API-Call nötig
    enriched:(pre&&pre.place_id)?true:false, sync_state: supaOn()?'pending':'local', duplikat:false
  };
  if(d.companyCands&&d.companyCands.length) lead._candidates=d.companyCands;  // „Andere Firma" im Detail
  await dbPut(stripRuntime(lead));
  S.leads.unshift(lead);
  var wasStop=!!d.fromStop;
  S.draft=freshDraft();
  if(wasStop){
    S.tab='heute';                                  // nach Route-Stop zurück zur Route
    render(); toast(lead.hot_lead?'🔥 Hot Lead gespeichert':'Lead gespeichert');
    dedupeFlag(lead); syncLead(lead);
  } else {
    S.tab='erfassen';                               // bereit für die nächste Tonne
    S.lastSaved={ id:lead.id, score:lead.score, hot:lead.hot_lead };
    render();
    if(S.tab==='erfassen') startGPSWatch(S.draft);  // Tracking für die nächste Tonne
    toast(lead.hot_lead?'🔥 Hot Lead gespeichert':'Lead gespeichert');
    if(lead.enriched){ dedupeFlag(lead); syncLead(lead); }
    else enrich(lead).then(render);                 // nur wenn Firma noch fehlt
  }
}

/* =====================================================================
   RENDER
   ===================================================================== */
function render(){
  // Nav
  document.querySelectorAll('nav button').forEach(function(b){
    b.classList.toggle('on', b.dataset.tab===S.tab);
  });
  document.getElementById('net').className='net'+(S.online?'':' off');
  document.getElementById('net').textContent=S.online?'Online':'Offline';

  if(S.tab==='heute') renderHeute();
  else if(S.tab==='erfassen') renderErfassen();
  else if(S.tab==='leads') renderLeads();
  else if(S.tab==='karte') renderKarte();
  else if(S.tab==='settings') renderSettings();

  renderSheet();
  renderReminderOverlay();
  renderFollowupOverlay();
  updateNavBadge();
}

function renderErfassen(){
  var d=S.draft||(S.draft=freshDraft());
  var sc=scoreLead(d), hot=isHot(d), cost=costEstimate(d);
  var img=d.photoBlob?URL.createObjectURL(d.photoBlob):null;

  var stale = d.gpsState==='ok' && d.gpsTime && (Date.now()-d.gpsTime>12000);
  var gpsCls = d.gpsState==='ok'?(stale?'':'ok'):(d.gpsState==='err'?'err':'');
  var gpsTxt = d.gpsState==='ok' ? ('GPS ±'+d.accuracy+' m · '+gpsAgeText(d))
            : d.gpsState==='err' ? ('GPS: '+(d.gpsMsg||'nicht verfügbar'))
            : 'GPS wird ermittelt…';
  var gpsHint = d.gpsState==='ok' ? ' · TIPPEN für neuen Fix' : ' · TIPPEN zum Aktivieren';

  // Route-Stop-Banner bleibt oben; die Auto-Firma zeigen wir unten im Firma-Block.
  var preBanner = (d.preset && d.fromStop) ?
    ('<div style="border:2px solid var(--ink);background:var(--ink);color:var(--paper);padding:12px 14px;margin-bottom:14px">'+
      '<div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#bbb">Route-Stop · '+esc((d.preset.ortsteil||'').split(' (')[0])+'</div>'+
      '<div style="font-weight:800;font-size:16px;text-transform:uppercase;margin-top:2px">'+esc(d.preset.firmenname)+'</div>'+
      '<div style="font-size:12px;color:#ccc">'+esc(d.preset.adresse||'')+'</div>'+
      '<button data-act="clearpreset" style="margin-top:8px;background:var(--paper);color:var(--ink);font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:6px 10px">Stop entfernen</button>'+
    '</div>') : '';

  var savedBanner = S.lastSaved ?
    ('<div style="border:2px solid #1a7d34;background:#eafaef;padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px">'+
      '<div style="font-weight:800;font-size:14px;flex:1">✓ Lead gespeichert'+(S.lastSaved.hot?' · 🔥 Hot':'')+' · Score '+S.lastSaved.score+'</div>'+
      '<button data-act="openlast" style="background:#1a7d34;color:#fff;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:8px 10px">Öffnen</button>'+
      '<button data-act="dismisslast" style="border:1.5px solid #1a7d34;color:#1a7d34;font-size:13px;font-weight:800;padding:8px 11px">×</button>'+
    '</div>') : '';

  var html=''+
  '<div class="screen">'+
    '<h1 class="t">Tonne<br>erfassen</h1>'+
    '<div class="sub">Foto → GPS → Firma (automatisch) → Tonnen prüfen → speichern.<br>Oder: <b>Behälter-Aufkleber scannen/hochladen</b> → Adresse &amp; Firma automatisch.</div>'+
    savedBanner+
    preBanner+

    '<div class="shot">'+
      (img?('<img src="'+img+'"/><button class="retake" data-act="retake">Neu</button>')
          :('<div class="cam">◎</div><div class="ct">Foto aufnehmen</div>'))+
      '<input type="file" accept="image/*" capture="environment" data-act="photo"/>'+
    '</div>'+

    // Vorher gemachte Fotos verwenden (ohne capture -> öffnet die Galerie statt Kamera)
    '<label class="cta ghost" style="margin-top:8px;cursor:pointer;display:flex;justify-content:center">📁 Foto aus Galerie wählen'+
      '<input type="file" accept="image/*" data-act="photogallery" style="display:none"/></label>'+

    (d.photoBlob && S.keys.gemini ?
      ('<button class="mic'+(d.analyzing?' rec':'')+'" data-act="analyze"'+(d.analyzing?' disabled':'')+'>'+
        (d.analyzing?'🔍 Bild wird analysiert…':'🔍 Tonnen aus Foto erkennen')+'</button>') : '')+

    // Behälter-Aufkleber (LK Harburg) scannen/hochladen -> Adresse & Firma & Tonne automatisch.
    // Ohne capture -> Kamera ODER vorhandenes Foto aus der Galerie (Lead aus Aufkleber erstellen).
    (S.keys.gemini ?
      ('<label class="cta ghost" style="margin-top:8px;cursor:pointer;display:flex;justify-content:center">'+
        (d.labelScanning?'🏷️ Aufkleber wird gelesen…':'🏷️ Behälter-Aufkleber scannen/hochladen → Adresse & Firma')+
        '<input type="file" accept="image/*" data-act="scanlabel" style="display:none"'+(d.labelScanning?' disabled':'')+'/></label>') : '')+

    '<div class="gps '+gpsCls+'" data-act="gps"><span class="dot"></span>'+esc(gpsTxt+gpsHint)+'</div>'+
    (d.gpsState==='err' ?
      ('<div class="note" style="border:1.5px solid var(--hot);padding:10px 12px;margin-top:0">'+
        '<b>Standort in Chrome freigeben:</b><br>'+
        '• Beim ersten Mal fragt Chrome „Standort zulassen?" → <b>Zulassen</b>.<br>'+
        '• Schon abgelehnt? Oben in der Adressleiste auf <b>🔒 / ⋮ → Berechtigungen → Standort → Zulassen</b>, Seite neu laden.<br>'+
        '• <b>iPhone:</b> zusätzlich Einstellungen → Datenschutz → Ortungsdienste <b>AN</b> und für <b>Chrome</b> „Beim Verwenden".<br>'+
        '• <b>Android:</b> Einstellungen → Standort <b>AN</b>; App-Berechtigung für Chrome auf „Zulassen".<br>'+
        'Danach oben auf die GPS-Leiste tippen. (Speichern geht auch ohne GPS — aber Firma/Adresse braucht den Standort.)</div>') : '')+

    firmaBlock(d)+

    '<span class="lab">Tonnen vor Ort'+(d.behaelter.length>1?(' · '+totalAnzahl(d)+' gesamt'):'')+'</span>'+
    d.behaelter.map(binBlock).join('')+
    '<button class="cta ghost" data-act="addbin" style="margin-top:0">+ Weitere Tonne (andere Größe)</button>'+

    '<span class="lab">Entsorger</span>'+
    (d.entsorger?('<div class="toggle on" style="margin-bottom:8px"><span>Erkannt: '+esc(d.entsorger)+'</span><span style="font-size:11px">aus Foto</span></div>'):'')+
    '<div class="toggle'+(d.entsorger_logo?' on':'')+'" data-act="logo">'+
      '<span>'+(d.entsorger_logo?'Logo/Aufdruck sichtbar':'Kein Logo / unklar')+'</span><span class="sw"><i></i></span></div>'+

    '<span class="lab">Notiz</span>'+
    '<textarea data-act="note" placeholder="Freitext oder Sprachnotiz…">'+esc(d.notiz)+'</textarea>'+
    '<div class="row two" style="margin-top:8px">'+
      '<button class="mic" style="margin-top:0" data-act="mic">🎤 In App aufnehmen</button>'+
      '<button class="mic" style="margin-top:0" data-act="dictate">⌨️ Tastatur-Diktat</button>'+
    '</div>'+
    '<div class="note"><b>Am zuverlässigsten</b> (jedes Handy): „Tastatur-Diktat" tippen → dann das <b>🎤 auf der Handy-Tastatur</b> drücken und sprechen. „In App aufnehmen" geht nur, wo der Browser es unterstützt (v. a. Android).</div>'+

    '<div class="preview">'+
      '<div class="ph"><span>Live-Kalkulation · 14-täglich</span>'+(hot?'<span class="hotflag">🔥 Hot Lead</span>':'')+'</div>'+
      '<div class="pb">'+
        '<div class="prow"><span>Kommunalkosten heute / Mt</span><b>'+eur(cost.kosten_monat)+'</b></div>'+
        '<div class="prow"><span>Kunde spart / Jahr (10 %)</span><b>'+eur(cost.ersparnis_jahr)+'</b></div>'+
        '<div class="prow big"><span>RSS-Marge / Jahr</span><b>'+eur(cost.rss_marge_jahr)+'</b></div>'+
      '</div>'+
    '</div>'+

    '<button class="cta" data-act="save">Lead speichern ▸</button>'+
  '</div>';
  $app.innerHTML=html;
}
/* Firma-Block im Erfassen: zeigt die per Places gefundene Firma schon vor dem
   Speichern – auswählbar (mehrere Treffer) oder per Freitext überschreibbar. */
function firmaBlock(d){
  if(d.fromStop) return '';                       // Route-Stop hat oben schon sein Banner
  var st=d.companyState;
  var hasGps=d.lat!=null;
  var pre=d.preset=d.preset||{firmenname:'',adresse:'',telefon:'',website:'',place_id:'',ortsteil:''};
  var head='<span class="lab">Firma &amp; Adresse</span>';

  // Statuszeile (Automatik-Feedback über den immer sichtbaren Feldern)
  var status='';
  if(st==='loading') status='<div class="note" style="margin:0 0 8px">🔎 Firma wird am Standort gesucht…</div>';
  else if(st==='err') status='<div class="note" style="border:1.5px solid var(--hot);margin:0 0 8px">Firma: '+esc(d.companyMsg||'Fehler')+'</div>';
  else if(st==='empty') status='<div class="note" style="margin:0 0 8px">Kein Betrieb automatisch gefunden – Namen unten eintragen.</div>';

  // Immer editierbare Felder: Automatik füllt vor, manuell jederzeit überschreibbar
  var fields=
    '<input class="txt" style="margin:0 0 8px" data-act="manualfirma" value="'+esc(pre.firmenname||'')+'" placeholder="Firmenname (automatisch oder manuell)"/>'+
    '<input class="txt" style="margin:0 0 8px" data-act="manualadr" value="'+esc(pre.adresse||'')+'" placeholder="Adresse (Straße, Ort)"/>';

  // Auswahl-Liste (mehrere Betriebe an Standort/Adresse)
  var candList = (d.showCands && d.companyCands && d.companyCands.length) ?
    ('<div style="border:1.5px solid var(--ink);margin-bottom:8px">'+
      d.companyCands.map(function(c,i){
        var on=pre&&pre.place_id&&pre.place_id===c.place_id;
        return '<div data-act="dpickco" data-i="'+i+'" style="padding:10px 12px;'+(i?'border-top:1.5px solid var(--ink);':'')+(on?'background:var(--ink);color:var(--paper)':'')+'">'+
          '<b style="font-size:13px">'+esc(c.firmenname||'?')+'</b>'+
          '<div style="font-size:11px;opacity:.8">'+esc(c.adresse||'')+(c.typ?(' · '+esc(c.typ)):'')+'</div></div>';
      }).join('')+'</div>') : '';

  var buttons='<div class="row two" style="margin-top:0">'+
    ((d.companyCands&&d.companyCands.length>1)?
      '<button class="chip" data-act="togglecands">'+(d.showCands?'Auswahl schließen':'Andere Firma ('+d.companyCands.length+')')+'</button>':
      '<button class="chip" data-act="findco"'+(hasGps?'':' disabled')+'>'+(st==='loading'?'… sucht':'🔎 Firma am Standort')+'</button>')+
    '<button class="chip" data-act="clearco">✎ Felder leeren</button>'+
    '</div>';

  return head+'<div style="margin-bottom:8px">'+status+fields+candList+buttons+'</div>';
}
function binBlock(c,i){
  var d=S.draft, multi=d.behaelter.length>1;
  var head = multi ?
    ('<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
      '<b style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase">Tonne '+(i+1)+'</b>'+
      '<button data-act="delbin" data-i="'+i+'" style="border:1.5px solid var(--hot);color:var(--hot);font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:4px 8px">Entfernen</button>'+
    '</div>') : '';
  var frakChips='<div class="row">'+ Object.keys(FRAKTION).map(function(k){
      var f=FRAKTION[k];
      return '<button class="chip'+(c.fraktion===k?' on':'')+'" data-act="frak" data-i="'+i+'" data-v="'+k+'">'+
        '<span class="swatch" style="background:'+f.sw+'"></span>'+f.label+'</button>';
    }).join('')+'</div>';
  var volChips='<div class="row" style="margin-top:8px">'+ VOLUMEN.map(function(v){
      return '<button class="chip'+(c.volumen===v?' on':'')+'" data-act="vol" data-i="'+i+'" data-v="'+v+'">'+v+'</button>';
    }).join('')+'</div>';
  var stepper='<div class="step" style="margin-top:8px">'+
      '<button data-act="anz" data-i="'+i+'" data-v="-1">−</button>'+
      '<div class="val">'+(c.anzahl||1)+'×</div>'+
      '<button data-act="anz" data-i="'+i+'" data-v="1">+</button>'+
    '</div>';
  return '<div style="border:1.5px solid var(--ink);padding:12px;margin-bottom:10px">'+head+frakChips+volChips+stepper+'</div>';
}
// Bin-Editor im Lead-Detail (bearbeitet einen bestehenden Lead statt des Drafts)
function binBlockLead(l,c,i){
  var multi=containersOf(l).length>1;
  var head = multi ?
    ('<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
      '<b style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase">Tonne '+(i+1)+'</b>'+
      '<button data-act="ldelbin" data-id="'+l.id+'" data-i="'+i+'" style="border:1.5px solid var(--hot);color:var(--hot);font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:4px 8px">Entfernen</button>'+
    '</div>') : '';
  var frakChips='<div class="row">'+ Object.keys(FRAKTION).map(function(k){
      var f=FRAKTION[k];
      return '<button class="chip'+(c.fraktion===k?' on':'')+'" data-act="lfrak" data-id="'+l.id+'" data-i="'+i+'" data-v="'+k+'">'+
        '<span class="swatch" style="background:'+f.sw+'"></span>'+f.label+'</button>';
    }).join('')+'</div>';
  var volChips='<div class="row" style="margin-top:8px">'+ VOLUMEN.map(function(v){
      return '<button class="chip'+(c.volumen===v?' on':'')+'" data-act="lvol" data-id="'+l.id+'" data-i="'+i+'" data-v="'+v+'">'+v+'</button>';
    }).join('')+'</div>';
  var stepper='<div class="step" style="margin-top:8px">'+
      '<button data-act="lanz" data-id="'+l.id+'" data-i="'+i+'" data-v="-1">−</button>'+
      '<div class="val">'+(c.anzahl||1)+'×</div>'+
      '<button data-act="lanz" data-id="'+l.id+'" data-i="'+i+'" data-v="1">+</button>'+
    '</div>';
  return '<div style="border:1.5px solid var(--ink);padding:12px;margin-bottom:10px">'+head+frakChips+volChips+stepper+'</div>';
}
// Behälter eines Leads als eigenständiges, editierbares Array verankern
function ensureBins(l){
  if(!l.behaelter||!l.behaelter.length){
    l.behaelter=containersOf(l).map(function(c){ return {fraktion:c.fraktion,volumen:c.volumen,anzahl:c.anzahl||1}; });
  }
  return l.behaelter;
}
// Nach jeder Tonnen-Änderung: Score/Hot/Kalkulation/Primärfelder neu + speichern + syncen
function recalcLead(l){
  var dom=dominantContainer(l);
  l.fraktion=dom.fraktion; l.volumen=dom.volumen; l.anzahl=totalAnzahl(l);
  l.score=scoreLead(l); l.hot_lead=isHot(l);
  var k=kalkulation(l);
  l.kosten_monat=k.kosten_monat; l.ersparnis_monat=k.ersparnis_monat; l.ersparnis_jahr=k.ersparnis_jahr;
  l.rss_marge_monat=k.rss_marge_monat; l.rss_marge_jahr=k.rss_marge_jahr;
  l.updated_at=Date.now();
  dbPut(stripRuntime(l)).then(function(){ syncLead(l); });
  renderSheet();
}
function editBin(id,i,field,val){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  var bins=ensureBins(l); if(!bins[i]) return;
  bins[i][field]=val; recalcLead(l);
}
function editBinAnz(id,i,delta){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  var bins=ensureBins(l); if(!bins[i]) return;
  bins[i].anzahl=Math.max(1,(bins[i].anzahl||1)+delta); recalcLead(l);
}
function addBinLead(id){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  ensureBins(l).push({fraktion:'restmuell',volumen:240,anzahl:1}); recalcLead(l);
}
function delBinLead(id,i){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  var bins=ensureBins(l); bins.splice(i,1);
  if(!bins.length) bins.push({fraktion:'restmuell',volumen:1100,anzahl:1});
  recalcLead(l);
}
function VOLUMEN_FRAK(){
  var d=S.draft;
  return Object.keys(FRAKTION).map(function(k){
    var f=FRAKTION[k];
    return '<button class="chip'+(d.fraktion===k?' on':'')+'" data-act="frak" data-v="'+k+'">'+
      '<span class="swatch" style="background:'+f.sw+'"></span>'+f.label+'</button>';
  }).join('');
}

/* ================= CRM: Historie, Wiedervorlage, Anruf-Log, Board =================
   Neue Felder (email, wiedervorlage, naechste_aktion, historie) sind LOKAL-FIRST:
   in IndexedDB persistiert (stripRuntime behält sie), aber noch NICHT in Supabase
   gepusht (toRow unverändert) -> kein Bruch der Live-Sync. Team-Sync = ALTER TABLE
   + Felder in toRow aufnehmen (siehe README). */
function histOf(l){ return Array.isArray(l.historie)?l.historie:[]; }
function pushHist(l,typ,text){ l.historie=histOf(l).concat([{ ts:Date.now(), typ:typ, text:text||'' }]); }
function crmSave(l,msg){ l.updated_at=Date.now(); dbPut(stripRuntime(l)).then(function(){ syncLead(l); }); if(msg) toast(msg); }
// Ansprechpartner: eigene Durchwahl/Mail bevorzugen, sonst Firmen-Kontakt
function apTel(l){ return ((l.ap_telefon||'').trim())||((l.telefon||'').trim()); }
function apMail(l){ return ((l.ap_email||'').trim())||((l.email||'').trim()); }
function apLabel(l){ return l.ap_name ? (l.ap_name+(l.ap_rolle?(' · '+l.ap_rolle):'')) : ''; }
function apAnrede(l){ return l.ap_name ? ('Guten Tag '+l.ap_name+',') : 'Guten Tag,'; }
function isoPlusDays(n){ var d=new Date(); d.setDate(d.getDate()+n); return isoOf(d); }
function wvLabel(iso){ if(!iso) return ''; var d=new Date(iso+'T00:00:00'); return d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}); }
function wvDue(l){ return l.wiedervorlage && l.wiedervorlage<=todayISO() && l.status!=='gewonnen' && l.status!=='verloren'; }
function nextStatus(s){ var i=STATUS.indexOf(s); if(i<0||i>=3) return null; return STATUS[i+1]; }
// Nachfass-Termin sicherstellen (setzt WV nur, wenn keiner/überfällig) – standard 4 Tage
function ensureFollowup(l,days){ if(!l.wiedervorlage || l.wiedervorlage<todayISO()){ l.wiedervorlage=isoPlusDays(days||4); return true; } return false; }
// Immer wenn ein Lead auf „Angebot" geht: automatisch einen Nachfass-Termin hinterlegen
function onStatusAngebot(l){ if(ensureFollowup(l,4)){ pushHist(l,'notiz','Nachfass-Termin automatisch: '+wvLabel(l.wiedervorlage)); return true; } return false; }
var HIST_ICON={ anruf:'☎', mail:'✉', notiz:'✎', status:'⇄' };
// Anzahl protokollierter Anrufe -> Erstkontakt vs. Nachfass
function callCount(l){ return histOf(l).filter(function(e){return e.typ==='anruf';}).length; }
function contactBadge(l){
  var n=callCount(l);
  if(n===0) return '<span class="cbadge new">○ Erstkontakt offen</span>';
  if(n===1) return '<span class="cbadge rep">☎ 1. Kontakt erfolgt</span>';
  return '<span class="cbadge rep">↻ Nachfass ×'+(n-1)+'</span>';
}
// Einzelnen Historie-Eintrag löschen (Korrektur bei Vertippen)
function delHist(id,ts){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  l.historie=histOf(l).filter(function(e){return String(e.ts)!==String(ts);});
  crmSave(l,'Eintrag gelöscht'); renderSheet();
}
// CRM eines Leads zurück auf Ursprung: Historie/Wiedervorlage/Status leeren (Lead bleibt)
function resetCrm(id){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  if(!confirm('CRM dieses Leads zurücksetzen?\n\nHistorie, Wiedervorlage und Status (→ Neu) werden geleert.\nFoto, Tonnen, Firma & Angebote bleiben erhalten.')) return;
  l.historie=[]; l.wiedervorlage=null; l.naechste_aktion=''; l.status='neu';
  crmSave(l,'CRM zurückgesetzt · Status → Neu'); render(); renderSheet();
}

// Anruf-Ergebnis -> Status + Wiedervorlage-Kadenz (aus telefonleitfaden.md §6/§7) + Historie
var CALL_OUTCOMES=[
  { k:'erreicht',  lbl:'Erreicht',        status:'kontaktiert', wv:0,  txt:'Erreicht – gesprochen' },
  { k:'termin',    lbl:'Termin',          status:'kontaktiert', wv:1,  txt:'Termin vereinbart' },
  { k:'angebot',   lbl:'Angebot gewünscht',status:'angebot',    wv:4,  txt:'Angebot gewünscht' },
  { k:'nicht',     lbl:'Nicht erreicht',  status:'kontaktiert', wv:4,  txt:'Nicht erreicht' },
  { k:'spaeter',   lbl:'Später (30 T)',   status:'kontaktiert', wv:30, txt:'Wiedervorlage – später anrufen' },
  { k:'kein',      lbl:'Kein Interesse',  status:'verloren',    wv:-1, txt:'Kein Interesse' }
];
function logCall(id,key){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  var o=CALL_OUTCOMES.find(function(x){return x.k===key;}); if(!o) return;
  l.status=o.status;
  l.wiedervorlage = o.wv<0 ? null : isoPlusDays(o.wv);
  pushHist(l,'anruf',o.txt+(l.wiedervorlage?(' · WV '+wvLabel(l.wiedervorlage)):''));
  crmSave(l,'Anruf geloggt · '+o.lbl); renderSheet(); if(S.tab!=='leads') render();
}
function setWV(id,days){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  l.wiedervorlage = days==null ? null : isoPlusDays(days);
  pushHist(l,'notiz', days==null?'Wiedervorlage entfernt':('Wiedervorlage gesetzt: '+wvLabel(l.wiedervorlage)));
  crmSave(l, days==null?'Wiedervorlage entfernt':('Wiedervorlage: '+wvLabel(l.wiedervorlage))); renderSheet();
}
function addHistNote(id){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  var inp=document.getElementById('histnote-'+id); var v=inp?inp.value.trim():''; if(!v){ toast('Notiz leer'); return; }
  pushHist(l,'notiz',v); crmSave(l,'Notiz gespeichert'); renderSheet();
}
function advanceStatus(id,to){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  l.status=to; pushHist(l,'status','Status → '+STATUS_LBL[to]);
  if(to==='angebot') onStatusAngebot(l);            // Nachfass-Termin automatisch
  crmSave(l); render(); renderSheet();
}
// mailto-assistierter Angebotsversand: Mail im eigenen Programm vorbereiten (kein Backend)
function mailOffer(id){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  var firma=l.firmenname||'Ihr Betrieb';
  var subj='Ihr Angebot – Gewerbliche Abfallentsorgung · RSS';
  var body=''
    +apAnrede(l)+'\n\n'
    +'vielen Dank für das Gespräch. Anbei unser Angebot für die gewerbliche '
    +'Abfallentsorgung an Ihrem Standort ('+firma+') – mit einem transparenten Festpreis '
    +'(siehe PDF im Anhang).\n\n'
    +'Wir übernehmen die komplette gewerbliche Restabfallentsorgung; die gesetzliche '
    +'Pflichttonne verbleibt beim Landkreis. Ein Ansprechpartner, kein Umstellungsaufwand.\n\n'
    +'Antworten Sie einfach auf diese Mail oder rufen Sie uns an – wir richten alles ein.\n\n'
    +'Mit freundlichen Grüßen\n'
    +RSS_ABSENDER.gf+'\n'
    +RSS_ABSENDER.firma+' '+RSS_ABSENDER.zusatz+'\n'
    +RSS_ABSENDER.strasse+' · '+RSS_ABSENDER.ort+'\n'
    +'Tel. '+RSS_ABSENDER.tel+' · '+RSS_ABSENDER.mail;
  var href='mailto:'+encodeURIComponent(apMail(l))
    +'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);
  window.location.href=href;
  l.status='angebot'; pushHist(l,'mail','Angebot per Mail vorbereitet'+(apMail(l)?(' an '+apMail(l)):' (Empfänger im Mailprogramm eintragen)'));
  l.wiedervorlage=isoPlusDays(4);
  crmSave(l,'Mail vorbereitet · Status → Angebot · WV +4 Tage'); renderSheet();
  toast('💡 Angebots-PDF via „Angebot erstellen" speichern & anhängen');
}

// Begleittext fürs Teilen/Mail (ohne Ersparnis)
function shareText(l){
  var firma=l.firmenname||'Ihr Betrieb';
  return 'Ihr Angebot – Gewerbliche Abfallentsorgung (RSS)\n\n'+
    apAnrede(l)+'\n\n'
    +'anbei unser Angebot für die gewerbliche Abfallentsorgung an Ihrem Standort ('+firma+') '
    +'mit transparentem Festpreis.\n\n'
    +'Wir übernehmen die komplette gewerbliche Restabfallentsorgung; die gesetzliche Pflichttonne '
    +'verbleibt beim Landkreis. Ein Ansprechpartner, kein Umstellungsaufwand.\n\n'
    +'Bei Fragen einfach antworten oder anrufen.\n\n'
    +'Mit freundlichen Grüßen\n'+RSS_ABSENDER.gf+'\n'+RSS_ABSENDER.firma+' '+RSS_ABSENDER.zusatz+'\n'
    +'Tel. '+RSS_ABSENDER.tel+' · '+RSS_ABSENDER.mail;
}
function angebotDateiname(l,ext){
  var f=(l.firmenname||'Angebot').replace(/[^0-9A-Za-zäöüÄÖÜß ._-]/g,'').replace(/\s+/g,'-').slice(0,40)||'Angebot';
  return 'RSS-Angebot-'+f+'.'+(ext||'pdf');
}
// EIN Knopf: Angebot erzeugen + über das Teilen-Menü (Mail/WhatsApp) mit Datei UND Text weitergeben.
// Web Share Level 2 (Handy) hängt die Datei an; Desktop-Fallback: PDF öffnen + Mailentwurf.
async function shareAngebot(id){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  var snap=angebotSnapshot(l);
  var text=shareText(l);
  var firma=l.firmenname||'Ihr Betrieb';
  l.angebote=l.angebote||[]; l.angebote.unshift(snap);   // Angebot mitprotokollieren
  var logAndSave=function(msg,note){
    l.status='angebot'; pushHist(l,'mail',note); l.wiedervorlage=isoPlusDays(4);  // Nachfass-Termin automatisch
    l.updated_at=Date.now(); dbPut(stripRuntime(l)).then(function(){ syncLead(l); });
    if(msg) toast(msg); renderSheet();
  };
  // Datei bauen – echtes PDF bevorzugt, HTML als Fallback (jsPDF nicht geladen)
  var pdfDoc=buildAngebotPDF(snap), file;
  if(pdfDoc){ file=new File([pdfDoc.output('blob')], angebotDateiname(l,'pdf'), {type:'application/pdf'}); }
  else { file=new File([buildAngebot(snap)], angebotDateiname(l,'html'), {type:'text/html'}); }
  try{
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({ files:[file], title:'Angebot – '+firma, text:text });
      logAndSave('Angebot geteilt · Status → Angebot · WV +4', 'Angebot geteilt ('+(pdfDoc?'PDF':'Datei')+' + Text)'+(apMail(l)?(' → '+apMail(l)):''));
      return;
    }
  }catch(e){ if(e && e.name==='AbortError'){ renderSheet(); return; } }   // Nutzer hat abgebrochen
  // Fallback (Desktop / kein Datei-Teilen): Angebot öffnen + Mailentwurf mit Text
  openAngebotDoc(snap);
  var href='mailto:'+encodeURIComponent(apMail(l))+'?subject='+encodeURIComponent('Ihr Angebot – Gewerbliche Abfallentsorgung · RSS')+'&body='+encodeURIComponent(text);
  window.location.href=href;
  logAndSave('Angebot geöffnet + Mailentwurf · PDF anhängen', 'Angebot erstellt (Desktop: PDF + Mailentwurf)');
}

/* ---------- Termin senden (.ics + Google Meet + optional Selbstbuchung) ---------- */
function icsEsc(s){ return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n'); }
function icsStamp(d){ var p=function(n){return (n<10?'0':'')+n;};
  return d.getUTCFullYear()+p(d.getUTCMonth()+1)+p(d.getUTCDate())+'T'+p(d.getUTCHours())+p(d.getUTCMinutes())+p(d.getUTCSeconds())+'Z'; }
function buildICS(l,start,mins){
  var end=new Date(start.getTime()+(mins||15)*60000);
  var meet=meetURL(), booking=bookingURL();
  var loc=meet||l.adresse||'';
  var desc='Kostenloses, unverbindliches Müll-Audit für '+(l.firmenname||'Ihren Betrieb')+' (ca. '+(mins||15)+' Min).'+
    (meet?('\nPer Video: '+meet):'')+(booking?('\nAnderer Wunschtermin: '+booking):'');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//RSS//Akquise//DE','METHOD:PUBLISH','BEGIN:VEVENT',
    'UID:'+l.id+'-'+start.getTime()+'@rss-entsorgung.de','DTSTAMP:'+icsStamp(new Date()),
    'DTSTART:'+icsStamp(start),'DTEND:'+icsStamp(end),
    'SUMMARY:'+icsEsc('Müll-Audit – RSS'),'LOCATION:'+icsEsc(loc),'DESCRIPTION:'+icsEsc(desc),
    'ORGANIZER;CN=RSS Recycling Solution Service:mailto:'+RSS_ABSENDER.mail,
    'END:VEVENT','END:VCALENDAR'].join('\r\n');
}
function terminBlock(l){
  var d=new Date(); d.setDate(d.getDate()+1);                 // Default: morgen 10:00
  var booking=bookingURL(), meet=meetURL();
  return '<span class="lab">Termin (Video-Audit)</span>'+
    '<div class="terminrow">'+
      '<input type="date" id="termin-date-'+l.id+'" class="txt" value="'+isoOf(d)+'"/>'+
      '<input type="time" id="termin-time-'+l.id+'" class="txt" value="10:00"/>'+
    '</div>'+
    '<button class="cta ghost" data-act="termin" data-id="'+l.id+'" style="margin-top:8px">📅 Termin senden (Kalender'+(meet?' + Video':'')+')</button>'+
    (booking?'<div class="note" style="margin-top:6px">Selbstbuchung aktiv – Buchungslink liegt der Nachricht bei.</div>'
            :'<div class="note" style="margin-top:6px">Tipp: In <b>Setup → Termin & Video</b> Buchungs- + Meet-Link hinterlegen (Google/Calendly, gratis) für Selbstbuchung.</div>');
}
async function shareTermin(id){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  var di=document.getElementById('termin-date-'+id), ti=document.getElementById('termin-time-'+id);
  var dv=di&&di.value, tv=(ti&&ti.value)||'10:00';
  if(!dv){ toast('Bitte Datum wählen'); return; }
  var dp=dv.split('-'), tp=tv.split(':');
  var start=new Date(+dp[0],+dp[1]-1,+dp[2],+tp[0],+tp[1],0);
  var ics=buildICS(l,start,15);
  var meet=meetURL(), booking=bookingURL();
  var when=start.toLocaleString('de-DE',{weekday:'long',day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'});
  var text='Terminvorschlag – kostenloses Müll-Audit (RSS)\n\n'
    +apAnrede(l)+'\n\n'
    +'wie besprochen der Termin für Ihr kurzes, kostenloses Müll-Audit:\n'+when+' Uhr (ca. 15 Min).\n'
    +'Der Termin liegt als Kalender-Datei bei.'
    +(meet?('\nPer Video: '+meet):'')
    +(booking?('\n\nPasst der Termin nicht? Wunschtermin hier wählen: '+booking):'')
    +'\n\nBeste Grüße\n'+RSS_ABSENDER.gf+'\n'+RSS_ABSENDER.firma+' '+RSS_ABSENDER.zusatz;
  var done=function(msg){
    if(l.status==='neu') l.status='kontaktiert';
    pushHist(l,'notiz','Termin vorgeschlagen: '+when+(meet?' (Video)':''));
    l.wiedervorlage=isoOf(start);                              // erscheint am Termintag in „Meine Termine heute"
    l.updated_at=Date.now(); dbPut(stripRuntime(l)).then(function(){ syncLead(l); });
    if(msg) toast(msg); renderSheet();
  };
  try{
    var file=new File([ics],'RSS-Termin.ics',{type:'text/calendar'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({ files:[file], title:'Termin – RSS', text:text });
      done('Termin geteilt · WV am Termintag'); return;
    }
  }catch(e){ if(e && e.name==='AbortError'){ renderSheet(); return; } }
  // Fallback: .ics herunterladen + Mailentwurf
  var url=URL.createObjectURL(new Blob([ics],{type:'text/calendar'}));
  var a=document.createElement('a'); a.href=url; a.download='RSS-Termin.ics'; a.click(); setTimeout(function(){URL.revokeObjectURL(url);},2000);
  window.location.href='mailto:'+encodeURIComponent(apMail(l))+'?subject='+encodeURIComponent('Terminvorschlag – Müll-Audit RSS')+'&body='+encodeURIComponent(text);
  done('Termin: .ics gespeichert + Mailentwurf');
}

// Kontakt-Historie/Timeline im Lead-Sheet
function historieBlock(l){
  var h=histOf(l).slice().sort(function(a,b){return b.ts-a.ts;});
  var items = h.length ? h.map(function(e){
    var d=new Date(e.ts).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    return '<div class="hitem"><span class="hic">'+(HIST_ICON[e.typ]||'•')+'</span>'+
      '<span class="htx">'+esc(e.text)+'<span class="hts">'+d+'</span></span>'+
      '<button class="hdel" data-act="delhist" data-id="'+l.id+'" data-v="'+e.ts+'" title="Eintrag löschen">×</button></div>';
  }).join('') : '<div class="note" style="margin:0">Noch keine Kontakte protokolliert.</div>';
  return '<span class="lab">Kontakt-Historie ('+h.length+')</span>'+
    '<div class="hlist">'+items+'</div>'+
    '<div class="hadd"><input class="txt" id="histnote-'+l.id+'" placeholder="Gesprächsnotiz / Ergebnis…"/>'+
    '<button class="chip" data-act="addhist" data-id="'+l.id+'">+ Notiz</button></div>';
}
// Anruf-Ergebnis-Schnellauswahl + Wiedervorlage-Buttons
function callCrmBlock(l){
  var wv = l.wiedervorlage
    ? '<div class="wvrow'+(wvDue(l)?' due':'')+'">Wiedervorlage: <b>'+wvLabel(l.wiedervorlage)+'</b>'+(wvDue(l)?' · FÄLLIG':'')+
        ' <button data-act="setwv" data-id="'+l.id+'" data-v="clear">×</button></div>'
    : '';
  return '<span class="lab">Anruf-Ergebnis loggen</span>'+
    '<div class="callgrid">'+ CALL_OUTCOMES.map(function(o){
      return '<button data-act="callresult" data-id="'+l.id+'" data-v="'+o.k+'">'+o.lbl+'</button>';
    }).join('')+'</div>'+
    wv+
    '<div class="wvset"><span>Wiedervorlage:</span>'+
      [['+1 T',1],['+4 T',4],['+7 T',7],['+14 T',14],['+30 T',30]].map(function(p){
        return '<button data-act="setwv" data-id="'+l.id+'" data-v="'+p[1]+'">'+p[0]+'</button>';
      }).join('')+'</div>';
}

// Pipeline-Board (Pipedrive-Optik): Spalte je Status
function renderBoard(){
  return '<div class="board">'+ STATUS.map(function(s){
    var ls=S.leads.filter(function(l){return l.status===s;}).sort(function(a,b){return b.score-a.score;});
    var sum=ls.reduce(function(a,l){return a+(kalkulation(l).ersparnis_jahr||0);},0);
    return '<div class="bcol" data-status="'+s+'"><div class="bch"><span>'+STATUS_LBL[s]+' · '+ls.length+'</span>'+
      '<span class="bsum">'+eur(sum)+'/J</span></div>'+
      '<div class="bcards">'+ (ls.length?ls.map(boardCard).join(''):'<div class="bempty">—</div>') +'</div>'+
    '</div>';
  }).join('')+'</div>';
}
function boardCard(l){
  var co=l.firmenname||(l.enriched?'Unbekannt':'…');
  return '<div class="bcard" data-act="open" data-id="'+l.id+'">'+
    '<div class="bgrip" data-grip title="Ziehen zum Verschieben">⠿</div>'+
    '<div class="bco">'+esc(co)+(l.hot_lead?' <span class="tag hot">🔥</span>':'')+'</div>'+
    '<div class="bmeta"><span class="bscore">'+l.score+'</span>'+
      '<span class="bsav">'+eur(kalkulation(l).ersparnis_jahr)+'/J</span></div>'+
    '<div class="bcontact">'+contactBadge(l)+'</div>'+
    (l.wiedervorlage?'<div class="bwv'+(wvDue(l)?' due':'')+'">WV '+wvLabel(l.wiedervorlage)+'</div>':'')+
  '</div>';
}
// „Heute nachfassen" – fällige Wiedervorlagen (für Heute-Tab)
function dueFollowups(){
  var t=todayISO();
  return S.leads.filter(function(l){ return l.wiedervorlage && l.wiedervorlage<=t && l.status!=='gewonnen' && l.status!=='verloren'; })
    .sort(function(a,b){ return a.wiedervorlage<b.wiedervorlage?-1:(a.wiedervorlage>b.wiedervorlage?1:(b.score-a.score)); });
}
function followupBlock(){
  var due=dueFollowups(); if(!due.length) return '';
  return '<div class="section" style="border-color:var(--hot);margin-bottom:14px">'+
    '<h3 style="color:var(--hot)">☎ Heute nachfassen · '+due.length+'</h3>'+
    due.slice(0,15).map(function(l){
      return '<div class="lead" data-act="open" data-id="'+l.id+'" style="margin:8px 0 0">'+
        '<div class="bd"><div class="co">'+esc(l.firmenname||'Unbekannt')+'</div>'+
        '<div class="ad">'+esc(l.adresse||'')+' · WV '+wvLabel(l.wiedervorlage)+'</div>'+
        '<div class="meta"><span class="tag fill">'+STATUS_LBL[l.status]+'</span>'+
          contactBadge(l)+
          (l.telefon?'<span class="tag">☎ '+esc(l.telefon)+'</span>':'<span class="tag" style="border-color:var(--muted);color:var(--muted)">kein Tel</span>')+
          '<div class="scorebox"><div class="n">'+l.score+'</div><div class="l">Score</div></div></div>'+
        '</div></div>';
    }).join('')+'</div>';
}

function renderLeads(){
  var leads=S.leads.slice();
  if(S.filter!=='alle') leads=leads.filter(function(l){ return l.status===S.filter; });
  if(S.sort==='score') leads.sort(function(a,b){ return b.score-a.score; });
  else leads.sort(function(a,b){ return (b.created_at)-(a.created_at); });

  var hot=S.leads.filter(function(l){return l.hot_lead;}).length;
  var sum=S.leads.reduce(function(a,l){return a+(kalkulation(l).rss_marge_jahr||0);},0);

  var bar='<div class="bar">'+
    ['alle'].concat(STATUS).map(function(s){
      var lbl=s==='alle'?'Alle':STATUS_LBL[s];
      var n=s==='alle'?S.leads.length:S.leads.filter(function(l){return l.status===s;}).length;
      return '<button class="'+(S.filter===s?'on':'')+'" data-act="filter" data-v="'+s+'">'+lbl+' '+n+'</button>';
    }).join('')+'</div>';

  var sortbar='<div class="bar">'+
    '<button class="'+(S.sort==='score'?'on':'')+'" data-act="sort" data-v="score">▼ Score</button>'+
    '<button class="'+(S.sort==='neu'?'on':'')+'" data-act="sort" data-v="neu">▼ Neueste</button>'+
    '</div>';

  var list;
  if(!leads.length){
    list='<div class="empty"><div class="big">Noch keine Leads</div>'+
      '<div class="sm">Wechsle zu „Erfassen" und nimm die erste Tonne auf.</div></div>';
  } else {
    list=leads.map(leadCard).join('');
  }

  var viewbar='<div class="bar">'+
    '<button class="'+(S.leadView==='list'?'on':'')+'" data-act="leadview" data-v="list">≣ Liste</button>'+
    '<button class="'+(S.leadView==='board'?'on':'')+'" data-act="leadview" data-v="board">▦ Pipeline</button>'+
    '</div>';

  var main = (S.leadView==='board') ? renderBoard() : (bar+sortbar+list);

  $app.innerHTML='<div class="screen'+(S.leadView==='board'?' board-screen':'')+'">'+
    '<h1 class="t">Leads</h1>'+
    '<div class="sub">'+S.leads.length+' gesamt · '+hot+' hot · '+eur(sum)+'/J Marge-Potenzial</div>'+
    viewbar+main+'</div>';
}
function leadCard(l){
  var u=photoURL(l);
  var _kk=kalkulation(l);
  var f=FRAKTION[l.fraktion]||{label:l.fraktion};
  var co = l.firmenname || (l.enriched?'Unbekannt':'Wird ermittelt…');
  var ad = l.adresse || (l.lat?(l.lat.toFixed(4)+', '+l.lng.toFixed(4)):'—');
  var syncTxt = l.sync_state==='synced'?'☁ sync':(l.sync_state==='pending'?'⊙ wartet':'● lokal');
  return '<div class="lead" data-act="open" data-id="'+l.id+'">'+
    '<div class="pic">'+(u?'<img src="'+u+'"/>':'<div class="ph">Kein Foto</div>')+'</div>'+
    '<div class="bd">'+
      '<div class="co">'+esc(co)+'</div>'+
      '<div class="ad">'+esc(ad)+'</div>'+
      '<div class="meta">'+
        '<span class="tag">'+esc(f.label)+'</span>'+
        '<span class="tag">'+(containersOf(l).length>1 ? (containersOf(l).length+' Größen · '+l.anzahl+' Tonnen') : (l.volumen+'L ×'+l.anzahl))+'</span>'+
        (l.hot_lead?'<span class="tag hot">Hot</span>':'')+
        (l.duplikat?'<span class="tag">Dublette</span>':'')+
        '<span class="tag fill">'+STATUS_LBL[l.status]+'</span>'+
        '<button class="tag" data-act="delquick" data-id="'+l.id+'" style="border-color:var(--hot);color:var(--hot)">✕</button>'+
        '<div class="scorebox"><div class="n">'+l.score+'</div><div class="l">Score</div></div>'+
      '</div>'+
      '<div class="sync">'+syncTxt+' · Marge '+eur(_kk.rss_marge_jahr)+'/J · Kunde spart '+eur(_kk.ersparnis_jahr)+'/J</div>'+
    '</div>'+
  '</div>';
}

/* Google Maps JS dynamisch laden (Key aus Setup) */
var _gmapsP;
function loadGoogleMaps(){
  if(window.google && window.google.maps) return Promise.resolve();
  if(_gmapsP) return _gmapsP;
  if(!S.keys.google) return Promise.reject(new Error('Kein Google-Key (Setup)'));
  _gmapsP=new Promise(function(res,rej){
    window.__gmapsCb=function(){ res(); };
    var s=document.createElement('script');
    s.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(S.keys.google)+'&language=de&region=DE&loading=async&callback=__gmapsCb';
    s.async=true; s.onerror=function(){ _gmapsP=null; rej(new Error('Google Maps Ladefehler')); };
    document.head.appendChild(s);
  });
  return _gmapsP;
}
function renderKarte(){
  $app.innerHTML='<div class="screen"><h1 class="t">Karte</h1>'+
    '<div class="sub">'+S.leads.filter(function(l){return l.lat;}).length+' verortete Leads</div>'+
    '<div id="map"></div></div>';
  var el=document.getElementById('map');
  if(!S.keys.google){ el.innerHTML='<div style="padding:20px;font-weight:700">Erst Google-Key in Setup eintragen.</div>'; return; }
  if(!S.online && !(window.google&&window.google.maps)){ el.innerHTML='<div style="padding:20px;font-weight:700">Karte braucht Internet.</div>'; return; }
  loadGoogleMaps().then(function(){ setTimeout(initMap,20); })
    .catch(function(e){ el.innerHTML='<div style="padding:20px;font-weight:700">Karte nicht ladbar: '+esc(e.message)+'</div>'; });
}
function initMap(){
  var el=document.getElementById('map'); if(!el||!(window.google&&window.google.maps)) return;
  var pts=S.leads.filter(function(l){return l.lat!=null;});
  var center=pts.length?{lat:pts[0].lat,lng:pts[0].lng}:{lat:53.33,lng:10.0}; // LK Harburg
  var map=new google.maps.Map(el,{ center:center, zoom:pts.length?13:10,
    mapTypeControl:false, streetViewControl:false, fullscreenControl:false });
  var bounds=new google.maps.LatLngBounds();
  var iw=new google.maps.InfoWindow();
  pts.forEach(function(l){
    var color=l.hot_lead?'#ff2d2d':(l.status==='gewonnen'?'#3a7d2c':'#000');
    var m=new google.maps.Marker({ position:{lat:l.lat,lng:l.lng}, map:map, title:l.firmenname||'',
      icon:{ path:google.maps.SymbolPath.CIRCLE, scale:8, fillColor:color, fillOpacity:1, strokeColor:'#fff', strokeWeight:2 } });
    m.addListener('click',function(){
      iw.setContent('<div style="font-family:Arial;font-size:13px"><b>'+esc(l.firmenname||'Unbekannt')+'</b><br>'+
        esc(l.adresse||'')+'<br>Score '+l.score+' · '+esc(behaelterSummary(l))+'<br><b>'+eur(l.ersparnis_jahr)+'/Jahr</b></div>');
      iw.open(map,m);
    });
    bounds.extend(m.getPosition());
  });
  if(pts.length>1) map.fitBounds(bounds);
}

/* ---------- Route / Heute ----------
   Kalender für den GANZEN Landkreis Harburg: pro Gemeinde eine JSON mit exakten
   Terminen (restmuell_termine[].datum + art). Manifest data/gemeinden.json listet sie.
   Es ist immer genau EINE Gemeinde aktiv (S.route); Auswahl im Heute-Header. */
async function loadManifest(){
  if(S.gemeinden) return;
  try{ var r=await fetch('data/gemeinden.json',{cache:'no-cache'}); if(r.ok) S.gemeinden=await r.json(); }
  catch(e){ /* offline / fehlt */ }
  if(!S.gemeinden) S.gemeinden=[];
}
// landkreisweiter Termin-Index (für die „Nächste Abfuhr"-Erinnerung ohne Gemeindewahl)
async function loadTermineIndex(){
  if(S.termineIndex) return;
  try{ var r=await fetch('data/termine-index.json',{cache:'no-cache'}); if(r.ok) S.termineIndex=await r.json(); }
  catch(e){ /* offline / fehlt */ }
  if(!S.termineIndex) S.termineIndex={};
}
// Route einer Gemeinde laden und direkt auf ein Datum im Heute-Tab springen
function gotoRoute(id,date){
  S.tab='heute'; S.showReminder=false; stopGPSWatch();
  if(String(S.gemeindeId)===String(id) && S.route){ S.routeDate=date; render(); return; }
  S.route=null; S.gemeindeId=null;
  loadRoute(id).then(function(){ S.routeDate=date; render(); });   // loadRoute setzt routeDate=null -> danach setzen
}
function pickDefaultGemeinde(){
  if(!S.gemeinden.length) return null;
  var saved=localStorage.getItem('rss_gemeinde');
  if(saved && S.gemeinden.some(function(g){return String(g.id)===saved;})) return saved;
  var d=S.draft;                                   // sonst: nächste Gemeinde per GPS
  if(d && d.lat!=null){
    var best=null,bd=1e9;
    S.gemeinden.forEach(function(g){ if(g.lat!=null){ var dist=haversine(d.lat,d.lng,g.lat,g.lng); if(dist<bd){bd=dist;best=g;} } });
    if(best) return best.id;
  }
  var see=S.gemeinden.find(function(g){ return /seevetal/i.test(g.name); });
  return see?see.id:S.gemeinden[0].id;             // Fallback Seevetal
}
async function loadRoute(id){
  if(S.routeLoading) return;
  S.routeLoading=true;
  try{
    await loadManifest();
    if(!S.gemeinden.length) return;
    if(id==null) id=pickDefaultGemeinde();
    var entry=S.gemeinden.find(function(g){ return String(g.id)===String(id); })||S.gemeinden[0];
    if(S.route && String(S.gemeindeId)===String(entry.id)) return;   // schon geladen
    var r=await fetch('data/'+entry.file,{cache:'no-cache'});
    if(r.ok){ S.route=await r.json(); S.gemeindeId=entry.id; S.stops={}; S.parks={}; S.stopsLoading={}; S.routeDate=null;
              localStorage.setItem('rss_gemeinde',String(entry.id)); }
  }catch(e){ /* offline / fehlt */ }
  finally{ S.routeLoading=false; }
}
function switchGemeinde(id){
  S.route=null; S.gemeindeId=null; S.routeDate=null;
  loadRoute(id).then(render);
}
function leadHasPlace(pid){ return S.leads.some(function(l){ return pid && l.place_id===pid; }); }

// Zielkunden (Restmüll-intensive Branchen) im Umkreis eines Gebiets laden,
// nach Potenzial sortiert. Key = Gebietsname (Gruppe aus routeGroupsDated).
async function loadTargets(g){
  var key=g.name;
  if(S.stops[key]||S.stopsLoading[key]) return;
  if(!S.keys.google){ toast('Erst Google-Key in Setup eintragen'); return; }
  if(g.lat==null){ toast('Kein Gebiets-Mittelpunkt'); return; }
  S.stopsLoading[key]=true; render();
  try{
    var byType=await placesNearby(g.lat,g.lng,2500,20,TARGET_TYPE_KEYS);
    byType.forEach(function(p){ var t=TARGET_TYPES[p.primaryType]; p._pot=t?t.w:1; p._potLbl=t?t.lbl:(p.typ||'Ziel'); });
    // Pflege-/Altenheime per Textsuche ergänzen (kein eigener Places-Typ)
    var extra=[];
    for(var i=0;i<TARGET_TEXT.length;i++){
      try{
        var res=await placesSearchText(TARGET_TEXT[i].q,g.lat,g.lng,2500,10);
        res.forEach(function(p){ p._pot=TARGET_TEXT[i].w; p._potLbl=TARGET_TEXT[i].lbl; });
        extra=extra.concat(res);
      }catch(e){ /* Textsuche optional */ }
    }
    // zusammenführen, nach place_id deduplizieren, Texttreffer auf ~3,5 km begrenzen
    var seen={}, merged=[];
    byType.concat(extra).forEach(function(p){
      if(!p.firmenname || seen[p.place_id]) return;
      if(p.lat!=null && haversine(g.lat,g.lng,p.lat,p.lng)>3.5) return;
      seen[p.place_id]=1; merged.push(p);
    });
    merged.sort(function(a,b){ return b._pot-a._pot; });   // Wunschkunden zuerst
    S.stops[key]=merged;
    // Gewerbepark-Cluster: generischer Sweep + Firmen an gleicher Adresse bündeln
    try{
      var generic=await placesNearby(g.lat,g.lng,1500,20);
      generic=generic.filter(function(p){ return p.firmenname && STOP_EXCLUDE.indexOf(p.primaryType)<0; });
      S.parks[key]=findParks(generic);
    }catch(e){ S.parks[key]=[]; }
  }catch(e){ toast('Zielkunden laden fehlgeschlagen'); S.stops[key]=[]; }
  S.stopsLoading[key]=false; render();
}
// Adresse auf "Straße + Basis-Hausnummer" normalisieren (Zusätze A/B/C/D strippen)
function baseAddr(adr){
  if(!adr) return '';
  var first=String(adr).split(',')[0];                 // "Musterstr. 5 A"
  var m=first.match(/^(.*?)(\d+)\s*[a-zA-Z]?\s*$/);    // Straße + erste Nummer, Buchstabe weg
  var s=(m?(m[1]+m[2]):first).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  return s;
}
// Firmen an gleicher Basis-Adresse (bzw. gleichem Koordinaten-Punkt) zu Parks bündeln
function findParks(places){
  var groups={};
  places.forEach(function(p){
    var k=baseAddr(p.adresse) || (p.lat!=null?(p.lat.toFixed(4)+','+p.lng.toFixed(4)):'');
    if(!k) return;
    (groups[k]=groups[k]||[]).push(p);
  });
  var parks=[];
  Object.keys(groups).forEach(function(k){
    var seen={}, firms=[];
    groups[k].forEach(function(p){ if(!seen[p.firmenname]){ seen[p.firmenname]=1; firms.push(p); } });
    if(firms.length>=3) parks.push({ addr:firms[0].adresse||'', firms:firms });   // ≥3 Firmen = Gewerbepark
  });
  parks.sort(function(a,b){ return b.firms.length-a.firms.length; });
  return parks;
}

function startStop(p, o, frak){
  var d=freshDraft();
  d.fromStop=true;
  d.preset={ firmenname:p.firmenname, adresse:p.adresse, telefon:p.telefon||'',
             website:p.website||'', place_id:p.place_id, ortsteil:o.name };
  d.companyState='ok';          // Firma steht schon (aus der Route) – keine Auto-Suche
  d.fraktion=frak||'restmuell';
  if(p.lat!=null){ d.lat=p.lat; d.lng=p.lng; d.gpsState='ok'; d.accuracy=0; }
  S.draft=d; S.tab='erfassen';
  if(p.lat==null) getGPS(d);
  render();
}

function haversine(a,b,c,d){
  var R=6371, dx=(c-a)*Math.PI/180, dy=(d-b)*Math.PI/180,
    s=Math.sin(dx/2)*Math.sin(dx/2)+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dy/2)*Math.sin(dy/2);
  return 2*R*Math.asin(Math.sqrt(s));
}
/* ---- Datums-Helfer (lokale Zeit, nicht UTC) ---- */
function isoOf(d){ var m=d.getMonth()+1, day=d.getDate();
  return d.getFullYear()+'-'+(m<10?'0':'')+m+'-'+(day<10?'0':'')+day; }
function todayISO(){ return isoOf(new Date()); }
function dateLabel(iso){ var p=iso.split('-'), d=new Date(+p[0],+p[1]-1,+p[2]);
  return WD[d.getDay()].slice(0,2)+' '+(+p[2])+'.'+(+p[1])+'.'; }
// kurzer Rhythmus-Text aus dem iCal-"art" ("Hausmüll 14-täglich" -> "14-täglich")
function rhythmLabel(art){ if(!art) return ''; var s=String(art).toLowerCase();
  if(s.indexOf('4-w')>=0||s.indexOf('4w')>=0||s.indexOf('vier')>=0) return '4-wöchentlich';
  if(s.indexOf('woch')>=0&&s.indexOf('14')<0) return 'wöchentlich';
  if(s.indexOf('14')>=0) return '14-täglich'; return ''; }

// Ortsteile nach Basisnamen gruppieren + exakte Termin-Daten je Gebiet
// (Fleestedt ost/west -> ein "Fleestedt"; rest[ISO]=art). Nur Restmüll interessiert.
function routeGroupsDated(){
  var g={};
  (S.route.ortsteile||[]).forEach(function(o){
    var base=o.name.split(' (')[0];
    if(!g[base]) g[base]={ name:base, lat:o.lat, lng:o.lng, rest:{} };
    if(g[base].lat==null && o.lat!=null){ g[base].lat=o.lat; g[base].lng=o.lng; }
    (o.restmuell_termine||[]).forEach(function(t){ if(t.datum){ var ex=g[base].rest[t.datum];
      if(!ex || /14/.test(t.art||'')) g[base].rest[t.datum]=t.art||'Restmüll'; } });  // 14-täglich hat Vorrang beim Label
  });
  return Object.keys(g).map(function(k){ return g[k]; });
}
// kommende Abfuhrtage (ISO) ab heute, max n
function upcomingDates(groups,n){
  var today=todayISO(), set={};
  groups.forEach(function(g){                       // NUR Restmüll interessiert
    Object.keys(g.rest).forEach(function(d){ if(d>=today) set[d]=1; });
  });
  return Object.keys(set).sort().slice(0,n);
}

/* „Nächste Abfuhr"-Overlay beim App-Start: leuchtet landkreisweit auf, welche
   RESTMÜLL-Abfuhr heute/als Nächstes ansteht — ohne vorher eine Gemeinde zu wählen.
   Gemeinde tippen -> lädt sie und springt in die Route. Wegklickbar (× / Hintergrund). */
function dismissReminder(){ localStorage.setItem('rss_reminder_dismissed', todayISO()); S.showReminder=false; render(); }
function reminderDateHead(iso){
  var t=todayISO(); if(iso===t) return 'Heute';
  var tm=new Date(); tm.setDate(tm.getDate()+1);
  if(iso===isoOf(tm)) return 'Morgen';
  return '';
}
// Inhalt (Datums-Abschnitte, nur Restmüll) – oder '' wenn nichts ansteht
function reminderContent(){
  var idx=S.termineIndex; if(!idx) return '';
  var today=todayISO();
  var dates=Object.keys(idx).filter(function(d){ return d>=today; }).sort();
  if(!dates.length) return '';
  var show=[];
  if(idx[today] && idx[today].some(function(e){return e.r&&e.r.length;})) show.push(today);
  for(var i=0;i<dates.length && show.length<2;i++){
    if(dates[i]>today && idx[dates[i]].some(function(e){return e.r&&e.r.length;})){ show.push(dates[i]); break; }
  }
  if(!show.length) show=[dates[0]];
  var sections=show.map(function(iso){
    var entries=(idx[iso]||[]).filter(function(e){ return e.r && e.r.length; });   // NUR Restmüll
    if(!entries.length) return '';
    var head=reminderDateHead(iso);
    var rows=entries.map(function(e){
      var restTxt=e.r.slice(0,3).join(', ')+(e.r.length>3?(' +'+(e.r.length-3)):'');
      return '<button data-act="remindgo" data-id="'+esc(e.id)+'" data-v="'+iso+'" '+
        'style="display:block;width:100%;text-align:left;background:transparent;border:0;border-top:1px solid rgba(255,255,255,.18);padding:10px 0;color:var(--paper);cursor:pointer">'+
        '<b style="font-size:14px">'+esc(e.name)+'</b> <span style="font-size:12px;color:#bbb">▸</span>'+
        '<div style="font-size:12px;color:#cfcfcf">Restmüll: '+esc(restTxt)+'</div>'+
      '</button>';
    }).join('');
    return '<div style="margin-top:8px"><div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#fff">'+
      (head?esc(head)+' · ':'')+esc(dateLabel(iso))+'</div>'+rows+'</div>';
  }).join('');
  return sections.replace(/\s/g,'')?sections:'';
}
// Overlay ein-/ausblenden (ans <body> gehängt, unabhängig vom Tab)
function renderReminderOverlay(){
  var ex=document.getElementById('rmd');
  if(!S.showReminder){ if(ex) ex.remove(); return; }
  var inner=reminderContent();
  if(!inner){ if(ex) ex.remove(); S.showReminder=false; return; }
  var html='<div id="rmd" data-act="rmdbg" style="position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.55);display:flex;align-items:flex-end">'+
    '<div style="background:var(--ink);color:var(--paper);width:100%;max-height:82vh;overflow-y:auto;padding:18px 16px 26px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center">'+
        '<div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#bbb">Nächste Restmüll-Abfuhr · Landkreis Harburg</div>'+
        '<button data-act="dismissreminder" style="background:var(--paper);color:var(--ink);font-size:16px;font-weight:800;padding:4px 11px;border:0;line-height:1">×</button>'+
      '</div>'+
      '<div style="font-size:12px;color:#cfcfcf;margin-top:4px">Tippe eine Gemeinde → direkt in die Route.</div>'+
      inner+
    '</div></div>';
  if(ex) ex.remove();
  document.body.insertAdjacentHTML('beforeend',html);
}

// „Meine Termine heute" – Start-Overlay mit den fälligen Wiedervorlagen
function dismissFollowups(){ localStorage.setItem('rss_fu_dismissed', todayISO()); S.showFollowups=false; render(); }
function renderFollowupOverlay(){
  var ex=document.getElementById('fuov');
  if(!S.showFollowups){ if(ex) ex.remove(); return; }
  var due=dueFollowups();
  if(!due.length){ if(ex) ex.remove(); S.showFollowups=false; return; }
  var rows=due.slice(0,20).map(function(l){
    return '<button data-act="openfulead" data-id="'+l.id+'" '+
      'style="display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #333;background:transparent;color:var(--paper);padding:12px 2px">'+
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">'+
        '<b style="font-size:15px">'+esc(l.firmenname||'Unbekannt')+'</b>'+
        '<span style="font-size:11px;font-weight:800;color:#ffb3b3;white-space:nowrap">WV '+wvLabel(l.wiedervorlage)+'</span>'+
      '</div>'+
      '<div style="font-size:12px;color:#bbb;margin-top:2px">'+esc(l.adresse||'')+'</div>'+
      '<div style="font-size:11px;color:#ddd;margin-top:3px">'+STATUS_LBL[l.status]+' · '+
        (callCount(l)===0?'Erstkontakt':'Nachfass')+(l.telefon?(' · ☎ '+esc(l.telefon)):' · kein Tel')+'</div>'+
    '</button>';
  }).join('');
  var html='<div id="fuov" data-act="fuovbg" style="position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.6);display:flex;align-items:flex-end">'+
    '<div style="background:var(--ink);color:var(--paper);width:100%;max-width:680px;margin:0 auto;max-height:82vh;overflow-y:auto;padding:18px 16px 26px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center">'+
        '<div style="font-size:13px;font-weight:800;letter-spacing:.1em;text-transform:uppercase">☎ Meine Termine heute · '+due.length+'</div>'+
        '<button data-act="dismissfu" style="background:var(--paper);color:var(--ink);font-size:16px;font-weight:800;padding:4px 11px;border:0;line-height:1">×</button>'+
      '</div>'+
      '<div style="font-size:12px;color:#bbb;margin:4px 0 10px">Fällige Wiedervorlagen – tippen zum Öffnen und Anrufen.</div>'+
      rows+
      '<button data-act="dismissfu" style="width:100%;margin-top:14px;background:var(--paper);color:var(--ink);padding:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border:0">Erledigt für heute</button>'+
    '</div></div>';
  if(ex) ex.remove();
  document.body.insertAdjacentHTML('beforeend',html);
}
// Rotes Zähler-Badge am „Heute"-Tab (fällige Wiedervorlagen)
function updateNavBadge(){
  var btn=document.querySelector('nav button[data-tab="heute"]'); if(!btn) return;
  var n=dueFollowups().length;
  var b=btn.querySelector('.navbadge');
  if(!n){ if(b) b.remove(); return; }
  if(!b){ b=document.createElement('span'); b.className='navbadge'; btn.appendChild(b); }
  b.textContent=n>99?'99+':String(n);
}

function renderHeute(){
  var fu=followupBlock();
  if(!S.route){
    $app.innerHTML='<div class="screen"><h1 class="t">Heute</h1>'+ fu +
      '<div class="sub">Abfuhrkalender wird geladen…</div>'+
      '<div class="empty"><div class="big">Keine Routendaten</div>'+
      '<div class="sm">Beim Offline-Erststart die App einmal online öffnen, damit der Kalender lädt.</div></div></div>';
    loadRoute().then(render); return;
  }

  var groups=routeGroupsDated();
  var today=todayISO();
  var dates=upcomingDates(groups,12);
  var sel=S.routeDate;
  if(!sel || dates.indexOf(sel)<0) sel = (dates.indexOf(today)>=0?today:(dates[0]||today));

  var due=groups.filter(function(g){ return g.rest[sel]; });      // NUR Restmüll
  due.sort(function(a,b){ return a.name.localeCompare(b.name); });

  // Gemeinde-Auswahl (Dropdown)
  var gemSel = (S.gemeinden&&S.gemeinden.length>1) ?
    ('<select class="txt" data-act="gemeinde" style="margin-bottom:10px;font-weight:800">'+
      S.gemeinden.map(function(g){ return '<option value="'+g.id+'"'+(String(g.id)===String(S.gemeindeId)?' selected':'')+'>'+esc(g.name)+'</option>'; }).join('')+
    '</select>') : '';

  // Datums-Leiste (nächste Abfuhrtage)
  var chips = dates.length ? ('<div class="bar">'+ dates.map(function(iso){
    var n=groups.filter(function(g){return g.rest[iso];}).length;
    return '<button class="'+(iso===sel?'on':'')+'" data-act="day" data-v="'+iso+'">'+
      dateLabel(iso)+(iso===today?' •':'')+' · '+n+'</button>';
  }).join('')+'</div>') : '';

  var body;
  if(!due.length){
    body='<div class="empty"><div class="big">Keine Restmüll-Abfuhr</div>'+
      '<div class="sm">An diesem Datum steht in '+esc(S.route.gemeinde)+' kein Restmüll an. Anderes Datum oben wählen.</div></div>';
  } else {
    body=due.map(function(g){ return gebietCard(g,sel); }).join('');
  }

  var selLbl = sel===today ? ('heute · '+dateLabel(sel)) : dateLabel(sel);

  $app.innerHTML='<div class="screen">'+
    '<h1 class="t">Heute</h1>'+ fu +
    '<button class="cta ghost" data-act="openreminder" style="margin:0 0 10px">▤ Übersicht · alle Gemeinden</button>'+
    gemSel+
    '<div class="sub">'+esc(S.route.gemeinde)+' · '+esc(selLbl)+' · '+due.length+' Gebiete mit Restmüll</div>'+
    chips+
    '<div class="note" style="margin:0 0 12px">Nur Restmüll-Abfuhr (exakte Termine, 14-täglich/4-wöchentlich unterschieden, Feiertage berücksichtigt). '+
      'An diesen Tagen stehen die Tonnen draußen — hinfahren und per „Erfassen" aufnehmen.</div>'+
    body+'</div>';
}

function gebietCard(g,iso){
  var restArt=g.rest[iso];
  var rhy=rhythmLabel(restArt);
  var near = g.lat!=null ? S.leads.filter(function(l){ return l.lat!=null && haversine(l.lat,l.lng,g.lat,g.lng)<2.5; }).length : 0;
  var nav = g.lat!=null
    ? '<a class="cta ghost" style="margin:0;text-decoration:none;flex:none;padding:12px 16px" href="https://www.google.com/maps/dir/?api=1&destination='+g.lat+','+g.lng+'" target="_blank">Navigieren ▸</a>'
    : '<span style="font-size:12px;color:var(--muted)">kein Standort</span>';
  var key=g.name, loading=S.stopsLoading[key], stops=S.stops[key];
  var targetUI;
  if(g.lat==null){ targetUI=''; }
  else if(loading){ targetUI='<div style="padding:0 14px 12px"><button class="cta ghost" style="margin:0" disabled>★ Zielkunden werden gesucht…</button></div>'; }
  else if(stops){ targetUI='<div style="padding:0 14px 12px">'+parkList(g)+targetList(g,stops)+'</div>'; }
  else { targetUI='<div style="padding:0 14px 12px"><button class="cta ghost" style="margin:0" data-act="loadtargets" data-name="'+esc(g.name)+'">★ Zielkunden hier finden</button></div>'; }

  return '<div style="border:1.5px solid var(--ink);margin-bottom:12px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1.5px solid var(--ink)">'+
      '<b style="font-size:16px;text-transform:uppercase">'+esc(g.name)+'</b>'+
      '<span><span class="tag hot">Restmüll</span></span>'+
    '</div>'+
    '<div style="padding:10px 14px;display:flex;align-items:center;gap:10px">'+
      '<span style="font-size:12px;font-weight:700;color:var(--muted);flex:1">'+
        near+' Lead'+(near===1?'':'s')+' hier'+(rhy?(' · Restmüll '+esc(rhy)):'')+'</span>'+
      nav+
    '</div>'+
    targetUI+
  '</div>';
}
// Gewerbepark-Cluster (viele Firmen an einer Adresse) – je Firma tippen zum Erfassen
function parkList(g){
  var parks=S.parks[g.name]; if(!parks||!parks.length) return '';
  return '<div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:2px 0 6px">🏢 Gewerbepark-Cluster · viele Firmen an einer Adresse</div>'+
    parks.map(function(pk){
      var members=pk.firms.map(function(p){
        var done=leadHasPlace(p.place_id);
        return '<button data-act="startpark" data-name="'+esc(g.name)+'" data-pid="'+esc(p.place_id)+'" '+
          'style="display:block;width:100%;text-align:left;background:transparent;border:0;border-top:1px solid var(--line,rgba(0,0,0,.12));padding:7px 0;font-size:13px'+(done?';opacity:.55':'')+'">'+
          esc(p.firmenname)+(done?' · ✓':'')+'</button>';
      }).join('');
      return '<div style="border:1.5px solid var(--ink);padding:10px 12px;margin-bottom:8px">'+
        '<b style="font-size:13px">🏢 '+pk.firms.length+' Firmen · '+esc((pk.addr||'').split(',')[0])+'</b>'+
        members+
      '</div>';
    }).join('');
}
// Zielkunden-Liste je Gebiet (Wunschkunden oben, ✓ wenn bereits erfasst)
function targetList(g,stops){
  if(!stops.length) return '<div class="note" style="margin:0">Keine Restmüll-Zielbranchen im Umkreis gefunden.</div>';
  var rows=stops.map(function(p){
    var done=leadHasPlace(p.place_id);
    var potCls=p._pot>=3?'hot':'fill';
    return '<button class="'+(done?'':'')+'" data-act="starttarget" data-name="'+esc(g.name)+'" data-pid="'+esc(p.place_id)+'" '+
      'style="display:block;width:100%;text-align:left;border:1.5px solid var(--ink);background:var(--paper);padding:10px 12px;margin-bottom:8px'+(done?';opacity:.55':'')+'">'+
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">'+
        '<b style="font-size:14px">'+esc(p.firmenname)+'</b>'+
        '<span class="tag '+potCls+'" style="flex:none">★ '+esc(p._potLbl)+' · '+potText(p._pot)+'</span>'+
      '</div>'+
      '<div style="font-size:11px;color:var(--muted);margin-top:2px">'+esc(p.adresse||'')+(done?' · ✓ erfasst':'')+'</div>'+
    '</button>';
  }).join('');
  return '<div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:2px 0 6px">Zielkunden (Restmüll-intensiv) · tippen zum Erfassen</div>'+rows;
}

function renderSettings(){
  var k=S.keys;
  $app.innerHTML='<div class="screen">'+
    '<h1 class="t">Setup</h1><div class="sub">Keys nur lokal im Browser – nie an einen Server</div>'+

    '<div class="section"><h3>Google Maps Platform</h3>'+
      '<div class="note">Für Places Nearby (Firma + Adresse + Telefon). $200 Gratis-Guthaben/Monat.</div>'+
      '<div class="fld" style="margin-top:10px"><label>API-Key</label>'+
        '<input class="txt" type="password" data-key="google" value="'+esc(k.google||'')+'" placeholder="AIza…"/></div>'+
    '</div>'+

    '<div class="section"><h3>Gemini Bilderkennung (optional)</h3>'+
      '<div class="note">Erkennt Tonnen (Fraktion/Größe/Anzahl) + Entsorger-Logo automatisch aus dem Foto. Leer = manuell.</div>'+
      '<div class="fld" style="margin-top:10px"><label>Gemini API-Key</label>'+
        '<input class="txt" type="password" data-key="gemini" value="'+esc(k.gemini||'')+'" placeholder="AIza…"/></div>'+
    '</div>'+

    '<div class="section"><h3>Termin & Video (Selbstbuchung)</h3>'+
      '<div class="note" style="color:#1a7d34;font-weight:800">✓ RSS-Standard hinterlegt – „📅 Termin senden" ist einsatzbereit. Nur ändern, wenn du eigene Links nutzen willst.</div>'+
      '<div class="fld" style="margin-top:10px"><label>Terminbuchungs-Link</label>'+
        '<input class="txt" type="url" data-key="bookingLink" value="'+esc(k.bookingLink||RSS_TERMIN.booking)+'" placeholder="https://calendar.app.google/…"/></div>'+
      '<div class="fld"><label>Google-Meet-Link</label>'+
        '<input class="txt" type="url" data-key="meetLink" value="'+esc(k.meetLink||RSS_TERMIN.meet)+'" placeholder="https://meet.google.com/xxx-xxxx-xxx"/></div>'+
    '</div>'+

    '<div class="section"><h3>Team-Sync (Supabase)</h3>'+
      '<div class="note">Zentrale Datenbank: ALLE Nutzer sehen denselben Lead-Pool (laden + schreiben). '+
      'Auf jedem Gerät dieselbe URL + denselben Anon-Key eintragen. Leer = nur lokal auf diesem Gerät.</div>'+
      (supaOn()?('<div class="note" style="color:#1a7d34;font-weight:800">✓ Team-Sync aktiv · '+S.leads.filter(function(l){return l.sync_state==='synced';}).length+' synchronisiert · '+S.leads.filter(function(l){return l.sync_state!=='synced';}).length+' offen</div>'):'')+
      (S.lastSyncError?('<div class="note" style="border:1.5px solid var(--hot);color:var(--hot);font-weight:700;padding:8px 10px">Sync-Fehler: '+esc(S.lastSyncError)+'</div>'):'')+
      '<div class="fld" style="margin-top:10px"><label>Project URL</label>'+
        '<input class="txt" type="text" data-key="supaUrl" value="'+esc(k.supaUrl||'')+'" placeholder="https://xxx.supabase.co"/></div>'+
      '<div class="fld"><label>Anon Key</label>'+
        '<input class="txt" type="password" data-key="supaKey" value="'+esc(k.supaKey||'')+'" placeholder="eyJ…"/></div>'+
    '</div>'+

    '<button class="cta" data-act="savekeys">Speichern</button>'+
    '<button class="cta ghost" data-act="sync">Jetzt synchronisieren ('+S.leads.filter(function(l){return l.sync_state!=='synced';}).length+' offen)</button>'+

    '<span class="lab">Export</span>'+
    '<div class="row two">'+
      '<button class="chip" data-act="export" data-v="csv">CSV</button>'+
      '<button class="chip" data-act="export" data-v="json">JSON</button>'+
    '</div>'+

    '<span class="lab">Konto / Daten</span>'+
    '<div class="note" style="margin:0 0 8px">'+S.leads.length+' Leads auf diesem Gerät gespeichert.</div>'+
    '<button class="cta ghost" data-act="logout" style="margin-top:0">Logout (App sperren)</button>'+
    '<button class="cta" data-act="wipeleads" style="background:var(--hot);border-color:var(--hot)">Alle Leads löschen</button>'+
    '<div class="note">„Logout" verlangt beim nächsten Öffnen wieder den Passcode (Leads bleiben). '+
      '„Alle Leads löschen" macht einen sauberen Neustart und kann nicht rückgängig gemacht werden.</div>'+

    '<div class="note" style="margin-top:24px">DSGVO: Keine Personen / Kennzeichen mit fotografieren. '+
      'Ansprechpartner-Namen = personenbezogene Daten → Verarbeitungsverzeichnis pflegen.</div>'+
    '<div class="note" style="margin-top:14px;text-align:center">Version '+APP_VERSION+'</div>'+
  '</div>';
}

/* ---------- Detail-Sheet ---------- */
function renderSheet(){
  var ex=document.getElementById('mbg');
  if(S.picker){ renderPicker(); return; }
  if(!S.modal){ if(ex) ex.remove(); return; }
  var l=S.leads.find(function(x){return x.id===S.modal;});
  if(!l){ if(ex) ex.remove(); return; }
  var u=photoURL(l), f=FRAKTION[l.fraktion]||{label:l.fraktion};
  var html='<div id="mbg" data-act="closebg"><div id="sheet">'+
    '<div class="sh-head">'+
      '<b style="text-transform:uppercase;font-size:16px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(l.firmenname||'Unbekannter Betrieb')+'</b>'+
      (u?'<img class="headthumb" src="'+u+'" data-act="zoom" alt="Foto"/>':'')+
      '<button class="x" data-act="close">×</button>'+
    '</div>'+
    '<div class="sh-body">'+
      // ---- Badges (Kontaktstatus) ----
      '<div class="leadtop">'+
        contactBadge(l)+
        (l.hot_lead?'<span class="tag hot">🔥 Hot</span>':'')+
        '<span class="tag">Score '+l.score+'</span>'+
        (kalkulation(l).ersparnis_jahr>0?'<span class="tag fill">'+eur(kalkulation(l).ersparnis_jahr)+'/J sparen</span>':'')+
      '</div>'+

      // ---- Kontakt: direkt oben inline editierbar (leeres Feld antippen -> tippen -> speichert auto) ----
      '<span class="lab">Kontakt</span>'+
      '<input class="txt" style="margin-bottom:8px" data-edit="ap_name" data-id="'+l.id+'" value="'+esc(l.ap_name||'')+'" placeholder="Ansprechpartner (Name)"/>'+
      '<div class="tworow">'+
        '<input class="txt" data-edit="ap_telefon" data-id="'+l.id+'" inputmode="tel" value="'+esc(l.ap_telefon||'')+'" placeholder="Telefon"/>'+
        '<input class="txt" data-edit="ap_email" data-id="'+l.id+'" inputmode="email" value="'+esc(l.ap_email||'')+'" placeholder="E-Mail"/>'+
      '</div>'+
      '<div class="tworow" style="margin-top:8px">'+
        '<input class="txt" data-edit="website" data-id="'+l.id+'" inputmode="url" value="'+esc(l.website||'')+'" placeholder="Website"/>'+
        (l.website?'<a class="cta ghost" href="'+esc(httpize(l.website))+'" target="_blank" style="flex:none;padding:0 14px;display:flex;align-items:center;font-size:12px;text-decoration:none">↗ öffnen</a>':'')+
      '</div>'+
      '<button class="cta ghost" data-act="anreichern" data-id="'+l.id+'" style="margin-top:8px;padding:10px;font-size:12px">🔎 Anreichern (Website-Impressum → Ansprechpartner/E-Mail)</button>'+
      ((l.telefon||l.email)?'<div class="note" style="margin-top:6px">Firma: '+(l.telefon?('☎ '+esc(l.telefon)):'')+(l.email?((l.telefon?' · ':'')+esc(l.email)):'')+'</div>':'')+
      '<div class="note" style="margin-top:6px">'+esc(behaelterSummary(l))+' · '+esc(l.entsorger||(l.entsorger_logo?'Entsorger erkennbar':'Entsorger unbekannt'))+(l.adresse?(' · '+esc(l.adresse)):'')+'</div>'+

      // ==== AKQUISE-COCKPIT ====
      '<span class="lab">Status</span>'+
      '<div class="statusgrid">'+ STATUS.map(function(s){
        return '<button class="'+(l.status===s?'on':'')+'" data-act="status" data-id="'+l.id+'" data-v="'+s+'">'+STATUS_LBL[s]+'</button>';
      }).join('')+'</div>'+

      '<div class="actions" style="margin-top:12px">'+
        (apTel(l)?'<a class="pri" href="tel:'+esc(apTel(l))+'">▸ Anrufen'+(l.ap_name?(' · '+esc(l.ap_name.split(' ')[0])):'')+'</a>':'<button class="pri" data-act="secedit" data-id="'+l.id+'">Telefon eintragen</button>')+
        (l.lat?'<a href="https://www.google.com/maps?q='+l.lat+','+l.lng+'" target="_blank">Route</a>':'')+
      '</div>'+
      callCrmBlock(l)+
      historieBlock(l)+
      terminBlock(l)+

      // ==== ANGEBOT ====
      '<span class="lab">Angebot</span>'+
      offerBox(l)+
      ((kalkulation(l).rss_preis_monat>0)?'<button class="cta" data-act="shareangebot" data-id="'+l.id+'">📎 Angebot teilen (Mail / WhatsApp)</button>':'')+
      ((kalkulation(l).rss_preis_monat>0)?'<button class="cta ghost" data-act="openoffer" data-id="'+l.id+'" style="margin-top:8px">📄 Angebot öffnen / drucken</button>':'')+
      angebotListe(l)+

      // ==== BEARBEITEN (einklappbar) ====
      '<button class="cta ghost" data-act="secedit" data-id="'+l.id+'" style="margin-top:18px">'+(S.secEdit?'▴ Bearbeiten schließen':'▾ Bearbeiten (Ansprechpartner · Firma · Tonnen · Notiz)')+'</button>'+
      (S.secEdit ? (
        '<span class="lab">Fotos</span>'+
        photoGallery(l)+

        '<span class="lab">Ansprechpartner – Rolle</span>'+
        '<input class="txt" style="margin-bottom:8px" data-edit="ap_rolle" data-id="'+l.id+'" value="'+esc(l.ap_rolle||'')+'" placeholder="Rolle/Funktion (Inhaber, GF, Einkauf…)"/>'+

        '<span class="lab" id="tonnen-editor">Tonnen vor Ort</span>'+
        containersOf(l).map(function(c,i){ return binBlockLead(l,c,i); }).join('')+
        '<button class="cta ghost" data-act="laddbin" data-id="'+l.id+'" style="margin-top:0;margin-bottom:6px">+ Weitere Tonne</button>'+

        '<span class="lab">Firma (allgemein)</span>'+
        '<input class="txt" style="margin-bottom:8px" data-edit="firmenname" data-id="'+l.id+'" value="'+esc(l.firmenname||'')+'" placeholder="Firmenname"/>'+
        '<input class="txt" style="margin-bottom:8px" data-edit="telefon" data-id="'+l.id+'" inputmode="tel" value="'+esc(l.telefon||'')+'" placeholder="Firmen-Telefon (Zentrale)"/>'+
        '<input class="txt" style="margin-bottom:8px" data-edit="email" data-id="'+l.id+'" inputmode="email" value="'+esc(l.email||'')+'" placeholder="Firmen-E-Mail (allgemein)"/>'+
        '<input class="txt" style="margin-bottom:8px" data-edit="adresse" data-id="'+l.id+'" value="'+esc(l.adresse||'')+'" placeholder="Adresse (Straße, Ort)"/>'+
        '<span class="lab">Notiz (Stammdaten)</span>'+
        '<textarea data-edit="notiz" data-id="'+l.id+'" placeholder="Freitext…">'+esc(l.notiz||'')+'</textarea>'+
        '<button class="cta" data-act="saveedit" data-id="'+l.id+'" style="margin-top:8px">Speichern</button>'+
        ((l._candidates&&l._candidates.length>1)?
          '<button class="cta ghost" data-act="pick" data-id="'+l.id+'">Anderen Betrieb wählen ('+l._candidates.length+')</button>':'')+
        (l.website?'<div class="actions" style="grid-template-columns:1fr;margin-top:8px"><a href="'+esc(l.website)+'" target="_blank">Website öffnen</a></div>':'')
      ) : '')+

      // ==== VERWALTUNG ====
      '<span class="lab">Verwaltung</span>'+
      '<div class="note" style="margin:0 0 8px">Erfasst: '+new Date(l.created_at).toLocaleString('de-DE')+'</div>'+
      '<div class="actions" style="grid-template-columns:1fr 1fr">'+
        '<button data-act="resetcrm" data-id="'+l.id+'">↺ CRM zurücksetzen</button>'+
        '<button data-act="del" data-id="'+l.id+'" style="border-color:#ff2d2d;color:#ff2d2d">Lead löschen</button>'+
      '</div>'+
    '</div></div></div>';
  mount(html);
}
function kv(k,v){ return '<div class="kv"><span class="k">'+esc(k)+'</span><span class="v">'+esc(v)+'</span></div>'; }
// Kosten je einzelnem Behälter (aktuell Landkreis -> mit RSS), passend zu kalkulation()
function containerCalc(l){
  var rh=(l&&l.rhythmus)||'14t';
  var rabatt=(l&&l.rabatt!=null)?l.rabatt:RABATT;
  return containersOf(l).map(function(c){
    var n=c.anzahl||1, o={ fraktion:c.fraktion, volumen:c.volumen, anzahl:n, kommunalMt:null, rssMt:null, note:'' };
    if(c.fraktion==='restmuell'){
      var t=TARIF.restmuell[c.volumen], jahr=t?(t[rh]!=null?t[rh]:t['14t']):null;
      if(jahr!=null){ o.kommunalMt=(jahr/12)*n; o.rssMt=o.kommunalMt*(1-rabatt); }
      else o.note='keine Kommunalgröße (660 L = privat)';
    } else if(c.fraktion==='papier'){ o.kommunalMt=0; o.rssMt=0; o.note='kommunal gratis · RSS inklusive'; }
    else { o.kommunalMt=0; o.rssMt=0; o.note='kommunal inklusive'; }
    return o;
  });
}
function offerBox(l){
  var k=kalkulation(l);
  var pct=Math.round((k.rabatt||0.10)*100);
  var rhyBtns='<div class="row two" style="margin-bottom:8px">'+
    '<button class="chip'+(k.rhythmus==='14t'?' on':'')+'" data-act="rhythmus" data-id="'+l.id+'" data-v="14t">14-täglich</button>'+
    '<button class="chip'+(k.rhythmus==='woe'?' on':'')+'" data-act="rhythmus" data-id="'+l.id+'" data-v="woe">wöchentlich</button>'+
  '</div>';
  var rabBtns='<div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin:2px 0 6px">Kundenrabatt: '+pct+' %</div>'+
    '<div class="row" style="grid-template-columns:repeat(5,1fr);margin-bottom:10px">'+
    [5,10,15,20,25].map(function(p){
      return '<button class="chip'+(pct===p?' on':'')+'" data-act="rabatt" data-id="'+l.id+'" data-v="'+p+'">'+p+'%</button>';
    }).join('')+'</div>';
  var opt = (k.ersparnis_monat<=0 && k.kosten_monat>0) ?
    '<div class="note" style="border:1px solid var(--hot);color:var(--hot);padding:8px 10px;margin-top:8px">Bei dieser Größe spart der Kunde nichts — die Pflichttonne frisst den Rabatt. Lohnt sich erst bei großen Tonnen (1.100 L).</div>' : '';
  var warn = (k.ek_unvollstaendig?'<div class="note">⚠ Veolia-EK nur für 1.100 L hinterlegt — kleinere Volumen unvollständig.</div>':'')+
             (k.privat?'<div class="note">⚠ 660 L hat keinen Kommunaltarif (private Größe).</div>':'');
  var lm=LEER_MT[k.rhythmus]||(26/12), proLeerung=lm>0?(k.rss_preis_monat/lm):0, leerJahr=Math.round(lm*12);
  var turnusLbl=k.rhythmus==='woe'?'wöchentlich':'14-täglich';

  // Tabelle: je Tonne aktuell (Landkreis) -> mit RSS -> Ersparnis
  var rows=containerCalc(l).map(function(r){
    var label=r.anzahl+'× '+r.volumen+' L '+(FRAKTION[r.fraktion]?FRAKTION[r.fraktion].label:r.fraktion);
    var ist = r.kommunalMt!=null ? eur(r.kommunalMt) : '—';
    var soll = r.rssMt==null ? '—' : (r.rssMt>0?eur(r.rssMt):'inkl.');
    var spar = (r.kommunalMt!=null && r.rssMt!=null) ? (r.kommunalMt-r.rssMt) : 0;
    return '<tr><td>'+esc(label)+(r.note?'<br><span class="tnote">'+esc(r.note)+'</span>':'')+'</td>'+
      '<td class="r">'+ist+'</td><td class="r">'+soll+'</td><td class="r">'+(spar>0?eur(spar):'—')+'</td></tr>';
  }).join('');
  var grossSpar=k.kosten_monat-k.rss_preis_monat;
  var table='<table class="pt">'+
    '<tr><th>Behälter</th><th class="r">Aktuell</th><th class="r">Mit RSS</th><th class="r">Spart</th></tr>'+
    rows+
    '<tr class="sum"><td>Gewerblich gesamt</td><td class="r">'+eur(k.kosten_monat)+'</td><td class="r">'+eur(k.rss_preis_monat)+'</td><td class="r">'+eur(grossSpar)+'</td></tr>'+
    (k.pflicht_monat>0?'<tr><td>+ Pflichttonne 40 L</td><td class="r">—</td><td class="r">'+eur(k.pflicht_monat)+'</td><td class="r">−'+eur(k.pflicht_monat)+'</td></tr>':'')+
    '<tr class="save"><td colspan="4">★ KUNDE SPART '+eur(k.ersparnis_monat)+' / Monat  ·  '+eur(k.ersparnis_jahr)+' / Jahr</td></tr>'+
  '</table>'+
  '<div class="tnote" style="margin:-4px 0 8px">Beträge netto € / Monat · Turnus '+turnusLbl+' · Ersparnis nach Pflichttonne</div>';

  var paybox='<div class="paybox">'+
    '<div class="pl">Kunde zahlt mit RSS</div>'+
    '<div class="pm"><b>'+eur(k.rss_preis_monat)+'</b> / Monat &nbsp;·&nbsp; <b>'+eur(k.rss_preis_monat*12)+'</b> / Jahr</div>'+
    (k.rss_preis_monat>0?'<div class="pb">'+eur2(proLeerung)+' je Leerung × '+leerJahr+' Leerungen/Jahr · '+turnusLbl+'</div>':'<div class="pb">Preis erst ab Kommunaltarif (z. B. 1.100 L)</div>')+
    (k.pflicht_monat>0?'<div class="pb">Pflichttonne 40 L: '+eur(k.pflicht_monat)+'/Mt zahlt der Kunde weiter an den Landkreis</div>':'')+
  '</div>';

  return '<div class="offerbox"><div class="oh">Preis & Kalkulation</div><div class="ob">'+
    rhyBtns+ rabBtns+
    table+
    '<button class="cta ghost" data-act="edittonnen" data-id="'+l.id+'" style="margin:2px 0 4px;padding:9px;font-size:12px">🗑 Tonnen ändern</button>'+
    opt+warn+
    paybox+
    '<div class="note" style="margin-top:8px">Intern: RSS-Marge <b>'+eur(k.rss_marge_monat)+'</b>/Mt · '+eur(k.rss_marge_jahr)+'/Jahr ('+pct+' % Kundenrabatt)</div>'+
    '<button class="cta ghost" style="margin-top:10px" data-act="calctoggle">'+(S.calcOpen?'Herleitung verbergen ▴':'📊 Herleitung im Detail ▾')+'</button>'+
    (S.calcOpen?calcBreakdown(l,k):'')+
  '</div></div>';
}
// Echtes PDF (Vektor, scharfer Text) via jsPDF – identisches Layout wie das HTML-Angebot.
function jsPDFCtor(){ return (window.jspdf && window.jspdf.jsPDF) || null; }
function buildAngebotPDF(snap){
  var J=jsPDFCtor(); if(!J) return null;
  var A=RSS_ABSENDER;
  var doc=new J({unit:'mm',format:'a4'});
  var M=18, R=192;                         // Ränder: Inhalt von 18..192 mm
  var GRAY=[110,110,110], LIGHT=[242,242,242], LINE=[210,210,210], ORANGE=[232,117,43];
  var datum=new Date(snap.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'});
  var nr=String(snap.id||'').replace('ang-','').slice(0,10);
  var firma=snap.firmenname||'Ihr Betrieb';
  var leistung=behaelterSummary(snap);
  var p=snap.preis||{woe:{monat:0,leerung:0},vt:{monat:0,leerung:0}};
  var chosenVt=(snap.turnus!=='woe');
  var money=function(v){ return v>0?eur2(v):'auf Anfrage'; };
  var g=function(){ doc.setTextColor(GRAY[0],GRAY[1],GRAY[2]); };
  var blk=function(){ doc.setTextColor(0,0,0); };

  // Logo (2:1) + Kopf rechts
  try{ if(typeof RSS_LOGO!=='undefined' && RSS_LOGO) doc.addImage(RSS_LOGO,'PNG',M,13,54,27); }catch(e){}
  doc.setFont('helvetica','bold'); doc.setFontSize(13); blk(); doc.text('Angebot',R,18,{align:'right'});
  doc.setFont('helvetica','normal'); doc.setFontSize(10); g();
  doc.text('Nr. '+nr,R,24,{align:'right'}); doc.text(datum,R,29,{align:'right'});

  // Absender + Trennlinie
  doc.setFont('helvetica','bold'); doc.setFontSize(11); blk(); doc.text(A.firma+' '+A.zusatz,M,48);
  doc.setFont('helvetica','normal'); doc.setFontSize(9.5); g(); doc.text(A.strasse+' · '+A.ort,M,53);
  doc.setDrawColor(0,0,0); doc.setLineWidth(0.5); doc.line(M,57,R,57);

  // Titel
  doc.setFont('helvetica','bold'); doc.setFontSize(19); blk();
  doc.text('Angebot – Gewerbliche',M,70); doc.text('Abfallentsorgung',M,79);

  // Für / Leistung
  var y=93;
  doc.setFont('helvetica','bold'); doc.setFontSize(8); g();
  doc.text('FÜR',M,y); doc.text('LEISTUNG',M+92,y);
  doc.setFontSize(11); blk(); doc.text(firma,M,y+6);
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  var fy=y+11;
  if(snap.ap_name){ doc.text('z. Hd. '+snap.ap_name,M,fy); fy+=5; }
  if(snap.adresse){ doc.text(doc.splitTextToSize(snap.adresse,80),M,fy); }
  doc.text('Gewerbliche Restabfallentsorgung',M+92,y+6);
  doc.text(doc.splitTextToSize(leistung,72),M+92,y+11);

  // Preistabelle
  var ty=124, cTurnus=112, cLeerR=158, cMonR=R;
  doc.setFont('helvetica','bold'); doc.setFontSize(8); g();
  doc.text('LEISTUNG',M,ty); doc.text('TURNUS',cTurnus,ty);
  doc.text('PREIS / LEERUNG',cLeerR,ty,{align:'right'}); doc.text('PREIS / MONAT',cMonR,ty,{align:'right'});
  doc.setDrawColor(0,0,0); doc.setLineWidth(0.4); doc.line(M,ty+2.5,R,ty+2.5);

  var row=function(ry,turnus,leerung,monat,on){
    if(on){ doc.setFillColor(LIGHT[0],LIGHT[1],LIGHT[2]); doc.rect(M-2,ry-5.5,(R-M)+4,13,'F'); }
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5); blk();
    doc.text(doc.splitTextToSize('Restabfallentsorgung · '+leistung,86),M,ry);
    doc.setFontSize(10.5); doc.text(turnus,cTurnus,ry);
    if(on){ doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(ORANGE[0],ORANGE[1],ORANGE[2]); doc.text('» gewählt',cTurnus,ry+4.5); blk(); }
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.text(money(leerung),cLeerR,ry,{align:'right'});
    doc.setFont('helvetica','bold'); doc.text(money(monat),cMonR,ry,{align:'right'});
    doc.setDrawColor(LINE[0],LINE[1],LINE[2]); doc.setLineWidth(0.2); doc.line(M,ry+7.5,R,ry+7.5);
  };
  row(ty+11,'14-täglich',p.vt.leerung,p.vt.monat,chosenVt);
  row(ty+24,'wöchentlich',p.woe.leerung,p.woe.monat,!chosenVt);

  // Hinweis + Text
  var yn=ty+36; doc.setFont('helvetica','normal'); doc.setFontSize(8.5); g();
  doc.text(doc.splitTextToSize('Preise netto zzgl. gesetzl. MwSt. Ein Festpreis – inkl. Behältergestellung, Abfuhr und Entsorgung. Keine versteckten Zuschläge.',R-M),M,yn);
  var yt=yn+10; doc.setFontSize(10.5); blk();
  doc.text(doc.splitTextToSize('Wir übernehmen die gewerbliche Restabfallentsorgung an Ihrem Standort – ein Ansprechpartner, kein Umstellungsaufwand. Die gesetzliche Pflichtrestmülltonne verbleibt beim Landkreis.',R-M),M,yt);
  var yc=yt+16; doc.setFont('helvetica','bold'); doc.text('Nächster Schritt:',M,yc);
  doc.setFont('helvetica','normal'); doc.text(doc.splitTextToSize('Antworten Sie einfach auf dieses Angebot oder rufen Sie uns an – wir richten alles ein.',R-M-30),M+30,yc);

  // Fuß
  var yf=270; doc.setDrawColor(LINE[0],LINE[1],LINE[2]); doc.setLineWidth(0.3); doc.line(M,yf,R,yf);
  doc.setFontSize(8.5); g();
  doc.setFont('helvetica','bold'); doc.text(A.firma+' '+A.zusatz,M,yf+6);
  doc.setFont('helvetica','normal');
  doc.text('Barmbeker Straße 23a · 22303 Hamburg · Geschäftsführer: '+A.gf,M,yf+11);
  doc.text('Tel. '+A.tel+' · '+A.mail+' · '+A.web,M,yf+15.5);
  doc.text('Angebot freibleibend. Preise netto zzgl. gesetzl. MwSt. Laufzeit und Kündigung nach Vereinbarung.',M,yf+20);
  return doc;
}

// Kundendokument: druck-/teilbares Angebot (ohne interne Marge!)
// snap = eingefrorenes Angebot (angebotSnapshot) – so bleibt ein gespeichertes Angebot
// unverändert, auch wenn der Lead später bearbeitet wird.
function buildAngebot(snap){
  var A=RSS_ABSENDER;
  var datum=new Date(snap.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'});
  var nr=String(snap.id||'').replace('ang-','').slice(0,10);
  var firma=esc(snap.firmenname||'Ihr Betrieb');
  var adr=esc(snap.adresse||'');
  var ap=esc(snap.ap_name||'');
  var leistung=esc(behaelterSummary(snap));
  var p=snap.preis||{woe:{monat:0,leerung:0},vt:{monat:0,leerung:0}};
  var chosenVt=(snap.turnus!=='woe');
  var logoHtml=(typeof RSS_LOGO!=='undefined' && RSS_LOGO)
    ? '<img src="'+RSS_LOGO+'" alt="RSS – Recycling Solution Service" style="width:200px;max-width:55%;height:auto;display:block"/>'
    : '<div class="mark">RSS</div>';
  var preisZelle=function(v){ return v>0 ? eur2(v) : 'auf Anfrage'; };
  var row=function(lbl,turnus,leerung,monat,on){
    return '<tr'+(on?' class="on"':'')+'>'+
      '<td>'+lbl+(on?' <span class="badge">gewählt</span>':'')+'</td>'+
      '<td>'+turnus+'</td>'+
      '<td class="r">'+preisZelle(leerung)+'</td>'+
      '<td class="r"><b>'+preisZelle(monat)+'</b></td></tr>';
  };
  return '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"/>'+
  '<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Angebot '+firma+'</title>'+
  '<style>*{box-sizing:border-box}body{font-family:Helvetica,Arial,sans-serif;color:#000;max-width:720px;margin:0 auto;padding:28px;line-height:1.5}'+
  '.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:12px}'+
  '.mark{display:inline-flex;width:44px;height:44px;border:2.5px solid #000;align-items:center;justify-content:center;font-weight:800;font-size:13px}'+
  '.brand b{font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:.02em}'+
  '.brand div{font-size:11px;color:#555}'+
  '.meta{text-align:right;font-size:12px;color:#333}'+
  '.meta b{font-size:13px}'+
  'h1{font-size:22px;font-weight:800;text-transform:uppercase;letter-spacing:-.5px;margin:22px 0 4px}'+
  '.grid{display:flex;gap:24px;margin:14px 0 6px;font-size:13px}'+
  '.grid .box{flex:1}.grid .lab{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#888;margin-bottom:3px}'+
  'table{width:100%;border-collapse:collapse;margin:16px 0}'+
  'th{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#666;text-align:left;border-bottom:2px solid #000;padding:8px}'+
  'td{padding:11px 8px;border-bottom:1px solid #ddd;font-size:15px}'+
  'th.r,td.r{text-align:right}'+
  'tr.on td{background:#f2f2f2}'+
  '.badge{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;background:#000;color:#fff;padding:1px 6px;margin-left:6px}'+
  '.note{font-size:11px;color:#777;margin-top:20px;line-height:1.6}'+
  '.foot{border-top:1px solid #ccc;margin-top:26px;padding-top:12px;font-size:10.5px;color:#666;line-height:1.6}'+
  '.btn{background:#000;color:#fff;border:0;padding:12px 18px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;margin-top:18px}'+
  '@media print{.btn{display:none}body{padding:0}}</style></head><body>'+

  '<div class="head">'+
    '<div>'+logoHtml+
      '<div class="brand" style="margin-top:8px"><b>'+esc(A.firma)+' '+esc(A.zusatz)+'</b><div>'+esc(A.strasse)+' · '+esc(A.ort)+'</div></div>'+
    '</div>'+
    '<div class="meta"><b>Angebot</b><br>Nr. '+esc(nr)+'<br>'+datum+'</div>'+
  '</div>'+

  '<h1>Angebot – Gewerbliche<br>Abfallentsorgung</h1>'+

  '<div class="grid">'+
    '<div class="box"><div class="lab">Für</div><b>'+firma+'</b>'+(ap?('<br>z. Hd. '+ap):'')+(adr?('<br>'+adr):'')+'</div>'+
    '<div class="box"><div class="lab">Leistung</div>Gewerbliche Restabfallentsorgung<br>'+leistung+'</div>'+
  '</div>'+

  '<table>'+
    '<tr><th>Leistung</th><th>Turnus</th><th class="r">Preis / Leerung</th><th class="r">Preis / Monat</th></tr>'+
    row('Restabfallentsorgung · '+leistung, '14-täglich', p.vt.leerung, p.vt.monat, chosenVt)+
    row('Restabfallentsorgung · '+leistung, 'wöchentlich', p.woe.leerung, p.woe.monat, !chosenVt)+
  '</table>'+
  '<div class="note">Preise netto zzgl. gesetzl. MwSt. Ein Festpreis – inkl. Behältergestellung, Abfuhr und Entsorgung. Keine versteckten Zuschläge.</div>'+

  '<p style="font-size:14px;margin-top:18px">Wir übernehmen die gewerbliche Restabfallentsorgung an Ihrem Standort – ein Ansprechpartner, kein Umstellungsaufwand. Die gesetzliche Pflichtrestmülltonne verbleibt beim Landkreis.</p>'+
  '<p style="font-size:14px"><b>Nächster Schritt:</b> Antworten Sie einfach auf dieses Angebot oder rufen Sie uns an – wir richten alles ein.</p>'+

  '<button class="btn" onclick="window.print()">Als PDF speichern / Drucken</button>'+

  '<div class="foot">'+
    '<b>'+esc(A.firma)+' '+esc(A.zusatz)+'</b> · '+esc(A.strasse)+' · '+esc(A.ort)+'<br>'+
    'Geschäftsführer: '+esc(A.gf)+' · Tel. '+esc(A.tel)+' · '+esc(A.mail)+' · '+esc(A.web)+'<br>'+
    'Angebot freibleibend. Preise netto zzgl. gesetzl. MwSt. Laufzeit und Kündigung nach Vereinbarung. Keine Rechtsberatung.'+
  '</div>'+
  '</body></html>';
}
// Angebot als Snapshot einfrieren (bleibt erhalten, auch wenn der Lead sich ändert)
function angebotSnapshot(l){
  var base=kalkulation(l);
  var kw=kalkulation(Object.assign({},l,{rhythmus:'woe'}));   // wöchentlich
  var kv=kalkulation(Object.assign({},l,{rhythmus:'14t'}));   // 14-täglich
  return { id:'ang-'+Date.now()+'-'+Math.floor(Math.random()*1e4), created_at:Date.now(),
    firmenname:l.firmenname||'', adresse:l.adresse||'', ap_name:l.ap_name||'',
    behaelter:containersOf(l).map(function(c){ return {fraktion:c.fraktion,volumen:c.volumen,anzahl:c.anzahl||1}; }),
    turnus:base.rhythmus,
    preis:{
      woe:{ monat:kw.rss_preis_monat, leerung:kw.rss_preis_monat/(52/12) },
      vt: { monat:kv.rss_preis_monat, leerung:kv.rss_preis_monat/(26/12) }
    },
    k:base };   // k nur intern (Angebotsliste im Sheet), NICHT im Kundendokument
}
function openAngebotDoc(snap){
  var doc=buildAngebotPDF(snap);                       // echtes PDF bevorzugt
  if(doc){ var u=doc.output('bloburl'); var wp=window.open(u,'_blank'); if(!wp) location.href=u; return; }
  var blob=new Blob([buildAngebot(snap)],{type:'text/html'});   // Fallback: HTML
  var url=URL.createObjectURL(blob);
  var w=window.open(url,'_blank');
  if(!w){ location.href=url; }   // Popup blockiert -> im selben Tab öffnen
}
// Neues Angebot erstellen: beim Lead speichern UND öffnen
function createAngebot(id){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  var snap=angebotSnapshot(l);
  l.angebote=l.angebote||[]; l.angebote.unshift(snap);
  l.updated_at=Date.now();
  dbPut(stripRuntime(l)).then(function(){ syncLead(l); });
  openAngebotDoc(snap); renderSheet();
  toast('Angebot gespeichert');
}
function openSavedAngebot(id,aid){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l||!l.angebote) return;
  var snap=l.angebote.find(function(a){return a.id===aid;}); if(snap) openAngebotDoc(snap);
}
// nur DIESES Angebot löschen – der Lead bleibt
function delAngebot(id,aid){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l||!l.angebote) return;
  l.angebote=l.angebote.filter(function(a){return a.id!==aid;});
  l.updated_at=Date.now();
  dbPut(stripRuntime(l)).then(function(){ syncLead(l); });
  renderSheet(); toast('Angebot gelöscht');
}
// Liste der gespeicherten Angebote eines Leads
function angebotListe(l){
  var arr=l.angebote||[]; if(!arr.length) return '';
  return '<span class="lab">Erstellte Angebote ('+arr.length+')</span>'+
    arr.map(function(a){
      var d=new Date(a.created_at).toLocaleDateString('de-DE');
      var k=a.k||{};
      return '<div style="display:flex;align-items:center;gap:8px;border:1.5px solid var(--ink);padding:10px 12px;margin-bottom:8px">'+
        '<div style="flex:1"><b style="font-size:13px">'+esc(d)+'</b>'+
          '<div style="font-size:11px;color:var(--muted)">Ersparnis '+eur(k.ersparnis_jahr||0)+'/J · '+
            (k.rhythmus==='woe'?'wöchentl.':'14-tägl.')+' · '+Math.round((k.rabatt||0.1)*100)+'%</div></div>'+
        '<button data-act="openangebot" data-id="'+l.id+'" data-aid="'+esc(a.id)+'" style="border:1.5px solid var(--ink);font-size:11px;font-weight:800;padding:7px 10px">Öffnen</button>'+
        '<button data-act="delangebot" data-id="'+l.id+'" data-aid="'+esc(a.id)+'" style="border:1.5px solid var(--hot);color:var(--hot);font-size:14px;font-weight:800;padding:7px 10px">✕</button>'+
      '</div>';
    }).join('');
}
function calcBreakdown(l,k){
  var pct=Math.round((k.rabatt||0.10)*100);
  var ekZeilen = '· Veolia Restmüll: <b>'+eur(k.ek_rest_monat)+'/Mt</b><br>'+
    (k.papier1100 ? '· Veolia Papier (1.100 L, RSS-getragen): <b>'+eur(k.ek_pap_monat)+'/Mt</b><br>' : '');
  return '<div class="note" style="border:1.5px solid var(--ink);padding:12px;margin-top:8px;line-height:1.6">'+
    '<b style="text-transform:uppercase">So entsteht die Rechnung</b><br><br>'+

    '<b>① Heute zahlt der Kunde an die Stadt</b> (kommunal): '+eur(k.kosten_monat)+'/Mt<br><br>'+

    '<b>② RSS-Preis = '+pct+' % unter Kommunal:</b> '+eur(k.rss_preis_monat)+'/Mt<br>'+
    '<b>+ Pflicht-Restmülltonne 40 L</b> (zahlt Kunde weiter an die Stadt): '+eur(k.pflicht_monat)+'/Mt<br>'+
    '<b>= neue Gesamtkosten:</b> '+eur(k.neu_gesamt_monat)+'/Mt<br><br>'+

    '<b>③ Kunde spart:</b> '+eur(k.kosten_monat)+' − '+eur(k.neu_gesamt_monat)+' = <b>'+eur(k.ersparnis_monat)+'/Mt ('+eur(k.ersparnis_jahr)+'/J)</b><br>'+
    '<span style="color:var(--muted)">Das ist '+pct+' % minus die Pflichttonne ('+eur(k.pflicht_monat)+'/Mt) — die zahlt der Kunde ja weiter.</span><br><br>'+

    '<b>④ RSS-Marge = RSS-Preis − Veolia-EK:</b><br>'+ ekZeilen +
    eur(k.rss_preis_monat)+' − '+eur(k.rss_kosten_monat)+' = <b>'+eur(k.rss_marge_monat)+'/Mt ('+eur(k.rss_marge_jahr)+'/Jahr)</b><br><br>'+

    '<span style="color:var(--muted)">Die Pflichtmülltonne ist keine RSS-Kost (Kunde zahlt sie an die Stadt), schmälert aber seine Ersparnis. '+
    'Papier bis 240 L bleibt kommunal gratis; eine 1.100-L-Papiertonne stellt RSS über Veolia (in der Marge berücksichtigt).</span>'+
  '</div>';
}
function photoGallery(l){
  var u=photoURL(l), extras=extraPhotoURLs(l), html='';
  if(u){
    html+='<div style="position:relative;margin-bottom:8px">'+
      '<img class="sh-photo" src="'+u+'" data-act="zoom" style="cursor:zoom-in"/>'+
      '<label style="position:absolute;right:8px;bottom:8px;background:var(--ink);color:var(--paper);font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:8px 10px;cursor:pointer">🔄 Hauptfoto tauschen'+
        '<input type="file" accept="image/*" data-act="mainphoto" data-id="'+l.id+'" style="display:none"/></label>'+
      '<div style="position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:5px 8px;pointer-events:none">🔍 Tippen zum Zoomen</div>'+
    '</div>';
  }
  if(extras.length){
    html+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'+
      extras.map(function(src,i){
        return '<div style="position:relative;width:84px;height:84px">'+
          '<img src="'+src+'" data-act="zoom" style="width:84px;height:84px;object-fit:cover;border:1.5px solid var(--ink);cursor:zoom-in"/>'+
          '<button data-act="delphoto" data-id="'+l.id+'" data-i="'+i+'" style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;background:var(--hot);color:#fff;border:0;font-weight:800;line-height:1;font-size:13px">×</button>'+
        '</div>';
      }).join('')+'</div>';
  }
  // Foto hinzufügen: Kamera ODER vorhandenes Galerie-Foto (ohne capture = Auswahl)
  html+='<div class="row two" style="margin-top:0">'+
    '<label class="cta ghost" style="margin-top:0;cursor:pointer;display:flex;justify-content:center">📷 Kamera'+
      '<input type="file" accept="image/*" capture="environment" data-act="addphoto" data-id="'+l.id+'" style="display:none"/></label>'+
    '<label class="cta ghost" style="margin-top:0;cursor:pointer;display:flex;justify-content:center">📁 Galerie'+
      '<input type="file" accept="image/*" data-act="addphoto" data-id="'+l.id+'" style="display:none"/></label>'+
  '</div>';
  if(S.keys.gemini){
    html+='<label class="cta'+(l._scanning?'':' ghost')+'" style="margin-top:8px;cursor:pointer;display:flex">'+
      (l._scanning?'🏷️ wird gelesen…':'🏷️ Behälter-Aufkleber scannen → Adresse & Firma')+
      '<input type="file" accept="image/*" data-act="scanbinlabel" data-id="'+l.id+'" style="display:none"'+(l._scanning?' disabled':'')+'/></label>';
    html+='<label class="cta ghost" style="margin-top:8px;cursor:pointer;display:flex">'+
      '🪧 Firmenschild scannen → Firma/Adresse'+
      '<input type="file" accept="image/*" data-act="scansign" data-id="'+l.id+'" style="display:none"'+(l._scanning?' disabled':'')+'/></label>';
  }
  return html;
}
/* Vollbild-Lightbox mit echtem Pinch-Zoom + Ziehen + Doppeltipp.
   Eigene Touch-Gesten (CSS-Transform), weil die Viewport-Meta (maximum-scale=1)
   natives Pinch-Zoom sperrt. Für Aufkleber/Schilder auf Lead-Fotos lesbar machen. */
function openLightbox(src){
  if(!src) return;
  closeLightbox();
  var ov=document.createElement('div');
  ov.id='lightbox';
  ov.style.cssText='position:fixed;inset:0;z-index:9999;background:#000;overflow:hidden;touch-action:none';
  var hint=document.createElement('div');
  hint.style.cssText='position:absolute;left:0;right:0;bottom:0;z-index:2;text-align:center;color:#fff;pointer-events:none;padding:12px';
  hint.innerHTML='<span style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;background:rgba(0,0,0,.5);padding:6px 10px;border-radius:4px">2 Finger zoomen · ziehen · Doppeltipp</span>';
  var x=document.createElement('button');
  x.textContent='✕';
  x.style.cssText='position:absolute;top:12px;right:12px;z-index:3;background:#fff;color:#000;border:0;font-weight:800;font-size:20px;width:42px;height:42px;border-radius:50%;cursor:pointer';
  x.onclick=closeLightbox;
  var img=document.createElement('img');
  img.src=src; img.draggable=false;
  img.style.cssText='position:absolute;top:50%;left:50%;max-width:100vw;max-height:100vh;will-change:transform;user-select:none;-webkit-user-drag:none';
  ov.appendChild(img); ov.appendChild(hint); ov.appendChild(x);
  document.body.appendChild(ov);

  var scale=1, tx=0, ty=0;
  function apply(){ img.style.transform='translate(-50%,-50%) translate('+tx+'px,'+ty+'px) scale('+scale+')'; }
  apply();
  function dist(t){ return Math.hypot(t[0].clientX-t[1].clientX, t[0].clientY-t[1].clientY); }

  var mode=null, sDist=0, sScale=1, sx=0, sy=0, sTx=0, sTy=0, lastTap=0;
  ov.addEventListener('touchstart',function(e){
    if(e.target===x) return;                         // Schließen-Button normal tippbar lassen
    if(e.touches.length===2){
      mode='pinch'; sDist=dist(e.touches); sScale=scale; sTx=tx; sTy=ty;
    } else if(e.touches.length===1){
      var now=Date.now();
      if(now-lastTap<300){ if(scale>1){scale=1;tx=0;ty=0;}else{scale=2.5;} apply(); mode=null; lastTap=0; e.preventDefault(); return; }
      lastTap=now; mode='pan'; sx=e.touches[0].clientX; sy=e.touches[0].clientY; sTx=tx; sTy=ty;
    }
    e.preventDefault();
  },{passive:false});
  ov.addEventListener('touchmove',function(e){
    if(mode==='pinch' && e.touches.length===2){
      scale=Math.min(6,Math.max(1, sScale*(dist(e.touches)/(sDist||1)))); apply();
    } else if(mode==='pan' && e.touches.length===1 && scale>1){
      tx=sTx+(e.touches[0].clientX-sx); ty=sTy+(e.touches[0].clientY-sy); apply();
    }
    e.preventDefault();
  },{passive:false});
  ov.addEventListener('touchend',function(e){
    if(scale<=1){ scale=1; tx=0; ty=0; apply(); }
    if(!e.touches.length) mode=null;
  });
  // Desktop
  img.addEventListener('dblclick',function(e){ if(scale>1){scale=1;tx=0;ty=0;}else{scale=2.5;} apply(); e.stopPropagation(); });
  ov.addEventListener('wheel',function(e){ e.preventDefault(); scale=Math.min(6,Math.max(1, scale - e.deltaY*0.0025)); if(scale<=1){tx=0;ty=0;} apply(); },{passive:false});
  ov.addEventListener('click',function(e){ if(e.target===ov && scale<=1) closeLightbox(); });   // Tippen auf schwarzen Rand schließt (nur unzoomed)
}
function closeLightbox(){ var o=document.getElementById('lightbox'); if(o) o.remove(); }
document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeLightbox(); });

function renderPicker(){
  var p=S.picker; var l=S.leads.find(function(x){return x.id===p;});
  if(!l||!l._candidates){ S.picker=null; renderSheet(); return; }
  var html='<div id="mbg" data-act="pickbg"><div id="sheet">'+
    '<div class="sh-head"><b style="text-transform:uppercase">Betrieb wählen</b><button class="x" data-act="pickclose">×</button></div>'+
    '<div class="sh-body">'+ l._candidates.map(function(c,i){
      return '<div class="choice" data-act="setco" data-id="'+l.id+'" data-i="'+i+'">'+
        '<b>'+esc(c.firmenname||'?')+'</b><span>'+esc(c.adresse||'')+(c.typ?(' · '+esc(c.typ)):'')+'</span></div>';
    }).join('')+'</div></div></div>';
  mount(html);
}
function mount(html){
  var oldBody=document.querySelector('#mbg .sh-body');    // Scroll-Position merken …
  var top=oldBody?oldBody.scrollTop:0;
  var ex=document.getElementById('mbg'); if(ex) ex.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  if(top){ var nb=document.querySelector('#mbg .sh-body'); if(nb) nb.scrollTop=top; }  // … und wiederherstellen (kein Hochspringen)
}

/* =====================================================================
   EVENTS (delegation)
   ===================================================================== */
document.addEventListener('click',function(e){
  if(e.target.closest('[data-grip]')) return;            // Ziehgriff öffnet nie das Sheet
  if(boardDrag && boardDrag.moved){ boardDrag=null; return; } // gerade gezogen -> Klick verschlucken
  var t=e.target.closest('[data-act]'); if(!t) return;
  var act=t.dataset.act, v=t.dataset.v, id=t.dataset.id;

  if(act==='gps'){ getGPS(S.draft); }
  else if(act==='retake'){ S.draft.photoBlob=null; render(); }
  else if(act==='frak'){ S.draft.behaelter[+t.dataset.i].fraktion=v; render(); }
  else if(act==='vol'){ S.draft.behaelter[+t.dataset.i].volumen=parseInt(v,10); render(); }
  else if(act==='anz'){ var bc=S.draft.behaelter[+t.dataset.i]; bc.anzahl=Math.max(1,(bc.anzahl||1)+parseInt(v,10)); render(); }
  else if(act==='addbin'){ S.draft.behaelter.push({fraktion:'restmuell',volumen:240,anzahl:1}); render(); }
  else if(act==='delbin'){ S.draft.behaelter.splice(+t.dataset.i,1); if(!S.draft.behaelter.length) S.draft.behaelter.push({fraktion:'restmuell',volumen:1100,anzahl:1}); render(); }
  else if(act==='analyze'){ analyzePhoto(); }
  else if(act==='logo'){ S.draft.entsorger_logo=!S.draft.entsorger_logo; render(); }
  else if(act==='mic'){ startMic(t); }
  else if(act==='dictate'){ focusNote(); toast('Jetzt das 🎤 auf deiner Tastatur drücken'); }
  else if(act==='clearpreset'){ S.draft.preset=null; S.draft.fromStop=false; render(); }
  else if(act==='findco'){ lookupCompany(S.draft); }
  else if(act==='togglecands'){ S.draft.showCands=!S.draft.showCands; render(); }
  else if(act==='dpickco'){ pickDraftCompany(+t.dataset.i); }
  else if(act==='clearco'){                              // Firma+Adresse leeren, manuell weiter
    var dd=S.draft; dd.preset={ firmenname:'', adresse:'', telefon:'', website:'', place_id:'', ortsteil:(dd.preset&&dd.preset.ortsteil)||'', _manual:true };
    dd.companyState='empty'; dd.showCands=false; render();
    setTimeout(function(){ var i=document.querySelector('[data-act="manualfirma"]'); if(i) i.focus(); },30);
  }
  else if(act==='openlast'){ if(S.lastSaved){ S.modal=S.lastSaved.id; S.lastSaved=null; render(); renderSheet(); } }
  else if(act==='dismisslast'){ S.lastSaved=null; render(); }
  else if(act==='save'){ saveDraft(); }

  else if(act==='day'){ S.routeDate=v; render(); }
  else if(act==='loadtargets'){ var gg=routeGroupsDated().find(function(x){return x.name===t.dataset.name;}); if(gg) loadTargets(gg); }
  else if(act==='starttarget'){
    var gt=routeGroupsDated().find(function(x){return x.name===t.dataset.name;});
    var plt=(S.stops[t.dataset.name]||[]).find(function(x){return x.place_id===t.dataset.pid;});
    if(gt&&plt) startStop(plt,{name:gt.name},'restmuell');
  }
  else if(act==='startpark'){
    var gp=routeGroupsDated().find(function(x){return x.name===t.dataset.name;});
    var pks=S.parks[t.dataset.name]||[], pl=null;
    pks.forEach(function(pk){ pk.firms.forEach(function(f){ if(f.place_id===t.dataset.pid) pl=f; }); });
    if(gp&&pl) startStop(pl,{name:gp.name},'restmuell');
  }
  else if(act==='dismissreminder'||(act==='rmdbg'&&e.target.id==='rmd')){ dismissReminder(); }
  else if(act==='dismissfu'||(act==='fuovbg'&&e.target.id==='fuov')){ dismissFollowups(); }
  else if(act==='openfulead'){ S.showFollowups=false; S.tab='leads'; S.modal=id; render(); renderSheet(); }
  else if(act==='openreminder'){ S.showReminder=true; render(); }   // Übersicht erneut öffnen
  else if(act==='remindgo'){ gotoRoute(t.dataset.id, v); }
  else if(act==='filter'){ S.filter=v; render(); }
  else if(act==='sort'){ S.sort=v; render(); }
  else if(act==='open'){ S.modal=id; renderSheet(); }
  else if(act==='close'||act==='closebg'&&e.target.id==='mbg'){ S.modal=null; renderSheet(); }
  else if(act==='status'){ setStatus(id,v); }
  else if(act==='calctoggle'){ S.calcOpen=!S.calcOpen; renderSheet(); }
  else if(act==='angebot'){ createAngebot(id); }
  else if(act==='openangebot'){ openSavedAngebot(id, t.dataset.aid); }
  else if(act==='delangebot'){ delAngebot(id, t.dataset.aid); }
  else if(act==='rhythmus' || act==='rabatt'){
    var lr=S.leads.find(function(x){return x.id===id;});
    if(lr){
      if(act==='rhythmus') lr.rhythmus=v; else lr.rabatt=parseInt(v,10)/100;
      var kk=kalkulation(lr);
      lr.kosten_monat=kk.kosten_monat; lr.ersparnis_monat=kk.ersparnis_monat; lr.ersparnis_jahr=kk.ersparnis_jahr;
      lr.rss_marge_monat=kk.rss_marge_monat; lr.rss_marge_jahr=kk.rss_marge_jahr;
      lr.updated_at=Date.now(); dbPut(stripRuntime(lr)).then(function(){ syncLead(lr); }); renderSheet();
    }
  }
  else if(act==='saveedit'){
    var le=S.leads.find(function(x){return x.id===id;});
    if(le){ le.firmenname=(le.firmenname||'').trim(); le.enriched=true; le.updated_at=Date.now(); dedupeFlag(le);
      dbPut(stripRuntime(le)).then(function(){ syncLead(le); toast('Gespeichert'); render(); }); }
  }
  else if(act==='del'){ if(confirm('Lead löschen?')) delLead(id); }
  else if(act==='delquick'){
    var dl=S.leads.find(function(x){return x.id===id;});
    if(dl && confirm('Lead löschen?\n'+(dl.firmenname||dl.adresse||'')+'\n'+behaelterSummary(dl))) delLead(id);
  }
  else if(act==='lfrak'){ editBin(id,+t.dataset.i,'fraktion',v); }
  else if(act==='lvol'){ editBin(id,+t.dataset.i,'volumen',parseInt(v,10)); }
  else if(act==='lanz'){ editBinAnz(id,+t.dataset.i,parseInt(v,10)); }
  else if(act==='laddbin'){ addBinLead(id); }
  else if(act==='ldelbin'){ delBinLead(id,+t.dataset.i); }
  else if(act==='zoom'){ openLightbox(t.src||t.getAttribute('src')); }
  else if(act==='delphoto'){ delLeadPhoto(id,+t.dataset.i); }
  else if(act==='pick'){ S.picker=id; renderSheet(); }
  else if(act==='pickclose'||act==='pickbg'&&e.target.id==='mbg'){ S.picker=null; renderSheet(); }
  else if(act==='setco'){ setCompany(id,parseInt(t.dataset.i,10)); }

  else if(act==='logout'){ localStorage.removeItem('rss_unlocked'); location.reload(); }
  else if(act==='wipeleads'){
    if(confirm('ALLE '+S.leads.length+' Leads auf diesem Gerät löschen?\nKann nicht rückgängig gemacht werden.')){
      dbClear().then(function(){ S.leads=[]; render(); toast('Alle Leads gelöscht'); });
    }
  }
  else if(act==='savekeys'){ collectKeys(); saveKeys(S.keys); toast('Gespeichert'); render(); processOutbox(); syncAll(); }
  else if(act==='sync'){ toast('Synchronisiere…'); processOutbox().then(function(){ syncAll({toast:true}); }); }
  else if(act==='export'){ doExport(v); }
  // ---- CRM ----
  else if(act==='leadview'){ S.leadView=v; render(); }
  else if(act==='callresult'){ logCall(id,v); }
  else if(act==='setwv'){ setWV(id, v==='clear'?null:parseInt(v,10)); }
  else if(act==='addhist'){ addHistNote(id); }
  else if(act==='mailoffer'){ mailOffer(id); }
  else if(act==='anreichern'){ enrichImpressum(id); }
  else if(act==='shareangebot'){ shareAngebot(id); }
  else if(act==='termin'){ shareTermin(id); }
  else if(act==='openoffer'){ var lo=S.leads.find(function(x){return x.id===id;}); if(lo) openAngebotDoc(angebotSnapshot(lo)); }
  else if(act==='advance'){ advanceStatus(id,v); }
  else if(act==='delhist'){ delHist(id,v); }
  else if(act==='resetcrm'){ resetCrm(id); }
  else if(act==='secedit'){ S.secEdit=!S.secEdit; renderSheet(); }
  else if(act==='edittonnen'){ S.secEdit=true; renderSheet();
    setTimeout(function(){ var el=document.getElementById('tonnen-editor'); if(el&&el.scrollIntoView) el.scrollIntoView({block:'start',behavior:'smooth'}); },50); }
},false);

// Tab-Nav
document.querySelector('nav').addEventListener('click',function(e){
  var b=e.target.closest('button[data-tab]'); if(!b) return;
  S.tab=b.dataset.tab; S.modal=null; S.picker=null;
  if(S.tab==='erfassen'){ if(!S.draft) S.draft=freshDraft(); startGPSWatch(S.draft); }
  else stopGPSWatch();                                   // Tracking nur im Erfassen-Tab (spart Akku)
  render();
});

/* ---------- Pipeline: Drag & Drop (Pointer Events – Touch + Maus) ----------
   Karte am ⠿-Griff aufnehmen, über eine Statusspalte ziehen, loslassen -> Status ändert sich
   (in BEIDE Richtungen, z. B. Angebot zurück auf Kontakt). Board scrollt automatisch am Rand. */
var boardDrag=null;
document.addEventListener('pointerdown',function(e){
  var grip=e.target.closest('[data-grip]'); if(!grip) return;
  var card=grip.closest('.bcard'); if(!card) return;
  e.preventDefault();
  var rect=card.getBoundingClientRect();
  var clone=card.cloneNode(true); clone.classList.add('bdrag');
  clone.style.width=rect.width+'px'; clone.style.left=rect.left+'px'; clone.style.top=rect.top+'px';
  document.body.appendChild(clone);
  card.classList.add('bghost');
  boardDrag={ id:card.dataset.id, clone:clone, card:card, dx:e.clientX-rect.left, dy:e.clientY-rect.top,
              sx:e.clientX, sy:e.clientY, moved:false, to:null };
  try{ grip.setPointerCapture(e.pointerId); }catch(_){}
  window.addEventListener('pointermove',boardMove);
  window.addEventListener('pointerup',boardUp,{once:true});
  window.addEventListener('pointercancel',boardUp,{once:true});
},{passive:false});
function boardMove(e){
  if(!boardDrag) return;
  if(!boardDrag.moved && Math.abs(e.clientX-boardDrag.sx)+Math.abs(e.clientY-boardDrag.sy)<6) return;
  boardDrag.moved=true;
  boardDrag.clone.style.left=(e.clientX-boardDrag.dx)+'px';
  boardDrag.clone.style.top=(e.clientY-boardDrag.dy)+'px';
  var el=document.elementFromPoint(e.clientX,e.clientY);   // Clone hat pointer-events:none
  var col=el&&el.closest?el.closest('.bcol'):null;
  var cols=document.querySelectorAll('.bcol');
  for(var i=0;i<cols.length;i++) cols[i].classList.toggle('bover',cols[i]===col);
  boardDrag.to=col?col.getAttribute('data-status'):null;
  var board=document.querySelector('.board');
  if(board){ var b=board.getBoundingClientRect();
    if(e.clientX>b.right-44) board.scrollLeft+=14;
    else if(e.clientX<b.left+44) board.scrollLeft-=14; }
}
function boardUp(){
  window.removeEventListener('pointermove',boardMove);
  var d=boardDrag; if(!d){ return; }
  if(d.clone&&d.clone.parentNode) d.clone.parentNode.removeChild(d.clone);
  var covers=document.querySelectorAll('.bcol.bover'); for(var i=0;i<covers.length;i++) covers[i].classList.remove('bover');
  if(d.card) d.card.classList.remove('bghost');
  if(d.moved && d.to){
    var l=S.leads.find(function(x){return x.id===d.id;});
    if(l && l.status!==d.to){ advanceStatus(d.id,d.to); }   // setzt Status + Historie + speichert + render
    else render();
    boardDrag=null;                                         // sofort freigeben (kein Sheet-Öffnen)
  } else {
    // kein echter Drag -> boardDrag bleibt kurz stehen, Klick-Handler räumt auf/öffnet Sheet
    if(!d.moved) boardDrag=null;
  }
}

// Inputs (no re-render to keep focus)
document.addEventListener('input',function(e){
  var t=e.target;
  if(t.dataset.act==='note'){ if(S.draft) S.draft.notiz=t.value; }
  if(t.dataset.act==='manualfirma'){ var d=S.draft; if(d){ d.preset=d.preset||{firmenname:'',adresse:'',telefon:'',website:'',place_id:'',ortsteil:''}; d.preset.firmenname=t.value; d.preset._manual=true; } }
  if(t.dataset.act==='manualadr'){ var da=S.draft; if(da){ da.preset=da.preset||{firmenname:'',adresse:'',telefon:'',website:'',place_id:'',ortsteil:''}; da.preset.adresse=t.value; da.preset._manual=true; } }
  if(t.dataset.key){ S.keys[t.dataset.key]=t.value.replace(/\s+/g,''); }  // Keys/URLs haben nie Leerzeichen
  if(t.dataset.edit){ var le=S.leads.find(function(x){return x.id===t.dataset.id;}); if(le){ le[t.dataset.edit]=t.value; } }
});
// Photo
document.addEventListener('change',async function(e){
  var t=e.target;
  if(t.dataset.act==='gemeinde'){ switchGemeinde(t.value); return; }
  // Inline-Felder: automatisch speichern beim Verlassen (kein „Speichern"-Klick nötig)
  if(t.dataset.edit){
    var le=S.leads.find(function(x){return x.id===t.dataset.id;});
    if(le){
      le[t.dataset.edit]=t.value;
      if(t.dataset.edit==='firmenname') le.firmenname=(le.firmenname||'').trim();
      le.enriched=true; le.updated_at=Date.now();
      dbPut(stripRuntime(le)).then(function(){ syncLead(le); });
      var ae=document.activeElement;
      if(!(ae && ae.dataset && ae.dataset.edit)) renderSheet();   // nur re-rendern, wenn nicht gerade das nächste Feld getippt wird
    }
    return;
  }
  if((t.dataset.act==='photo'||t.dataset.act==='photogallery') && t.files && t.files[0]){
    S.lastSaved=null;
    toast('Foto wird verarbeitet…');
    S.draft.photoBlob=await compressPhoto(t.files[0]);
    // Kamerafoto = der Moment, in dem der Standort zählt: IMMER frisch orten (egal was
    // der evtl. hängende Watch lieferte). Galerie-Foto entstand ggf. woanders/früher ->
    // Standort nicht überschreiben, nur wenn noch keiner da ist.
    var fromCam = t.dataset.act==='photo';
    var fresh = !S.draft.gpsTime || (Date.now()-S.draft.gpsTime>8000);
    if(fromCam && (S.draft.gpsState!=='ok' || fresh)) refreshFix(S.draft);
    else maybeLookupCompany(S.draft);   // GPS frisch/vorhanden -> Firma jetzt spätestens ziehen
    render();
    if(S.keys.gemini) analyzePhoto();  // Tonnen automatisch erkennen
  }
  // Behälter-Aufkleber im Erfassen scannen -> Adresse + Firma + Tonne
  else if(t.dataset.act==='scanlabel' && t.files && t.files[0]){
    S.lastSaved=null;
    var lblBlob=await compressPhoto(t.files[0]);
    if(!S.draft.photoBlob) S.draft.photoBlob=lblBlob;   // noch kein Hauptfoto -> Aufkleber nehmen
    render();
    scanBinLabel(lblBlob,'draft');
  }
  // Hauptfoto eines bestehenden Leads austauschen
  else if(t.dataset.act==='mainphoto' && t.files && t.files[0]){
    var lm=S.leads.find(function(x){return x.id===t.dataset.id;}); if(!lm) return;
    toast('Hauptfoto wird ersetzt…');
    var nb=await compressPhoto(t.files[0]);
    if(lm._url){ URL.revokeObjectURL(lm._url); lm._url=null; }   // alte Objekt-URL freigeben
    lm.photoBlob=nb; lm.foto_url=null;                           // neu hochladen beim Sync
    await dbPut(stripRuntime(lm)); syncLead(lm); renderSheet(); render(); toast('Hauptfoto ersetzt');
  }
  // weiteres Foto zu einem bestehenden Lead (Doku)
  else if(t.dataset.act==='addphoto' && t.files && t.files[0]){
    var le=S.leads.find(function(x){return x.id===t.dataset.id;}); if(!le) return;
    toast('Foto wird hinzugefügt…');
    var b=await compressPhoto(t.files[0]);
    le.photos=le.photos||[]; le.photos.push(b);
    await dbPut(stripRuntime(le)); renderSheet(); toast('Foto hinzugefügt');
  }
  // Firmenschild scannen -> Firma/Adresse per Gemini auslesen
  else if(t.dataset.act==='scansign' && t.files && t.files[0]){
    var lz=S.leads.find(function(x){return x.id===t.dataset.id;}); if(!lz) return;
    var bb=await compressPhoto(t.files[0]);
    lz.photos=lz.photos||[]; lz.photos.push(bb);
    await dbPut(stripRuntime(lz)); renderSheet();
    analyzeSign(lz, bb);
  }
  // Behälter-Aufkleber am bestehenden Lead scannen -> Adresse + Firma + Tonne
  else if(t.dataset.act==='scanbinlabel' && t.files && t.files[0]){
    var lb=S.leads.find(function(x){return x.id===t.dataset.id;}); if(!lb) return;
    var lbb=await compressPhoto(t.files[0]);
    lb.photos=lb.photos||[]; lb.photos.push(lbb);
    await dbPut(stripRuntime(lb)); renderSheet();
    scanBinLabel(lbb,'lead',lb.id);
  }
});

function collectKeys(){
  document.querySelectorAll('[data-key]').forEach(function(i){ S.keys[i.dataset.key]=i.value.replace(/\s+/g,''); });
}
async function setStatus(id,v){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  l.status=v; if(v==='angebot') onStatusAngebot(l);   // Nachfass-Termin automatisch
  l.updated_at=Date.now(); await dbPut(stripRuntime(l)); syncLead(l); render(); renderSheet();
}
async function delLead(id){
  await dbDel(id); S.leads=S.leads.filter(function(l){return l.id!==id;}); S.modal=null; render();
  if(supaOn() && S.online){   // auch zentral löschen, sonst kommt er beim nächsten Pull zurück
    fetch(supaBase()+'/rest/v1/leads?id=eq.'+encodeURIComponent(id),{ method:'DELETE', headers:supaHeaders() }).catch(function(){});
  }
}
async function delLeadPhoto(id,i){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l||!l.photos||!l.photos[i]) return;
  l.photos.splice(i,1);
  if(l._purls){ if(l._purls[i]) URL.revokeObjectURL(l._purls[i]); l._purls.splice(i,1); }
  await dbPut(stripRuntime(l)); syncLead(l); renderSheet();
}
function setCompany(id,i){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l||!l._candidates) return;
  applyCompany(l,l._candidates[i]); dedupeFlag(l); dbPut(stripRuntime(l)); syncLead(l);
  S.picker=null; renderSheet(); render();
}

/* ---------- Voice (Web Speech API, mit Tastatur-Diktat als Fallback) ---------- */
var _rec;
function focusNote(){
  var ta=document.querySelector('textarea[data-act="note"]'); if(ta){ ta.focus(); }
}
function startMic(btn){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){
    // z.B. Chrome auf iPhone: Web Speech fehlt -> Tastatur-Diktat (geht immer)
    focusNote();
    toast('Tastatur öffnet sich – tippe das 🎤 darauf (Diktat)');
    return;
  }
  if(_rec){ try{ _rec.stop(); }catch(e){} return; }     // zweiter Tipp = Stop
  var ta=document.querySelector('textarea[data-act="note"]');
  var basis=(S.draft.notiz||'');
  _rec=new SR(); _rec.lang='de-DE'; _rec.interimResults=true; _rec.continuous=true;
  btn.classList.add('rec'); btn.innerHTML='⏹ Aufnahme läuft… (zum Stoppen tippen)';
  _rec.onresult=function(ev){
    var full=''; for(var i=0;i<ev.results.length;i++){ full+=ev.results[i][0].transcript; }
    var combined=(basis?basis+' ':'')+full;
    S.draft.notiz=combined;
    if(ta){ ta.value=combined; }                        // Live-Text ohne Re-Render
  };
  _rec.onend=function(){ _rec=null; render(); };
  _rec.onerror=function(e){
    _rec=null;
    var c=e&&e.error;
    if(c==='not-allowed'||c==='service-not-allowed'){ focusNote(); toast('Mikro-Freigabe fehlt – in Chrome erlauben, oder 🎤 der Tastatur nutzen'); }
    else if(c==='no-speech'){ toast('Nichts gehört – nochmal tippen oder Tastatur-🎤'); }
    else if(c==='aborted'){ /* normal beim Stoppen */ }
    else { focusNote(); toast('Sprache hier nicht möglich – 🎤 der Tastatur nutzen'); }
    render();
  };
  try{ _rec.start(); }catch(err){ _rec=null; focusNote(); toast('🎤 der Tastatur nutzen (Diktat)'); render(); }
}

/* ---------- Export ---------- */
function doExport(fmt){
  if(!S.leads.length){ toast('Keine Leads'); return; }
  var blob,name;
  if(fmt==='json'){
    blob=new Blob([JSON.stringify(S.leads.map(toRow),null,2)],{type:'application/json'});
    name='rss-leads.json';
  } else {
    var cols=['firmenname','ap_name','ap_rolle','ap_telefon','ap_email','adresse','telefon','email','tonnen','anzahl','score','hot_lead','status','wiedervorlage','kontakte','kosten_monat','ersparnis_jahr','abfuhrtag','lat','lng'];
    var rows=[cols.join(';')].concat(S.leads.map(function(l){
      return cols.map(function(c){
        var x = c==='tonnen' ? behaelterSummary(l) : (c==='kontakte' ? histOf(l).length : l[c]);
        return '"'+String(x==null?'':x).replace(/"/g,'""')+'"';
      }).join(';');
    }));
    blob=new Blob(['﻿'+rows.join('\n')],{type:'text/csv'});
    name='rss-leads.csv';
  }
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
}

/* ---------- Online / Offline ---------- */
window.addEventListener('online',function(){ S.online=true; render(); toast('Online – synchronisiere'); processOutbox().then(function(){ syncAll(); }); });
window.addEventListener('offline',function(){ S.online=false; render(); });
// Zurück aus Hintergrund (Bildschirm entsperrt / App gewechselt): Standort ist jetzt
// fast sicher veraltet und der Watch oft tot -> sofort frisch orten.
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='visible' && S.tab==='erfassen' && S.draft){ refreshFix(S.draft); }
});

/* ---------- Passcode-Gate ----------
   SHA-256 des Passcodes. Default-Passcode: "rss-harburg".
   ÄNDERN: neuen Hash erzeugen mit
     printf '%s' 'DEIN-CODE' | shasum -a 256
   und unten GATE_HASH ersetzen. Hinweis: rein clientseitig – schützt vor
   Zufallsbesuchern, ist aber keine kryptografische Server-Sperre. */
var GATE_HASH = 'de552cd9839837ffbb154e90e2a9002b0afc6ea2739abfaafa01902035c9219b';
async function sha256(s){
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
}
function unlock(){
  var g=document.getElementById('gate'); if(g) g.remove();
  boot();
}
async function tryGate(){
  var pin=document.getElementById('gate-pin').value;
  var err=document.getElementById('gate-err');
  try{
    if(await sha256(pin)===GATE_HASH){ localStorage.setItem('rss_unlocked','1'); unlock(); }
    else { err.textContent='Falscher Passcode'; document.getElementById('gate-pin').value=''; }
  }catch(e){ err.textContent='Krypto nicht verfügbar (https nötig)'; }
}

/* ---------- Boot ---------- */
async function boot(){
  S.draft=freshDraft();
  render();                               // sofort rendern – Erfassen läuft auch ohne DB
  try{ await openDB(); await loadLeads();
    if(dueFollowups().length && localStorage.getItem('rss_fu_dismissed')!==todayISO()) S.showFollowups=true;
    render(); }
  catch(e){ console.error(e); toast('Lokaler Speicher nicht verfügbar'); }
  startGPSWatch(S.draft);                 // Live-Tracking (Auto) + Auto-Firma beim ersten Fix
  loadTermineIndex().then(function(){     // landkreisweite Restmüll-Erinnerung als Start-Overlay
    if(localStorage.getItem('rss_reminder_dismissed')!==todayISO()) S.showReminder=true;
    render();
  });
  loadRoute().then(render);
  if(S.online){ processOutbox().then(function(){ syncAll(); }); }
  // regelmäßig Team-Leads nachladen (alle 90 s), ohne Tipp-Eingaben zu stören
  setInterval(function(){ if(supaOn() && S.online) syncAll(); }, 90000);
}

if(localStorage.getItem('rss_unlocked')==='1'){
  unlock();
} else {
  document.getElementById('gate-go').addEventListener('click',tryGate);
  document.getElementById('gate-pin').addEventListener('keydown',function(e){ if(e.key==='Enter') tryGate(); });
  document.getElementById('gate-pin').focus();
}
