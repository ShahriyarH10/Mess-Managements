/* ═══════════════════════════════════════════════
   CORE — Router (hash based: works on any static host, even file://)

   Two separate worlds, so the sandbox can never be confused with the real app:

     REAL (Supabase)                     SANDBOX (in-memory, never touches the database)
     #/login                             #/demo/login
     #/create        real signup         #/demo/create      sandbox signup
     #/app/<page>    the app             #/demo/app/<page>  the app, same code
     #/admin/<page>  super-admin         #/demo             one click → sample mess as manager
                                         (role switching happens inside the app)

     #/ · #/features · #/how-it-works · #/engineering   landing page (+ scroll to section)

   Each world has its own session (real: localStorage, 30 days · sandbox: sessionStorage,
   tab lifetime), its own backend client and its own URLs. Guards run on every navigation:
   no session → that world's sign-in (we remember where you were heading), wrong role →
   your home page. Page modules are fetched the first time they are needed.
   ═══════════════════════════════════════════════ */
const Router = (() => {
  const SLUG = /^[a-z0-9-]+$/;
  const LANDING_SECTIONS = { features: "features", "how-it-works": "how-it-works", engineering: "engineering" };
  const RETURN_KEY = "mm_return";
  const RETURN_RE = /^(demo\/)?app\/[a-z0-9-]+$/;
  const DEMO_ROLES = ["manager", "member"];
  let token = 0;        // bumps on every navigation so stale async work can bail out
  let shellKey = null;  // "<memberId>:<role>" the app shell was built for
  let world = null;     // "live" | "demo": whose session/backend is currently loaded
  let firstRoute = true;

  const parse = () => {
    const raw = location.hash.replace(/^#\/?/, "").split("?")[0];
    return raw.split("/").filter(Boolean);
  };
  const isHome = () => ["", "#", "#/"].includes(location.hash);
  const prefix = () => (MM_MODE === "demo" ? "demo/app/" : "app/");

  function go(path, replace = false) {
    const target = "#/" + path;
    if (location.hash === target || (path === "" && isHome())) { route(); return; }
    if (replace) location.replace(location.pathname + location.search + target);
    else location.hash = target;
  }

  /* app page change (sidebar, buttons). Same page again = re-render. */
  function openPage(page) { if (SLUG.test(String(page))) go(prefix() + page); }

  function rememberReturn() {
    const p = parse().join("/");
    if (RETURN_RE.test(p)) { try { sessionStorage.setItem(RETURN_KEY, p); } catch (_) {} }
  }
  function takeReturn() {
    try {
      const v = sessionStorage.getItem(RETURN_KEY); sessionStorage.removeItem(RETURN_KEY);
      // only honour a return path that belongs to the world we just signed in to
      return RETURN_RE.test(v || "") && v.startsWith("demo/") === (MM_MODE === "demo") ? v : null;
    } catch (_) { return null; }
  }
  function goAfterLogin() {
    if (currentUser?.role === "superadmin") return go("admin/messes", true);
    go(takeReturn() || prefix() + homePage(), true);
  }

  function resetShell() {
    shellKey = null;
    if (typeof removeMobileMoreDrawer === "function") removeMobileMoreDrawer();
    const main = document.getElementById("main-content");
    if (main) main.innerHTML = "";
  }

  /* Switch to a world: load ITS session (or none) and mark the backend mode. */
  function selectWorld(w) {
    if (world === w) return;
    world = w; MM_MODE = w;
    resetShell();
    const p = readStoredSession(w);
    const valid = !!(p && p.u && p.exp && Date.now() <= p.exp);
    currentUser = valid ? p.u : null;
    currentMess = valid ? (p.m || null) : null;
    members = [];
    if (p && !valid) clearSession();
    document.body.classList.toggle("is-demo", w === "demo");
  }

  const setTitle = (t) => { document.title = t ? `${t} · MessManager` : "MessManager · Mess management for shared homes"; };

  async function ensureBackend() {
    const wantDemo = MM_MODE === "demo";
    if (!sb || !!sb.isDemo !== wantDemo) await useBackend(MM_MODE);
  }

  /* Sign-in / sign-up screens are shared markup; the copy follows the world. */
  function applyAuthCopy() {
    const demo = MM_MODE === "demo";
    const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    set("login-title", demo ? "Sandbox sign-in" : "Welcome back");
    set("login-sub", demo ? "Use a demo account, or one you created in the sandbox" : "Sign in to your mess account");
    const note = document.getElementById("create-demo-note");
    if (note) note.style.display = demo ? "" : "none";
    set("create-title", demo ? "Create a sandbox mess" : "Create your mess");
  }

  /* Build the app shell once per user; verify the member still exists and refresh the role. */
  async function ensureShell() {
    const key = `${currentUser.memberId}:${currentUser.role}`;
    if (shellKey === key) return true;
    if (currentUser.memberId) {
      try {
        const { data: fresh } = await getClient().from("members").select("role,name,username").eq("id", currentUser.memberId).maybeSingle();
        if (!fresh) { clearSession(); resetShell(); go(MM_MODE === "demo" ? "demo" : "login", true); return false; }
        if (fresh.role !== currentUser.role) {
          currentUser.role = fresh.role;
          saveSession(currentUser, currentMess, _getSessionToken());
          await loadAppScripts(currentUser.role);
        }
      } catch (e) { console.error("Role refresh failed:", e); }
    }
    await prepareShell();
    shellKey = `${currentUser.memberId}:${currentUser.role}`;
    return true;
  }

  async function startDemo(role) {
    await useBackend("demo");
    const acct = MMDemo.ACCOUNTS[role];
    const { data: row } = await sb.from("members").select("*, messes(*)").eq("username", acct.username).maybeSingle();
    if (!row) throw new Error("Demo data is unavailable");
    resetShell();
    saveSession({ name: row.name, username: row.username, role: row.role, memberId: row.id }, row.messes, null);
  }

  function scrollToSection(id) {
    const el = id && document.getElementById(id);
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (el) el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    else window.scrollTo(0, 0);
  }

  /* The app proper — identical for both worlds. */
  async function renderApp(pageSlug, stale) {
    await ensureBackend();
    if (stale()) return;
    await loadAppScripts(currentUser.role);
    if (stale()) return;
    if (!(await ensureShell()) || stale()) return;

    const wanted = pageSlug && SLUG.test(pageSlug) ? pageSlug : homePage();
    const allowed = guardPage(wanted, currentUser.role);
    if (allowed !== wanted || !pageSlug) return go(prefix() + allowed, true);

    showScreen("app-shell");
    setTitle(pageLabel(allowed));
    await showPage(allowed);
    if (stale()) return;
    document.getElementById("main-content")?.scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }

  async function route() {
    const my = ++token;
    const stale = () => my !== token;
    const [a, b, c] = parse();
    const wasFirst = firstRoute; firstRoute = false;
    closeLandingDrawer();

    try {
      /* ── landing ── */
      if (!a || LANDING_SECTIONS[a]) {
        if (!a && wasFirst && MM_ENV.liveLogin) {          // returning, signed-in real user → straight to the app
          selectWorld("live");
          if (currentUser) return go(currentUser.role === "superadmin" ? "admin/messes" : "app/" + homePage(), true);
        }
        document.body.classList.remove("is-demo");
        showScreen("landing-page"); setTitle("");
        scrollToSection(LANDING_SECTIONS[a]);
        return;
      }

      /* ═════════ SANDBOX WORLD ═════════ */
      if (a === "demo") {
        selectWorld("demo");

        if (!b) return go("demo/manager", true);             // one entry point: the sample mess, as its manager
        if (DEMO_ROLES.includes(b)) {                       // (#/demo/member stays as a hidden deep link)
          await startDemo(b);
          if (stale()) return;
          return go(takeReturn() || "demo/app/" + homePage(), true); // honours a deep link like #/demo/app/meals
        }
        if (b === "login" || b === "create") {
          if (currentUser) return goAfterLogin();
          await useBackend("demo");
          if (stale()) return;
          applyAuthCopy();
          showScreen(b === "login" ? "login-screen" : "create-mess-screen");
          setTitle(b === "login" ? "Sandbox sign-in" : "Create a sandbox mess"); window.scrollTo(0, 0);
          return;
        }
        if (b === "app") {
          if (!currentUser) { rememberReturn(); return go("demo", true); } // deep link → auto-start the sample demo
          return renderApp(c, stale);
        }
        return go("demo", true);
      }

      /* ═════════ REAL WORLD ═════════ */
      if (["login", "create", "app", "admin"].includes(a)) {
        if (!MM_ENV.liveLogin) return go("demo", true);     // sandbox-only build
        selectWorld("live");

        if (a === "login" || a === "create") {
          if (currentUser) return goAfterLogin();
          if (a === "create" && !MM_ENV.liveSignup) return go("demo/create", true);
          await useBackend("live");
          if (stale()) return;
          applyAuthCopy();
          showScreen(a === "login" ? "login-screen" : "create-mess-screen");
          setTitle(a === "login" ? "Sign in" : "Create a mess"); window.scrollTo(0, 0);
          return;
        }
        if (a === "admin") {
          if (currentUser?.role !== "superadmin") return go("login", true);
          await ensureBackend();
          if (stale()) return;
          setTitle("Super Admin");
          bootSuperAdmin(b === "metrics" ? "metrics" : "messes");
          return;
        }
        // a === "app"
        if (!currentUser) { rememberReturn(); return go("login", true); }
        if (currentUser.role === "superadmin") return go("admin/messes", true);
        return renderApp(b, stale);
      }

      go("", true); // unknown route → landing
    } catch (e) {
      console.error("[router]", e);
      if (typeof toast === "function") toast("Something went wrong loading that page. Please retry.", "error");
    }
  }

  function start() {
    if (MM_ENV.liveLogin) document.documentElement.classList.add("live-enabled");
    loadTheme();
    window.addEventListener("hashchange", route);
    route();
    // After first paint + idle, warm the cache for the demo so "Try the demo" is instant.
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    window.addEventListener("load", () => idle(prefetchAppScripts), { once: true });
  }

  return { start, go, openPage, goAfterLogin, resetShell, route };
})();

/* ── Demo controls (sidebar / mobile drawer) ── */

/* Jump between the manager's view and a member's view of the CURRENT sandbox mess (no password
   needed — it's a sandbox). Works for the sample mess and for a mess you created. */
async function switchDemoRole() {
  if (MM_MODE !== "demo" || !currentUser) return;
  const toMember = currentUser.role === "manager" || currentUser.role === "sub_manager";
  const { data: rows } = await getClient().from("members").select("*, messes(*)")
    .eq("mess_id", currentMess.id).eq("role", toMember ? "member" : "manager").order("created_at");
  const row = rows && rows[0];
  if (!row) {
    toast(toMember ? "Add a member first (Members page), then switch to their view." : "No manager found in this mess.", "error");
    return;
  }
  Router.resetShell();
  saveSession({ name: row.name, username: row.username, role: row.role, memberId: row.id }, row.messes, null);
  Router.go("demo/app/" + homePage());
}

async function resetDemo() {
  resetDemoData();           // discards everything you created in this tab
  await useBackend("demo");  // rebuild the client on a freshly seeded store
  Router.resetShell();
  Router.go("demo/manager"); // back to the sample mess
  toast("Demo reset to the original sample data", "success");
}
