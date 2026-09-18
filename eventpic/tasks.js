/* ==========================================================================
   tasks.js — Event-Konfiguration + Fotoaufgaben
   --------------------------------------------------------------------------
   Diese Datei darfst du ohne Programmierkenntnisse bearbeiten.

   Aufgabe ändern  : Text hinter "text:" anpassen.
   Aufgabe streichen: Zeile löschen ODER "off: true" ergänzen (behält die ID).
   Aufgabe ergänzen : neue Zeile nach dem gleichen Muster, mit NEUER id.

   ⚠️ Die "id" ist der Schlüssel, unter dem die Fotos gespeichert werden.
      Nie eine id nachträglich ändern — sonst verlieren bereits hochgeladene
      Fotos ihre Aufgabe. Neue Aufgaben bekommen einfach die nächste freie id.
   ========================================================================== */

window.EVENT = {
  // Unratbare Kennung dieses Fests. Trennt die Fotos von anderen Events
  // in derselben Datenbank. Nur ändern, wenn du bei Null anfangen willst.
  eventId: 'thomas60-2026',

  title: 'Thomas wird 60',
  subtitle: 'Mach mit: 42 Fotoaufgaben für den schönsten Tag',
  honoree: 'Thomas',
  dateLabel: '',            // z.B. '13. Juni 2026' — leer = wird nicht angezeigt
  accent: '#c8102e',        // Akzentfarbe der App
  slideshowSeconds: 6,      // Bildwechsel in der Slideshow
  showLeaderboard: false,   // Spaß-Rangliste (siehe Lastenheft F-35)
  maxEdge: 1600,            // längste Bildkante nach Komprimierung (px)
  jpegQuality: 0.82,
};

/* Kategorien: id, Label, Emoji.
   "timed: true" markiert Programmpunkte, die nur zu bestimmten Zeiten
   fotografierbar sind (Orchester, Eiswagen, Hüpfburg, Gulaschkanone). */
window.CATEGORIES = [
  { id: 'thomas',  label: 'Thomas',                icon: '🎉' },
  { id: 'sixty',   label: '60 Jahre',              icon: '6️⃣' },
  { id: 'guests',  label: 'Gäste & Gruppen',       icon: '👥' },
  { id: 'gen',     label: 'Generationen & Kinder', icon: '👶' },
  { id: 'music',   label: 'Blasorchester',         icon: '🎺', timed: true },
  { id: 'ice',     label: 'Eiswagen',              icon: '🍦', timed: true },
  { id: 'bounce',  label: 'Hüpfburg',              icon: '🤸', timed: true },
  { id: 'goulash', label: 'Gulaschkanone',         icon: '🍲', timed: true },
  { id: 'deco',    label: 'Deko & Details',        icon: '✨' },
  { id: 'moments', label: 'Momente',               icon: '📸' },
];

