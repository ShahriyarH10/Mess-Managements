/* ═══════════════════════════════════════════════
   CORE — Environment flags (loaded first, frozen)

   One site, two worlds:
   • SANDBOX (#/demo, #/create): an in-memory mock (js/demo/*). Never touches the
     network or your database; anything created there lives in the tab only.
   • LIVE (#/login): real Supabase accounts.

   liveLogin  true  → the sign-in form can authenticate real Supabase accounts
                      (sandbox accounts are checked locally first, no network).
              false → sign-in only knows sandbox accounts; Supabase is never contacted.
   liveSignup true  → "Create a mess" makes a REAL mess in Supabase.
              false → "Create a mess" builds a sandbox mess (safe for a public link).
   The CSP connect-src in index.html / _headers / vercel.json must allow your Supabase
   origin whenever liveLogin is true.
   ═══════════════════════════════════════════════ */
window.MM_ENV = Object.freeze({
  liveLogin: true,
  liveSignup: false,
});
