/* ===================================================================
   RSS Akquise-App — Feld-Tool (Vanilla JS, offline-first PWA)
   Foto → GPS → Adresse → Firma → Score → CRM
   =================================================================== */

/* ---------- CONFIG: Scoring + Kostenmodell ----------
   Werte geerdet in echten LK-Harburg/Remondis-Zahlen (Stand 2026):
   1100 L Restmüll Markt ~150 €/14-täglich … ~300 €/wöchentlich.
   Default = mittlere Annahme (Abfuhrrhythmus bei Capture unbekannt),
   im Lead-Detail editierbar. Alles hier ist anpassbar. */
var CONFIG = {
  volFaktor:   { 120:1, 240:2, 660:5, 1100:9 },     // nur für Capture-Schnellscore
  fraktFaktor: { restmuell:1.0, bio:0.5, papier:0.3, gelb:0.2 }
};

/* ===== Echte Kalkulation: LK Harburg Satzung 2026 + Remondis-EK =====
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
// Remondis-EK netto: Miete €/Monat + variabel €/Leerung (nur 1100 L bekannt)
var REMONDIS = {
  restmuell: { 1100: { miete:3.10, leerung:44.75 } },  // 36,90 + 6,80 CO2 + 1,05 Krise
  papier:    { 1100: { miete:3.10, leerung:10.85 } }   // 9,80 + 1,05 Krise
};
var LEER_MT = { 'woe':52/12, '14t':26/12, '4woe':13/12 };  // Leerungen pro Monat
var RABATT  = 0.10;   // Kunde spart 10 % seiner Kommunalkosten

// Vollständige Wirtschaftlichkeit + margenoptimale Struktur (Option A vs B)
function kalkulation(x){
  var rh=(x&&x.rhythmus)||'14t';
  var kommunal=0, ekRest=0, ekPapVoll=0, paperVol=0, unbekannteEK=false, privat=false;
  containersOf(x).forEach(function(c){
    var n=c.anzahl||1;
    if(c.fraktion==='restmuell'){
      var t=TARIF.restmuell[c.volumen];
      var jahr=t?(t[rh]!=null?t[rh]:t['14t']):null;
      if(jahr!=null) kommunal+=(jahr/12)*n; else privat=true;        // 660 L = privat
      var ek=REMONDIS.restmuell[c.volumen];
      if(ek) ekRest+=(ek.miete+ek.leerung*LEER_MT[rh])*n; else unbekannteEK=true;
    } else if(c.fraktion==='papier'){
      paperVol+=c.volumen*n;
      if(c.volumen>=1100){ var ekp=REMONDIS.papier[1100]; ekPapVoll+=(ekp.miete+ekp.leerung*LEER_MT[rh])*n; }
    } // bio/gelb: kommunal inklusive -> 0
  });
  var pflicht=TARIF.pflichtJahr/12;                  // 40 L 4-wö = 6,49 €/Mt
  var rabatt=(x&&x.rabatt!=null)?x.rabatt:RABATT;    // Kundenrabatt – pro Lead verstellbar
  var ersparnisMt=kommunal*rabatt;
  var kundeZahltMt=kommunal-ersparnisMt;
  var braucht1100Papier = paperVol>240;              // mehr als die gratis 240-L-Tonne
  // Option A: kleinste Pflichttonne + privates Remondis-Papier
  var kostenA = pflicht + ekRest + (braucht1100Papier?ekPapVoll:0);
  // Option B: kommunale Restmülltonne groß halten (240 L) -> 1.100-L-Papier gratis behalten
  var unlock = TARIF.restmuell[240]['14t']/12;       // 41,23 €/Mt
  var kostenB = unlock + ekRest;
  var margeA = kundeZahltMt - kostenA, margeB = kundeZahltMt - kostenB;
  var optionBest, margeBest, kostenBest;
  if(braucht1100Papier && margeB>margeA){ optionBest='B'; margeBest=margeB; kostenBest=kostenB; }
  else { optionBest='A'; margeBest=margeA; kostenBest=kostenA; }
  return {
    rhythmus:rh, kosten_monat:kommunal, rabatt:rabatt,
    ersparnis_monat:ersparnisMt, ersparnis_jahr:ersparnisMt*12,
    rss_marge_monat:margeBest, rss_marge_jahr:margeBest*12,
    rss_kosten_monat:kostenBest, kunde_zahlt_monat:kundeZahltMt,
    option:optionBest, braucht1100Papier:braucht1100Papier,
    margeA_monat:margeA, margeA_jahr:margeA*12, margeB_monat:margeB, margeB_jahr:margeB*12,
    ek_unvollstaendig:unbekannteEK, privat:privat
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
var APP_VERSION = 'v20 · Kundenrabatt verstellbar';
var WD = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
var WD_WORK = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag'];
// Places-Typen, die fast nie Gewerbekunden mit Tonne sind -> aus Route ausblenden
var STOP_EXCLUDE = ['bus_stop','transit_station','locality','political','park','school',
  'primary_school','secondary_school','place_of_worship','church','cemetery','tourist_attraction',
  'parking','bus_station','train_station','light_rail_station'];

/* ---------- State ---------- */
var S = {
  tab: 'erfassen',
  leads: [],
  draft: null,
  filter: 'alle',
  sort: 'score',
  modal: null,         // lead id im Detail-Sheet
  picker: null,        // { leadId, candidates } Firmen-Auswahl
  online: navigator.onLine,
  keys: loadKeys(),
  map: null,
  route: null,        // geladene Abfuhr-/Routendaten (Gemeinde + Ortsteile)
  routeDay: null,     // angezeigter Wochentag (Default = heute)
  stops: {},          // strukturID -> [places]  (Betriebe je Ortsteil, on demand)
  stopsLoading: {},   // strukturID -> bool
  lastSaved: null     // {id,score,hot} -> Bestätigungsbanner nach dem Speichern
};
function freshDraft(){
  return { photoBlob:null, lat:null, lng:null, accuracy:null, gpsState:'wait', gpsMsg:'',
           behaelter:[{fraktion:'restmuell',volumen:1100,anzahl:1}], rhythmus:'14t', rabatt:0.10,
           entsorger_logo:true, entsorger:'', notiz:'', analyzing:false,
           preset:null };  // preset = { firmenname, adresse, telefon, website, place_id, ortsteil }
}

