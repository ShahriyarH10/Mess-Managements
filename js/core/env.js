/* ═══════════════════════════════════════════════
   CORE — Environment flags (loaded first, frozen)

   demoOnly: true  → the app NEVER talks to Supabase. Every query is served
                     by an in-memory mock (js/demo/*) seeded with sample data.
                     This is the safe default for a public portfolio link.
   demoOnly: false → real sign-in / create-mess against Supabase is enabled and
                     the demo stays available at #/demo.
                     (Also allow your Supabase origin in the CSP — see README.)
   ═══════════════════════════════════════════════ */
window.MM_ENV = Object.freeze({
  demoOnly: false, // LIVE branch: real Supabase sign-in enabled (the sandbox stays at #/demo)
});
