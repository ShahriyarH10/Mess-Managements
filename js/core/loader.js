/* ═══════════════════════════════════════════════
   CORE — On-demand script loader
   The landing page ships only the small "core" scripts. Page modules, the
   mock backend and the Supabase SDK are fetched the first time a route needs
   them, and fetched at most once.
   ═══════════════════════════════════════════════ */
const _scriptCache = new Map();

function loadScript(src) {
  if (_scriptCache.has(src)) return _scriptCache.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false; // dynamically-inserted scripts still execute in insertion order
    s.onload = () => resolve();
    s.onerror = () => { _scriptCache.delete(src); s.remove(); reject(new Error("Failed to load " + src)); };
    document.head.appendChild(s);
  });
  _scriptCache.set(src, p);
  return p;
}

function loadScripts(list) { return Promise.all(list.map(loadScript)); }

/* Script groups. `shared` is needed by both roles (member pages call helpers that
   live in a few manager files), `manager` adds the manager-only pages. */
const SCRIPT_GROUPS = {
  demo: ["js/demo/mock-client.js", "js/demo/seed.js"],
  live: ["vendor/supabase.min.js"],
  shared: [
    "js/manager/profiles.js", "js/manager/announcements.js", "js/manager/features.js",
    "js/manager/log.js", "js/member/dashboard.js", "js/member/pages.js", "js/member/give-payment.js",
  ],
  manager: [
    "js/manager/dashboard.js", "js/manager/meals.js", "js/manager/bazar.js",
    "js/manager/utility.js", "js/manager/collect.js", "js/manager/notifications.js",
    "js/manager/members.js", "js/manager/fund.js", "js/manager/audit.js", "js/manager/roles.js",
    "js/manager/payment-requests.js",
  ],
};

function loadAppScripts(role) {
  const isMgr = role === "manager" || role === "sub_manager";
  return loadScripts(isMgr ? [...SCRIPT_GROUPS.shared, ...SCRIPT_GROUPS.manager] : SCRIPT_GROUPS.shared);
}

/* Warm the HTTP cache while the visitor reads the landing page, so entering the
   demo feels instant. Skipped on Save-Data / slow connections. */
function prefetchAppScripts() {
  const c = navigator.connection;
  if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))) return;
  const urls = [...SCRIPT_GROUPS.demo, ...SCRIPT_GROUPS.shared, ...SCRIPT_GROUPS.manager];
  urls.forEach(u => {
    if (document.querySelector(`link[rel="prefetch"][href="${u}"]`)) return;
    const l = document.createElement("link");
    l.rel = "prefetch"; l.as = "script"; l.href = u;
    document.head.appendChild(l);
  });
}
