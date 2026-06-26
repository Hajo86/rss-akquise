/* RSS Akquise — Service Worker: App-Shell-Cache für Offline-Start */
var CACHE = 'rss-akquise-v25';
var SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './data/abfuhr-seevetal.json'
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

  var sameOrigin = url.indexOf(self.location.origin) === 0;

  if(sameOrigin){
    // App-Code (index.html, app.js, Daten): NETWORK-FIRST -> online immer aktuell,
    // offline aus Cache. Verhindert, dass alte App-Versionen hängen bleiben.
    e.respondWith(
      fetch(e.request).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, copy).catch(function(){}); });
        return res;
      }).catch(function(){
        return caches.match(e.request).then(function(hit){
          return hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined);
        });
      })
    );
  } else {
    // CDN (Leaflet): cache-first (ändert sich nicht)
    e.respondWith(
      caches.match(e.request).then(function(hit){
        return hit || fetch(e.request).then(function(res){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, copy).catch(function(){}); });
          return res;
        });
      })
    );
  }
});
