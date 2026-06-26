/* RSS Akquise — Service Worker: App-Shell-Cache für Offline-Start */
var CACHE = 'rss-akquise-v3';
var SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './data/abfuhr-seevetal.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(SHELL.map(function(u){
      return c.add(u).catch(function(){ /* CDN evtl. offline – ignorieren */ });
    }));
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.map(function(k){ if(k!==CACHE) return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e){
  var url = e.request.url;
  // API-Aufrufe (Google/Supabase/Tiles) niemals cachen — immer Netzwerk
  if(/googleapis|google\.com\/maps|supabase|tile\.openstreetmap/.test(url)) return;
  if(e.request.method !== 'GET') return;

  // App-Shell: cache-first, sonst Netzwerk und nachladen
  e.respondWith(
    caches.match(e.request).then(function(hit){
      return hit || fetch(e.request).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, copy).catch(function(){}); });
        return res;
      }).catch(function(){
        // Offline-Fallback auf App-Shell
        if(e.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
