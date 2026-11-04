/* ═══════════════════════════════════════════════
   CORE — Icons: one inline-SVG set for the whole app (no emoji)

   Same drawing style as the sidebar icons in nav.js: 16×16 grid, 1.5px
   stroke, round caps, currentColor — so an icon takes the colour and size
   of the text around it.

     ic("lock")                      → <svg class="ic">…</svg>
     ic("check", "ic-green")         → extra classes
     ic("alert", "", "Locked")       → with an accessible label (else aria-hidden)

   Inline SVG needs no network request and passes the strict CSP. width/height
   are set as attributes too, so icons stay text-sized in documents without the
   app's CSS (printed reports, receipt windows).
   ═══════════════════════════════════════════════ */
const ICON_PATHS = {
  // ── money & bills ──
  cash:      '<rect x="1.5" y="4" width="13" height="8" rx="1.2"/><circle cx="8" cy="8" r="1.8"/><path d="M4 8h.01M12 8h.01"/>',
  card:      '<rect x="1.5" y="3.5" width="13" height="9" rx="1.2"/><path d="M1.5 6.5h13M4 10h3"/>',
  wallet:    '<path d="M13 5V3.5a1 1 0 00-1-1H3a1.5 1.5 0 000 3h10a1 1 0 011 1V12a1 1 0 01-1 1H3a1.5 1.5 0 01-1.5-1.5V4"/><path d="M11 9h.01"/>',
  send:      '<path d="M14.5 1.5L7 9M14.5 1.5L10 14.5 7 9 1.5 6z"/>',
  receipt:   '<path d="M3 1.5h10v13l-2-1.2-1.6 1.2L8 13.3l-1.4 1.2L5 13.3l-2 1.2z"/><path d="M5.5 5h5M5.5 8h5M5.5 11h3"/>',
  bank:      '<path d="M1.5 6L8 2l6.5 4M2.5 6h11M3.5 6v6M6.5 6v6M9.5 6v6M12.5 6v6M1.5 14h13"/>',
  fund:      '<circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v7M10 6H7a1 1 0 000 2h2a1 1 0 010 2H6"/>',
  calc:      '<rect x="3" y="1.5" width="10" height="13" rx="1.2"/><path d="M5.5 4.5h5M5.5 8h.01M8 8h.01M10.5 8h.01M5.5 11h.01M8 11h.01M10.5 11h.01"/>',
  tag:       '<path d="M1.5 8.6V2.5a1 1 0 011-1h6.1l6 6a1 1 0 010 1.4l-5.1 5.1a1 1 0 01-1.4 0z"/><circle cx="5" cy="5" r="1"/>',

  // ── home / meals / bazar / utilities ──
  mapPin:    '<path d="M8 14.5s5-4.6 5-8.5a5 5 0 00-10 0c0 3.9 5 8.5 5 8.5z"/><circle cx="8" cy="6" r="1.8"/>',
  home:      '<path d="M2 7l6-5 6 5v6.5a1 1 0 01-1 1H3a1 1 0 01-1-1z"/><path d="M6 14.5V10h4v4.5"/>',
  meal:      '<path d="M4 1.5v4.5a1.5 1.5 0 003 0V1.5M5.5 1.5v13M11.5 14.5V1.5c-1.7.6-2.5 2.4-2.5 4.5v3h2.5"/>',
  cart:      '<path d="M1 1.5h2l1.6 8.2a1 1 0 001 .8h6.5a1 1 0 001-.8L14.5 4.5H4"/><circle cx="6" cy="13.5" r="1"/><circle cx="12" cy="13.5" r="1"/>',
  zap:       '<path d="M9 1.5L3 9h5l-1 5.5L13 7H8z"/>',
  wifi:      '<path d="M1.5 5.8a9.5 9.5 0 0113 0M3.8 8.4a6.2 6.2 0 018.4 0M6 11a3 3 0 014 0"/><path d="M8 13.5h.01"/>',
  flame:     '<path d="M8 14.5a4.5 4.5 0 004.5-4.5c0-3-2.5-4.5-3-8-2 1.5-3 3.5-3 5.2C5.5 6.2 5 5.5 5 4.5 3.8 5.7 3.5 7.6 3.5 10A4.5 4.5 0 008 14.5z"/>',
  box:       '<path d="M8 1.5l6 3v7l-6 3-6-3v-7z"/><path d="M2 4.5l6 3 6-3M8 7.5v7"/>',
  cook:      '<path d="M4.5 9.5a3 3 0 01.6-5.9 3 3 0 015.8 0 3 3 0 01.6 5.9V14h-7z"/><path d="M4.5 11.5h7"/>',
  broom:     '<path d="M13.5 2.5L8.5 7.5M6 6.5l3.5 3.5-2 4.5c-2.5-.5-5-3-5.5-5.5z"/><path d="M4.5 11l1.5-1.5"/>',

  // ── people & roles ──
  user:      '<circle cx="8" cy="5" r="3"/><path d="M2 14.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/>',
  users:     '<circle cx="6" cy="5" r="2.5"/><path d="M1 14c0-2.8 2.2-5 5-5s5 2.2 5 5"/><path d="M10.5 2.7a2.5 2.5 0 010 4.6M12.5 9.4c1.5.7 2.5 2.4 2.5 4.6"/>',
  crown:     '<path d="M2 12.5L1.5 4.5l3.5 3L8 2.5l3 5 3.5-3-.5 8z"/><path d="M2 14.5h12"/>',
  shield:    '<path d="M8 1.5l5.5 2v4.2c0 3.2-2.3 5.8-5.5 6.8-3.2-1-5.5-3.6-5.5-6.8V3.5z"/>',
  key:       '<circle cx="5" cy="11" r="3"/><path d="M7.1 8.9L14 2M11 5l2 2M12.5 3.5l1.5 1.5"/>',
  hand:      '<path d="M5 8V3a1 1 0 012 0v4M7 7V2a1 1 0 012 0v5M9 7V3a1 1 0 012 0v5.5M11 6a1 1 0 012 0v3.5a5 5 0 01-5 5H7.5A4.5 4.5 0 013 12L1.8 9.6a1 1 0 011.7-1L5 10.5V8"/>',
  award:     '<circle cx="8" cy="6" r="4.5"/><path d="M5.5 9.7L4.5 14.5 8 12.5l3.5 2-1-4.8"/>',

  // ── status ──
  check:     '<path d="M3 8.5l3.2 3.2L13 4.5"/>',
  checkCircle:'<circle cx="8" cy="8" r="6.5"/><path d="M5.2 8.2l2 2L11 6.2"/>',
  x:         '<path d="M4 4l8 8M12 4l-8 8"/>',
  xCircle:   '<circle cx="8" cy="8" r="6.5"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>',
  alert:     '<path d="M8 1.8l6.6 11.7H1.4z"/><path d="M8 6.5v3M8 11.5h.01"/>',
  info:      '<circle cx="8" cy="8" r="6.5"/><path d="M8 7.5v4M8 5h.01"/>',
  dot:       '<circle cx="8" cy="8" r="3.5" fill="currentColor" stroke="none"/>',
  clock:     '<circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/>',
  hourglass: '<path d="M3.5 1.5h9M3.5 14.5h9M4.5 1.5v2.2c0 1.2.6 2.3 1.6 3L8 8l1.9-1.3c1-.7 1.6-1.8 1.6-3V1.5M4.5 14.5v-2.2c0-1.2.6-2.3 1.6-3L8 8l1.9 1.3c1 .7 1.6 1.8 1.6 3v2.2"/>',
  sparkle:   '<path d="M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z"/>',
  heart:     '<path d="M8 13.8S1.5 10 1.5 5.8A3.3 3.3 0 018 4.2a3.3 3.3 0 016.5 1.6C14.5 10 8 13.8 8 13.8z"/>',
  zzz:       '<path d="M2 3.5h4l-4 5h4M9 7.5h5l-5 6h5"/>',

  // ── security / state ──
  lock:      '<rect x="3" y="7" width="10" height="7.5" rx="1.2"/><path d="M5.2 7V5a2.8 2.8 0 015.6 0v2"/>',
  unlock:    '<rect x="3" y="7" width="10" height="7.5" rx="1.2"/><path d="M5.2 7V5a2.8 2.8 0 015.4-1"/>',
  eye:       '<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/>',

  // ── actions ──
  edit:      '<path d="M10.5 2.5l3 3L5.5 13.5H2.5v-3z"/><path d="M9 4l3 3"/>',
  save:      '<path d="M2.5 2.5h8.5l2.5 2.5v8.5a1 1 0 01-1 1h-10a1 1 0 01-1-1v-10a1 1 0 011-1z"/><path d="M5 2.5V6h5V2.5M5 14.5v-4.5h6v4.5"/>',
  print:     '<path d="M4 6V1.5h8V6M4 12H2.5a1 1 0 01-1-1V7a1 1 0 011-1h11a1 1 0 011 1v4a1 1 0 01-1 1H12"/><path d="M4 9.5h8v5H4z"/>',
  copy:      '<rect x="5" y="5" width="9.5" height="9.5" rx="1.2"/><path d="M11 5V2.5a1 1 0 00-1-1H2.5a1 1 0 00-1 1V10a1 1 0 001 1H5"/>',
  link:      '<path d="M6.5 9.5a3 3 0 004.2 0l2.4-2.4a3 3 0 00-4.2-4.2l-.9.9M9.5 6.5a3 3 0 00-4.2 0L2.9 8.9a3 3 0 004.2 4.2l.9-.9"/>',
  undo:      '<path d="M5.5 3L2 6.5 5.5 10"/><path d="M2 6.5h7.75a3.75 3.75 0 010 7.5H7"/>',
  refresh:   '<path d="M13.5 8A5.5 5.5 0 113.4 5"/><path d="M13.5 2.5V6H10"/>',
  rewind:    '<path d="M7.5 3.5L2 8l5.5 4.5zM14 3.5L8.5 8l5.5 4.5z"/>',
  skipBack:  '<path d="M12.5 3.5L6 8l6.5 4.5zM3.5 3.5v9"/>',
  search:    '<circle cx="7" cy="7" r="5"/><path d="M14.5 14.5L10.6 10.6"/>',
  plus:      '<path d="M8 2.5v11M2.5 8h11"/>',
  trash:     '<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.6a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4"/>',
  camera:    '<path d="M1.5 5.5a1 1 0 011-1h2L6 2.5h4l1.5 2h2a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1z"/><circle cx="8" cy="8.5" r="2.5"/>',
  pin:       '<path d="M10 1.5l4.5 4.5-2.5 1-3 3 .5 3.5L1.5 6.5l3.5.5 3-3z"/><path d="M5.5 10.5L1.5 14.5"/>',

  // ── content ──
  clipboard: '<rect x="3" y="2.5" width="10" height="12" rx="1.2"/><path d="M6 1.5h4v2.5H6zM5.5 7.5h5M5.5 10.5h3.5"/>',
  file:      '<path d="M9 1.5H4a1 1 0 00-1 1v11a1 1 0 001 1h8a1 1 0 001-1V5.5z"/><path d="M9 1.5v4h4M5.5 8.5h5M5.5 11.5h5"/>',
  folder:    '<path d="M1.5 4a1 1 0 011-1h3.5l1.5 1.5h6a1 1 0 011 1V12a1 1 0 01-1 1h-11a1 1 0 01-1-1z"/>',
  chart:     '<path d="M2 14.5h12M4 11.5V8M8 11.5V4M12 11.5V6.5"/>',
  calendar:  '<rect x="2" y="3" width="12" height="11.5" rx="1.2"/><path d="M5 1.5v3M11 1.5v3M2 7h12"/>',
  message:   '<path d="M14.5 10a1 1 0 01-1 1H5l-3.5 3.5v-12a1 1 0 011-1h11a1 1 0 011 1z"/>',
  megaphone: '<path d="M2 6v4h2.5l6 3.5v-11l-6 3.5zM4.5 10l1 4h2l-1-3.8M13 6.2a2.5 2.5 0 010 3.6"/>',
  bell:      '<path d="M8 1.5a4.5 4.5 0 014.5 4.5v3l1.5 2.5H2L3.5 9V6A4.5 4.5 0 018 1.5zM6.5 13.5a1.5 1.5 0 003 0"/>',
  phone:     '<path d="M14.5 11.3v2a1.3 1.3 0 01-1.4 1.3A13 13 0 011.4 2.9 1.3 1.3 0 012.7 1.5h2a1.3 1.3 0 011.3 1.1c.1.7.3 1.3.5 1.9a1.3 1.3 0 01-.3 1.4l-.9.9a10.5 10.5 0 004 4l.9-.9a1.3 1.3 0 011.4-.3c.6.2 1.2.4 1.9.5a1.3 1.3 0 011.1 1.3z"/>',
  phoneMobile:'<rect x="4" y="1.5" width="8" height="13" rx="1.5"/><path d="M7 12h2"/>',
  compass:   '<circle cx="8" cy="8" r="6.5"/><path d="M10.7 5.3L9.3 9.3 5.3 10.7 6.7 6.7z"/>',
  flask:     '<path d="M6 1.5h4M6.5 1.5v4.2L2.3 12.6a1.2 1.2 0 001 1.9h9.4a1.2 1.2 0 001-1.9L9.5 5.7V1.5M4.2 10h7.6"/>',
  lightbulb: '<path d="M6 12.5h4M6.5 14.5h3M5.5 10.5a5 5 0 115 0c-.6.4-.9 1-.9 1.6V12.5H6.4v-.4c0-.6-.3-1.2-.9-1.6z"/>',
  briefcase: '<rect x="1.5" y="4.5" width="13" height="9" rx="1.2"/><path d="M5.5 4.5V3a1 1 0 011-1h3a1 1 0 011 1v1.5M1.5 8.5h13"/>',
  square:    '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/>',
  moon:      '<path d="M13.5 10.2A6 6 0 015.8 2.5a6 6 0 107.7 7.7z"/>',
  sun:       '<circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M13 3l-1 1M4 12l-1 1"/>',
};

function ic(name, cls, label) {
  const p = ICON_PATHS[name];
  if (!p) { console.warn("[icons] unknown icon:", name); return ""; }
  const a11y = label ? ` role="img" aria-label="${escapeHtml(label)}"` : ` aria-hidden="true"`;
  return `<svg class="ic${cls ? " " + cls : ""}" width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"${a11y}>${p}</svg>`;
}

/* Plain-text safety net: drops any emoji (and the space after it) from text that
   can't hold an icon — toasts, confirm dialogs, titles. Arrows (→ ←) are kept. */
const EMOJI_RE = /(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u21A9\u21AA\u2139]\uFE0F?|\uFE0F|\u200D)\s?/gu;
const stripEmoji = (s) => String(s ?? "").replace(EMOJI_RE, "").replace(/\s{2,}/g, " ").trim();