/* ---------- Keys / Settings persistence ---------- */
function loadKeys(){ try{ return JSON.parse(localStorage.getItem('rss_keys')) || {}; }catch(e){ return {}; } }
function saveKeys(k){ S.keys = k; localStorage.setItem('rss_keys', JSON.stringify(k)); }

/* ---------- DOM helpers ---------- */
var $app = document.getElementById('app');
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function eur(n){ return Math.round(n).toLocaleString('de-DE') + ' €'; }
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
        generationConfig:{temperature:0.1,maxOutputTokens:1200} })
    });
    if(!r.ok){ var e=await r.json().catch(function(){return{};}); throw new Error((e.error&&e.error.message)||('HTTP '+r.status)); }
    var dd=await r.json();
    var txt=dd.candidates&&dd.candidates[0]&&dd.candidates[0].content&&dd.candidates[0].content.parts&&
            dd.candidates[0].content.parts[0]&&dd.candidates[0].content.parts[0].text;
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
        generationConfig:{temperature:0.1,maxOutputTokens:400} })
    });
    if(!r.ok){ var e=await r.json().catch(function(){return{};}); throw new Error((e.error&&e.error.message)||('HTTP '+r.status)); }
    var dd=await r.json();
    var txt=dd.candidates&&dd.candidates[0]&&dd.candidates[0].content&&dd.candidates[0].content.parts&&
            dd.candidates[0].content.parts[0]&&dd.candidates[0].content.parts[0].text;
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

/* ---------- GPS ---------- */
function getGPS(draft){
  if(!navigator.geolocation){ draft.gpsState='err'; draft.gpsMsg='Gerät ohne Standort'; render(); return; }
  if(!window.isSecureContext){ draft.gpsState='err'; draft.gpsMsg='Nur über https (nicht file://)'; render(); return; }
  draft.gpsState='wait'; render();
  // Diagnose: ist der Standort in Chrome blockiert?
  if(navigator.permissions && navigator.permissions.query){
    navigator.permissions.query({name:'geolocation'}).then(function(p){
      if(p.state==='denied'){
        draft.gpsState='err';
        draft.gpsMsg='In Chrome blockiert (Standort = denied) – Schloss-Symbol → Berechtigungen → Standort → Zulassen';
        render();
      }
    }).catch(function(){});
  }
  function ok(p){
    draft.lat=p.coords.latitude; draft.lng=p.coords.longitude;
    draft.accuracy=Math.round(p.coords.accuracy); draft.gpsState='ok'; draft.gpsMsg=''; render();
  }
  function fail(e){
    draft.gpsState='err';
    draft.gpsMsg = e && e.code===1 ? 'Standort-Freigabe verweigert – im Browser/Handy erlauben'
                 : e && e.code===2 ? 'Standort nicht verfügbar'
                 : 'Zeitüberschreitung – Pille antippen für neuen Versuch';
    render();
  }
  // 1. Versuch: hohe Genauigkeit; bei Timeout/Unavailable 2. Versuch ohne HighAccuracy
  navigator.geolocation.getCurrentPosition(ok, function(e){
    if(e && (e.code===3 || e.code===2)){
      navigator.geolocation.getCurrentPosition(ok, fail,
        { enableHighAccuracy:false, timeout:15000, maximumAge:60000 });
    } else { fail(e); }
  }, { enableHighAccuracy:true, timeout:15000, maximumAge:8000 });
}

