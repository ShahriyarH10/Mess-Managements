/* ═══════════════════════════════════════════════
   CORE — Environment flags (loaded first, frozen)

   One site, two worlds:
   • SANDBOX (everything under #/demo/…): an in-memory mock (js/demo/*). Never touches
     the network or your database; anything created there lives in the tab only.
   • REAL (#/login, #/create, #/app/…): Supabase accounts.

   liveLogin  true  → real sign-in works at #/login.
              false → sandbox-only site; Supabase is never contacted (/#/login → sandbox).
   liveSignup true  → #/create makes a REAL mess in Supabase.
              false → #/create redirects to the sandbox (#/demo/create).
   The CSP connect-src in index.html / _headers / vercel.json must allow your Supabase
   origin whenever liveLogin is true.
   ═══════════════════════════════════════════════ */
window.MM_ENV = Object.freeze({
  liveLogin: true,
  liveSignup: true,
});