window.TASKS = [
  // ---- Thomas ------------------------------------------------------------
  { id: 't01', cat: 'thomas',  text: 'Fotografiere dich mit Geburtstagskind Thomas in einem besonderen Moment.' },
  { id: 't02', cat: 'thomas',  text: 'Fotografiere Thomas, wie man ihn kennt.' },
  { id: 't03', cat: 'thomas',  text: 'Halte einen Moment fest, der Thomas zum Lachen bringt.' },
  { id: 't04', cat: 'thomas',  text: 'Fotografiere Thomas mit jemandem, der ihn schon lange kennt.' },
  { id: 't05', cat: 'thomas',  text: 'Mache ein Foto mit Menschen, die für Thomas wichtig sind.' },
  { id: 't06', cat: 'thomas',  text: 'Fotografiere einen besonderen Moment zwischen Thomas und seinen Enkelkindern.' },

  // ---- 60 Jahre ----------------------------------------------------------
  { id: 's01', cat: 'sixty',   text: 'Mache ein Foto, das für 60 Jahre Thomas steht.' },
  { id: 's02', cat: 'sixty',   text: 'Fotografiere jemanden mit der Zahl 60.' },
  { id: 's03', cat: 'sixty',   text: 'Mache ein Foto, auf dem die Zahl 60 kreativ dargestellt wird.' },

  // ---- Gäste & Gruppen ---------------------------------------------------
  { id: 'g01', cat: 'guests',  text: 'Fotografiere zwei Gäste, die sich schon sehr lange kennen.' },
  { id: 'g02', cat: 'guests',  text: 'Mache ein Gruppenfoto mit mindestens fünf Personen.' },
  { id: 'g03', cat: 'guests',  text: 'Fotografiere ein möglichst verrücktes Gruppenfoto.' },
  { id: 'g04', cat: 'guests',  text: 'Mache ein Foto, auf dem alle ganz ernst schauen.' },
  { id: 'g05', cat: 'guests',  text: 'Fotografiere zwei Gäste, die man so vielleicht nicht zusammen erwartet hätte.' },
  { id: 'g06', cat: 'guests',  text: 'Mache ein Foto mit jemandem, den du heute zum ersten Mal oder nur selten siehst.' },
  { id: 'g07', cat: 'guests',  text: 'Fotografiere drei Personen, die gemeinsam über etwas lachen.' },
  { id: 'g08', cat: 'guests',  text: 'Fotografiere einen Moment, in dem mehrere Gäste gemeinsam feiern.' },
  { id: 'g09', cat: 'guests',  text: 'Fotografiere einen besonderen Moment an deinem Tisch.' },
  { id: 'g10', cat: 'guests',  text: 'Mache ein kreatives Anstoßfoto.' },
  { id: 'g11', cat: 'guests',  text: 'Fotografiere jemanden beim Tanzen.' },

  // ---- Generationen & Kinder --------------------------------------------
  { id: 'k01', cat: 'gen',     text: 'Mache ein Foto mit drei Generationen.' },
  { id: 'k02', cat: 'gen',     text: 'Halte einen schönen Moment zwischen Kindern und Erwachsenen fest.' },
  { id: 'k03', cat: 'gen',     text: 'Fotografiere ein Kind bei einem schönen oder lustigen Moment.' },

  // ---- Blasorchester -----------------------------------------------------
  { id: 'm01', cat: 'music',   text: 'Fotografiere einen besonderen Moment mit dem Blasorchester.' },
  { id: 'm02', cat: 'music',   text: 'Mache ein Foto von einem Musiker oder einer Musikerin des Blasorchesters in Aktion.' },

  // ---- Eiswagen ----------------------------------------------------------
  { id: 'e01', cat: 'ice',     text: 'Fotografiere jemanden beim Eiswagen.' },
  { id: 'e02', cat: 'ice',     text: 'Mache ein lustiges oder kreatives Foto am Eiswagen.' },

  // ---- Hüpfburg ----------------------------------------------------------
  { id: 'h01', cat: 'bounce',  text: 'Fotografiere die Hüpfburg mit möglichst viel Action.' },
  { id: 'h02', cat: 'bounce',  text: 'Mache ein Foto von Kindern auf der Hüpfburg.' },
  { id: 'h03', cat: 'bounce',  text: 'Fotografiere Thomas mit einem Bezug zur Hüpfburg.' },

  // ---- Gulaschkanone -----------------------------------------------------
  { id: 'u01', cat: 'goulash', text: 'Mache ein Foto von der Gulaschkanone.' },
  { id: 'u02', cat: 'goulash', text: 'Fotografiere jemanden beim Essen aus der Gulaschkanone.' },
  { id: 'u03', cat: 'goulash', text: 'Mache ein Foto, auf dem Kinder und die Gulaschkanone gemeinsam vorkommen.' },

  // ---- Deko & Details ----------------------------------------------------
  { id: 'd01', cat: 'deco',    text: 'Fotografiere die schönste Partydekoration.' },
  { id: 'd02', cat: 'deco',    text: 'Fotografiere ein schönes Detail der Partydekoration.' },
  { id: 'd03', cat: 'deco',    text: 'Mache ein kreatives Foto mit einem Dekorationselement.' },
  { id: 'd04', cat: 'deco',    text: 'Mache ein Foto ohne Menschen, das für diesen Geburtstag steht.' },

  // ---- Momente -----------------------------------------------------------
  { id: 'p01', cat: 'moments', text: 'Halte einen lustigen Moment hinter den Kulissen fest.' },
  { id: 'p02', cat: 'moments', text: 'Fotografiere einen Moment, den nicht alle Gäste mitbekommen.' },
  { id: 'p03', cat: 'moments', text: 'Halte einen spontanen, ungeplanten Party-Moment fest.' },
  { id: 'p04', cat: 'moments', text: 'Mache ein Foto, das Thomas auch an seinem 70. Geburtstag noch gerne anschauen wird.' },
  { id: 'p05', cat: 'moments', text: 'Fotografiere deinen persönlichen Lieblingsmoment des Tages.' },
];