/* ---------- Google APIs ---------- */
async function placesNearby(lat,lng,radius,max){
  var key=S.keys.google; if(!key) throw new Error('Kein Google-Key');
  var r=await fetch('https://places.googleapis.com/v1/places:searchNearby',{
    method:'POST',
    headers:{ 'Content-Type':'application/json','X-Goog-Api-Key':key,
      'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.primaryType,places.primaryTypeDisplayName,places.location' },
    body:JSON.stringify({ maxResultCount:(max||5), rankPreference:'DISTANCE',
      locationRestriction:{ circle:{ center:{latitude:lat,longitude:lng}, radius:(radius||75.0) } } })
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

/* ---------- Anreicherung (offline-first Outbox) ---------- */
async function enrich(lead){
  if(!S.online || !S.keys.google) return;
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
function supaOn(){ return !!(S.keys.supaUrl && S.keys.supaKey); }
function supaBase(){ return S.keys.supaUrl.replace(/\/$/,''); }
function supaHeaders(extra){
  var h={ 'apikey':S.keys.supaKey, 'Authorization':'Bearer '+S.keys.supaKey };
  if(extra) for(var k in extra) h[k]=extra[k];
  return h;
}
// rendert nur, wenn der Nutzer nicht gerade in einem Eingabefeld tippt
function safeRender(){
  var a=document.activeElement;
  if(a && a.dataset && (a.dataset.edit||a.dataset.act==='note'||a.dataset.key)) return;
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
    var res=await fetch(base+'/rest/v1/leads?on_conflict=id',{
      method:'POST', headers:supaHeaders({'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'}),
      body:JSON.stringify([toRow(lead)]) });
    lead.sync_state = res.ok ? 'synced' : 'pending';
  }catch(e){ lead.sync_state='pending'; }
  await dbPut(stripRuntime(lead));
}
function toRow(l){
  return { id:l.id, created_at:new Date(l.created_at).toISOString(),
    updated_at:new Date(l.updated_at||l.created_at).toISOString(), abfuhrtag:l.abfuhrtag,
    lat:l.lat, lng:l.lng, accuracy:l.accuracy, foto_url:l.foto_url||null,
    fraktion:l.fraktion, volumen:l.volumen, anzahl:l.anzahl, entsorger_logo:l.entsorger_logo, entsorger:l.entsorger||null,
    behaelter:l.behaelter||null,
    firmenname:l.firmenname||null, telefon:l.telefon||null, website:l.website||null,
    place_id:l.place_id||null, adresse:l.adresse||null, notiz:l.notiz||null,
    status:l.status, score:l.score, hot_lead:l.hot_lead,
    kosten_monat:l.kosten_monat, ersparnis_monat:l.ersparnis_monat, ersparnis_jahr:l.ersparnis_jahr };
}
function fromRow(rl, local){
  return {
    id:rl.id,
    created_at: rl.created_at?Date.parse(rl.created_at):Date.now(),
    updated_at: rl.updated_at?Date.parse(rl.updated_at):Date.now(),
    abfuhrtag:rl.abfuhrtag, lat:rl.lat, lng:rl.lng, accuracy:rl.accuracy,
    foto_url:rl.foto_url||null, photoBlob:(local&&local.photoBlob)||null, photos:(local&&local.photos)||[],
    behaelter:rl.behaelter||null, fraktion:rl.fraktion, volumen:rl.volumen, anzahl:rl.anzahl,
    entsorger_logo:rl.entsorger_logo, entsorger:rl.entsorger||'',
    firmenname:rl.firmenname||'', telefon:rl.telefon||'', website:rl.website||'',
    place_id:rl.place_id||'', adresse:rl.adresse||'', notiz:rl.notiz||'',
    status:rl.status||'neu', score:rl.score, hot_lead:rl.hot_lead,
    kosten_monat:rl.kosten_monat, ersparnis_monat:rl.ersparnis_monat, ersparnis_jahr:rl.ersparnis_jahr,
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
  S.leads.sort(function(a,b){ return (b.created_at||0)-(a.created_at||0); });
  return added;
}
// kompletter Abgleich: erst lokale Änderungen hoch, dann Team-Leads runter
async function syncAll(opts){
  if(!supaOn() || !S.online) return;
  var pend=S.leads.filter(function(l){ return l.sync_state!=='synced'; });
  for(var i=0;i<pend.length;i++){ await syncLead(pend[i]); }
  var added=0;
  try{ added=await pullLeads(); }catch(e){}
  safeRender();
  if(opts&&opts.toast) toast(added?(added+' neue Team-Leads geladen'):'Synchronisiert');
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
    enriched:pre?true:false, sync_state: supaOn()?'pending':'local', duplikat:false
  };
  await dbPut(stripRuntime(lead));
  S.leads.unshift(lead);
  var wasStop=!!pre;
  S.draft=freshDraft();
  if(wasStop){
    S.tab='heute';                                  // nach Route-Stop zurück zur Route
    render(); toast(lead.hot_lead?'🔥 Hot Lead gespeichert':'Lead gespeichert');
    dedupeFlag(lead); syncLead(lead);
  } else {
    S.tab='erfassen';                               // bereit für die nächste Tonne
    S.lastSaved={ id:lead.id, score:lead.score, hot:lead.hot_lead };
    render(); toast(lead.hot_lead?'🔥 Hot Lead gespeichert':'Lead gespeichert');
    enrich(lead).then(render);
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
}

function renderErfassen(){
  var d=S.draft||(S.draft=freshDraft());
  var sc=scoreLead(d), hot=isHot(d), cost=costEstimate(d);
  var img=d.photoBlob?URL.createObjectURL(d.photoBlob):null;

  var gpsCls = d.gpsState==='ok'?'ok':(d.gpsState==='err'?'err':'');
  var gpsTxt = d.gpsState==='ok' ? ('GPS ±'+d.accuracy+' m erfasst')
            : d.gpsState==='err' ? ('GPS: '+(d.gpsMsg||'nicht verfügbar'))
            : 'GPS wird ermittelt…';

  var preBanner = d.preset ?
    ('<div style="border:2px solid var(--ink);background:var(--ink);color:var(--paper);padding:12px 14px;margin-bottom:14px">'+
      '<div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#bbb">Route-Stop · '+esc(d.preset.ortsteil.split(' (')[0])+'</div>'+
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
    '<div class="sub">Foto antippen → Tonnen prüfen → speichern. Firma trägst du danach im Lead nach.</div>'+
    savedBanner+
    preBanner+

    '<div class="shot">'+
      (img?('<img src="'+img+'"/><button class="retake" data-act="retake">Neu</button>')
          :('<div class="cam">◎</div><div class="ct">Foto aufnehmen</div>'))+
      '<input type="file" accept="image/*" capture="environment" data-act="photo"/>'+
    '</div>'+

    (d.photoBlob && S.keys.gemini ?
      ('<button class="mic'+(d.analyzing?' rec':'')+'" data-act="analyze"'+(d.analyzing?' disabled':'')+'>'+
        (d.analyzing?'🔍 Bild wird analysiert…':'🔍 Tonnen aus Foto erkennen')+'</button>') : '')+

    '<div class="gps '+gpsCls+'" data-act="gps"><span class="dot"></span>'+esc(gpsTxt)+
      (d.gpsState!=='ok'?' · TIPPEN zum Aktivieren':'')+'</div>'+
    (d.gpsState==='err' ?
      ('<div class="note" style="border:1.5px solid var(--hot);padding:10px 12px;margin-top:0">'+
        '<b>Standort in Chrome freigeben:</b><br>'+
        '• Beim ersten Mal fragt Chrome „Standort zulassen?" → <b>Zulassen</b>.<br>'+
        '• Schon abgelehnt? Oben in der Adressleiste auf <b>🔒 / ⋮ → Berechtigungen → Standort → Zulassen</b>, Seite neu laden.<br>'+
        '• <b>iPhone:</b> zusätzlich Einstellungen → Datenschutz → Ortungsdienste <b>AN</b> und für <b>Chrome</b> „Beim Verwenden".<br>'+
        '• <b>Android:</b> Einstellungen → Standort <b>AN</b>; App-Berechtigung für Chrome auf „Zulassen".<br>'+
        'Danach oben auf die GPS-Leiste tippen. (Speichern geht auch ohne GPS — aber Firma/Adresse braucht den Standort.)</div>') : '')+

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
function VOLUMEN_FRAK(){
  var d=S.draft;
  return Object.keys(FRAKTION).map(function(k){
    var f=FRAKTION[k];
    return '<button class="chip'+(d.fraktion===k?' on':'')+'" data-act="frak" data-v="'+k+'">'+
      '<span class="swatch" style="background:'+f.sw+'"></span>'+f.label+'</button>';
  }).join('');
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

  $app.innerHTML='<div class="screen">'+
    '<h1 class="t">Leads</h1>'+
    '<div class="sub">'+S.leads.length+' gesamt · '+hot+' hot · '+eur(sum)+'/J Marge-Potenzial</div>'+
    bar+sortbar+list+'</div>';
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

/* ---------- Route / Heute ---------- */
async function loadRoute(){
  if(S.route) return;
  try{
    var r=await fetch('data/abfuhr-seevetal.json',{cache:'no-cache'});
    if(r.ok) S.route=await r.json();
  }catch(e){ /* offline / fehlt */ }
}
function leadHasPlace(pid){ return S.leads.some(function(l){ return pid && l.place_id===pid; }); }

async function loadStops(o){
  if(S.stops[o.strukturID]||S.stopsLoading[o.strukturID]) return;
  if(!S.keys.google){ toast('Erst Google-Key in Setup eintragen'); return; }
  if(o.lat==null){ toast('Kein Ortsteil-Mittelpunkt'); return; }
  S.stopsLoading[o.strukturID]=true; render();
  try{
    var places=await placesNearby(o.lat,o.lng,1600,20);
    // Wohn-/Nicht-Gewerbe-POIs grob ausblenden (Wohnhäuser sind in Places ohnehin nicht enthalten)
    places=places.filter(function(p){ return p.firmenname && STOP_EXCLUDE.indexOf(p.primaryType)<0; });
    S.stops[o.strukturID]=places;
  }catch(e){ toast('Betriebe laden fehlgeschlagen'); S.stops[o.strukturID]=[]; }
  S.stopsLoading[o.strukturID]=false; render();
}

function startStop(p, o, frak){
  var d=freshDraft();
  d.preset={ firmenname:p.firmenname, adresse:p.adresse, telefon:p.telefon||'',
             website:p.website||'', place_id:p.place_id, ortsteil:o.name };
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
// Ortsteile nach Basisnamen gruppieren (Fleestedt ost/west -> ein "Fleestedt")
function routeGroups(){
  var g={};
  S.route.ortsteile.forEach(function(o){
    var base=o.name.split(' (')[0];
    if(!g[base]) g[base]={ name:base, lat:o.lat, lng:o.lng, restDays:{}, papDays:{} };
    if(g[base].lat==null && o.lat!=null){ g[base].lat=o.lat; g[base].lng=o.lng; }
    if(o.restmuell_wochentag) g[base].restDays[o.restmuell_wochentag]=true;
    if(o.papier_wochentag)    g[base].papDays[o.papier_wochentag]=true;
  });
  return Object.keys(g).map(function(k){ return g[k]; });
}

function renderHeute(){
  var today=WD[new Date().getDay()];
  var day=S.routeDay||today;

  if(!S.route){
    $app.innerHTML='<div class="screen"><h1 class="t">Heute</h1>'+
      '<div class="sub">Routendaten werden geladen…</div>'+
      '<div class="empty"><div class="big">Keine Routendaten</div>'+
      '<div class="sm">Für Seevetal sollten sie automatisch laden. Bei Offline-Erststart einmal online öffnen.</div></div></div>';
    loadRoute().then(render); return;
  }

  var groups=routeGroups();
  var due=groups.filter(function(g){ return g.restDays[day]||g.papDays[day]; });
  due.sort(function(a,b){ return (b.restDays[day]?1:0)-(a.restDays[day]?1:0) || a.name.localeCompare(b.name); });

  var chips='<div class="bar">'+ WD_WORK.map(function(wd){
    var n=groups.filter(function(g){return g.restDays[wd]||g.papDays[wd];}).length;
    return '<button class="'+(day===wd?'on':'')+'" data-act="day" data-v="'+wd+'">'+
      wd.slice(0,2)+(wd===today?' •':'')+' '+n+'</button>';
  }).join('')+'</div>';

  var body;
  if(!due.length){
    body='<div class="empty"><div class="big">'+esc(day)+': keine Abfuhr</div>'+
      '<div class="sm">Wähle oben einen Tag mit Restmüll-/Papier-Abfuhr.</div></div>';
  } else {
    body=due.map(function(g){ return gebietCard(g,day); }).join('');
  }

  var rN=due.filter(function(g){return g.restDays[day];}).length;
  var pN=due.filter(function(g){return g.papDays[day];}).length;

  $app.innerHTML='<div class="screen">'+
    '<h1 class="t">Heute</h1>'+
    '<div class="sub">'+esc(S.route.gemeinde)+' · '+esc(day)+(day===today?' (heute)':'')+
      ' · '+rN+'× Restmüll · '+pN+'× Papier</div>'+
    chips+
    '<div class="note" style="margin:0 0 12px">An diesen Tagen stehen die Tonnen draußen — hinfahren und die Gewerbe-Tonnen einfach per „Erfassen" aufnehmen. '+
      '<b>An Feiertagen verschiebt sich die Abfuhr um 1–2 Tage.</b></div>'+
    body+'</div>';
}

function gebietCard(g,day){
  var rest=!!g.restDays[day], pap=!!g.papDays[day];
  var near = g.lat!=null ? S.leads.filter(function(l){ return l.lat!=null && haversine(l.lat,l.lng,g.lat,g.lng)<2.5; }).length : 0;
  var nav = g.lat!=null
    ? '<a class="cta ghost" style="margin:0;text-decoration:none;flex:none;padding:12px 16px" href="https://www.google.com/maps/dir/?api=1&destination='+g.lat+','+g.lng+'" target="_blank">Navigieren ▸</a>'
    : '<span style="font-size:12px;color:var(--muted)">kein Standort</span>';
  return '<div style="border:1.5px solid var(--ink);margin-bottom:12px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1.5px solid var(--ink)">'+
      '<b style="font-size:16px;text-transform:uppercase">'+esc(g.name)+'</b>'+
      '<span>'+(rest?'<span class="tag hot">Restmüll</span> ':'')+(pap?'<span class="tag fill">Papier</span>':'')+'</span>'+
    '</div>'+
    '<div style="padding:10px 14px;display:flex;align-items:center;gap:10px">'+
      '<span style="font-size:12px;font-weight:700;color:var(--muted);flex:1">'+near+' Lead'+(near===1?'':'s')+' hier erfasst</span>'+
      nav+
    '</div></div>';
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

    '<div class="section"><h3>Team-Sync (Supabase)</h3>'+
      '<div class="note">Zentrale Datenbank: ALLE Nutzer sehen denselben Lead-Pool (laden + schreiben). '+
      'Auf jedem Gerät dieselbe URL + denselben Anon-Key eintragen. Leer = nur lokal auf diesem Gerät.</div>'+
      (supaOn()?('<div class="note" style="color:#1a7d34;font-weight:800">✓ Team-Sync aktiv · '+S.leads.filter(function(l){return l.sync_state==='synced';}).length+' synchronisiert</div>'):'')+
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
    '<div class="sh-head"><b style="text-transform:uppercase;font-size:16px">'+esc(l.firmenname||'Unbekannter Betrieb')+'</b>'+
      '<button class="x" data-act="close">×</button></div>'+
    '<div class="sh-body">'+
      photoGallery(l)+
      (l.hot_lead?'<div style="margin:12px 0 0"><span class="tag hot">🔥 Hot Lead</span></div>':'')+
      '<div style="margin-top:14px">'+
        kv('Tonnen', behaelterSummary(l))+
        kv('Entsorger', l.entsorger||(l.entsorger_logo?'erkennbar (Name?)':'unbekannt'))+
        kv('Lead-Score', String(l.score))+
        kv('Erfasst', new Date(l.created_at).toLocaleString('de-DE'))+
        (l.notiz?kv('Notiz', l.notiz):'')+
      '</div>'+

      '<span class="lab">Firma / Kontakt (manuell editierbar)</span>'+
      '<input class="txt" style="margin-bottom:8px" data-edit="firmenname" data-id="'+l.id+'" value="'+esc(l.firmenname||'')+'" placeholder="Firmenname"/>'+
      '<input class="txt" style="margin-bottom:8px" data-edit="telefon" data-id="'+l.id+'" inputmode="tel" value="'+esc(l.telefon||'')+'" placeholder="Telefon"/>'+
      '<input class="txt" style="margin-bottom:8px" data-edit="adresse" data-id="'+l.id+'" value="'+esc(l.adresse||'')+'" placeholder="Adresse (Straße, Ort)"/>'+
      '<input class="txt" style="margin-bottom:8px" data-edit="website" data-id="'+l.id+'" inputmode="url" value="'+esc(l.website||'')+'" placeholder="Website (optional)"/>'+
      '<button class="cta" data-act="saveedit" data-id="'+l.id+'" style="margin-top:0">Firma speichern</button>'+
      offerBox(l)+

      ((l._candidates&&l._candidates.length>1)?
        '<button class="cta ghost" data-act="pick" data-id="'+l.id+'">Anderen Betrieb wählen ('+l._candidates.length+')</button>':'')+

      '<span class="lab">Status</span>'+
      '<div class="statusgrid">'+ STATUS.map(function(s){
        return '<button class="'+(l.status===s?'on':'')+'" data-act="status" data-id="'+l.id+'" data-v="'+s+'">'+STATUS_LBL[s]+'</button>';
      }).join('')+'</div>'+

      '<div class="actions">'+
        (l.telefon?'<a class="pri" href="tel:'+esc(l.telefon)+'">▸ Anrufen</a>':'<button class="pri" data-act="noop">Kein Telefon</button>')+
        (l.lat?'<a href="https://www.google.com/maps?q='+l.lat+','+l.lng+'" target="_blank">Route</a>':'')+
      '</div>'+
      (l.website?'<div class="actions" style="grid-template-columns:1fr;margin-top:8px"><a href="'+esc(l.website)+'" target="_blank">Website</a></div>':'')+
      '<div class="actions" style="grid-template-columns:1fr;margin-top:8px"><button data-act="del" data-id="'+l.id+'" style="border-color:#ff2d2d;color:#ff2d2d">Lead löschen</button></div>'+
    '</div></div></div>';
  mount(html);
}
function kv(k,v){ return '<div class="kv"><span class="k">'+esc(k)+'</span><span class="v">'+esc(v)+'</span></div>'; }
function offerBox(l){
  var k=kalkulation(l);
  var rhyBtns='<div class="row two" style="margin-bottom:10px">'+
    '<button class="chip'+(k.rhythmus==='14t'?' on':'')+'" data-act="rhythmus" data-id="'+l.id+'" data-v="14t">14-täglich</button>'+
    '<button class="chip'+(k.rhythmus==='woe'?' on':'')+'" data-act="rhythmus" data-id="'+l.id+'" data-v="woe">wöchentlich</button>'+
  '</div>';
  var opt = k.braucht1100Papier ?
    ('<div class="note" style="border:1px solid var(--ink);padding:8px 10px;margin-top:8px">'+
      '<b>Margenbeste Struktur: Option '+k.option+'</b><br>'+
      'A) 40-L-Pflicht + privates Papier → <b>'+eur(k.margeA_jahr)+'/Jahr</b><br>'+
      'B) 240-L kommunal, 1.100-L-Papier gratis → <b>'+eur(k.margeB_jahr)+'/Jahr</b></div>') : '';
  var warn = (k.ek_unvollstaendig?'<div class="note">⚠ EK nur für 1.100 L hinterlegt — kleinere Volumen unvollständig.</div>':'')+
             (k.privat?'<div class="note">⚠ 660 L hat keinen Kommunaltarif (private Größe).</div>':'');
  var pct=Math.round((k.rabatt||0.10)*100);
  var rabBtns='<div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin:4px 0 6px">Kundenrabatt: '+pct+' %</div>'+
    '<div class="row" style="grid-template-columns:repeat(5,1fr);margin-bottom:10px">'+
    [5,10,15,20,25].map(function(p){
      return '<button class="chip'+(pct===p?' on':'')+'" data-act="rabatt" data-id="'+l.id+'" data-v="'+p+'">'+p+'%</button>';
    }).join('')+'</div>';
  return '<div class="offerbox"><div class="oh">Kalkulation (LK Harburg + Remondis)</div><div class="ob">'+
    rhyBtns+ rabBtns+
    kv('Kommunalkosten heute / Mt', eur(k.kosten_monat))+
    kv('Kunde spart ('+pct+' %)', eur(k.ersparnis_monat)+'/Mt · '+eur(k.ersparnis_jahr)+'/J')+
    '<div class="kv" style="border:0"><span class="k" style="font-weight:800;color:#000">RSS-Marge</span>'+
      '<span class="v" style="font-size:18px">'+eur(k.rss_marge_monat)+'/Mt · '+eur(k.rss_marge_jahr)+'/J</span></div>'+
    opt+warn+
  '</div></div>';
}
function photoGallery(l){
  var u=photoURL(l), extras=extraPhotoURLs(l), html='';
  if(u) html+='<img class="sh-photo" src="'+u+'" style="margin-bottom:8px"/>';
  if(extras.length){
    html+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'+
      extras.map(function(src){ return '<img src="'+src+'" style="width:84px;height:84px;object-fit:cover;border:1.5px solid var(--ink)"/>'; }).join('')+'</div>';
  }
  html+='<label class="cta ghost" style="margin-top:0;cursor:pointer;display:flex">+ Foto hinzufügen (Doku)'+
    '<input type="file" accept="image/*" capture="environment" data-act="addphoto" data-id="'+l.id+'" style="display:none"/></label>';
  if(S.keys.gemini){
    html+='<label class="cta'+(l._scanning?'':' ghost')+'" style="margin-top:8px;cursor:pointer;display:flex">'+
      (l._scanning?'🏷️ Schild wird gelesen…':'🏷️ Firmenschild scannen → Firma/Adresse')+
      '<input type="file" accept="image/*" capture="environment" data-act="scansign" data-id="'+l.id+'" style="display:none"/></label>';
  }
  return html;
}
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
  var ex=document.getElementById('mbg'); if(ex) ex.remove();
  document.body.insertAdjacentHTML('beforeend',html);
}

/* =====================================================================
   EVENTS (delegation)
   ===================================================================== */
document.addEventListener('click',function(e){
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
  else if(act==='clearpreset'){ S.draft.preset=null; render(); }
  else if(act==='openlast'){ if(S.lastSaved){ S.modal=S.lastSaved.id; S.lastSaved=null; render(); renderSheet(); } }
  else if(act==='dismisslast'){ S.lastSaved=null; render(); }
  else if(act==='save'){ saveDraft(); }

  else if(act==='day'){ S.routeDay=v; render(); }
  else if(act==='loadstops'){ var o=S.route.ortsteile.find(function(x){return x.strukturID===t.dataset.sid;}); if(o) loadStops(o); }
  else if(act==='stop'){
    var os=S.route.ortsteile.find(function(x){return x.strukturID===t.dataset.sid;});
    var pl=(S.stops[t.dataset.sid]||[]).find(function(x){return x.place_id===t.dataset.pid;});
    if(os&&pl) startStop(pl,os,t.dataset.frak);
  }
  else if(act==='filter'){ S.filter=v; render(); }
  else if(act==='sort'){ S.sort=v; render(); }
  else if(act==='open'){ S.modal=id; renderSheet(); }
  else if(act==='close'||act==='closebg'&&e.target.id==='mbg'){ S.modal=null; renderSheet(); }
  else if(act==='status'){ setStatus(id,v); }
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
    if(le){ le.firmenname=(le.firmenname||'').trim(); le.enriched=true; dedupeFlag(le);
      dbPut(stripRuntime(le)).then(function(){ syncLead(le); toast('Firma gespeichert'); render(); }); }
  }
  else if(act==='del'){ if(confirm('Lead löschen?')) delLead(id); }
  else if(act==='delquick'){
    var dl=S.leads.find(function(x){return x.id===id;});
    if(dl && confirm('Lead löschen?\n'+(dl.firmenname||dl.adresse||'')+'\n'+behaelterSummary(dl))) delLead(id);
  }
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
},false);

// Tab-Nav
document.querySelector('nav').addEventListener('click',function(e){
  var b=e.target.closest('button[data-tab]'); if(!b) return;
  S.tab=b.dataset.tab; S.modal=null; S.picker=null;
  if(S.tab==='erfassen' && (!S.draft||!S.draft.photoBlob) && (!S.draft||S.draft.gpsState==='wait')){ if(!S.draft) S.draft=freshDraft(); getGPS(S.draft); }
  render();
});

// Inputs (no re-render to keep focus)
document.addEventListener('input',function(e){
  var t=e.target;
  if(t.dataset.act==='note'){ if(S.draft) S.draft.notiz=t.value; }
  if(t.dataset.key){ S.keys[t.dataset.key]=t.value.trim(); }
  if(t.dataset.edit){ var le=S.leads.find(function(x){return x.id===t.dataset.id;}); if(le){ le[t.dataset.edit]=t.value; } }
});
// Photo
document.addEventListener('change',async function(e){
  var t=e.target;
  if(t.dataset.act==='photo' && t.files && t.files[0]){
    S.lastSaved=null;
    toast('Foto wird verarbeitet…');
    S.draft.photoBlob=await compressPhoto(t.files[0]);
    if(S.draft.gpsState!=='ok') getGPS(S.draft);
    render();
    if(S.keys.gemini) analyzePhoto();  // Tonnen automatisch erkennen
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
});

function collectKeys(){
  document.querySelectorAll('[data-key]').forEach(function(i){ S.keys[i.dataset.key]=i.value.trim(); });
}
async function setStatus(id,v){
  var l=S.leads.find(function(x){return x.id===id;}); if(!l) return;
  l.status=v; await dbPut(stripRuntime(l)); syncLead(l); render();
}
async function delLead(id){
  await dbDel(id); S.leads=S.leads.filter(function(l){return l.id!==id;}); S.modal=null; render();
  if(supaOn() && S.online){   // auch zentral löschen, sonst kommt er beim nächsten Pull zurück
    fetch(supaBase()+'/rest/v1/leads?id=eq.'+encodeURIComponent(id),{ method:'DELETE', headers:supaHeaders() }).catch(function(){});
  }
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
    var cols=['firmenname','adresse','telefon','tonnen','anzahl','score','hot_lead','status','kosten_monat','ersparnis_jahr','abfuhrtag','lat','lng'];
    var rows=[cols.join(';')].concat(S.leads.map(function(l){
      return cols.map(function(c){ var x = c==='tonnen' ? behaelterSummary(l) : l[c]; return '"'+String(x==null?'':x).replace(/"/g,'""')+'"'; }).join(';');
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
  try{ await openDB(); await loadLeads(); render(); }
  catch(e){ console.error(e); toast('Lokaler Speicher nicht verfügbar'); }
  getGPS(S.draft);
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
