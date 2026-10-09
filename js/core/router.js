/* ═══════════════════════════════════════════════
   CORE — Router (hash based: works on any static host, even file://)

     #/                      landing page
     #/features | #/how-it-works | #/engineering   landing page, scrolled to a section
     #/demo                  pick a demo role
     #/demo/manager|member   start a sandboxed demo session, then → #/app/<home>
     #/login                 sign in (demo accounts in demo-only builds)
     #/create                create a mess (live builds only)
     #/app/<page>            the app — requires a session, guarded by role
     #/admin/<page>          super-admin (live builds only)

   Guards run on every navigation: no session → #/login (and we remember where
   you were heading), wrong role → your home page. Page modules are fetched the
   first time they are needed.
   ═══════════════════════════════════════════════ */
const Router = (() => {
  const SLUG = /^[a-z0-9-]+$/;
  const LANDING_SECTIONS = { features: "features", "how-it-works": "how-it-works", engineering: "engineering" };
  const RETURN_KEY = "mm_return";
  let token = 0;        // bumps on every navigation so stale async work can bail out
  let shellKey = null;  // "<memberId>:<role>" the app shell was built for
  let firstRoute = true;

  const parse = () => {
    const raw = location.hash.replace(/^#\/?/, "").split("?")[0];
    return raw.split("/").filter(Boolean);
  };
  const isHome = () => ["", "#", "#/"].includes(location.hash);

  function go(path, replace = false) {
    const target = "#/" + path;
    if (location.hash === target || (path === "" && isHome())) { route(); return; }
    if (replace) location.replace(location.pathname + location.search + target);
    else location.hash = target;
  }

  /* app page change (sidebar, buttons). Same page again = re-render. */
  function openPage(page) { if (SLUG.test(String(page))) go("app/" + page); }

  function rememberReturn() {
    const p = parse().join("/");
    if (/^app\/[a-z0-9-]+$/.test(p)) { try { sessionStorage.setItem(RETURN_KEY, p); } catch (_) {} }
  }
  function takeReturn() {
    try { const v = sessionStorage.getItem(RETURN_KEY); sessionStorage.removeItem(RETURN_KEY); return /^app\/[a-z0-9-]+$/.test(v || "") ? v : null; }
    catch (_) { return null; }
  }
  function goAfterLogin() {
    if (currentUser?.role === "superadmin") return go("admin/messes", true);
    go(takeReturn() || "app/" + homePage(), true);
  }

  function resetShell() {
    shellKey = null;
    if (typeof removeMobileMoreDrawer === "function") removeMobileMoreDrawer();
    const main = document.getElementById("main-content");
    if (main) main.innerHTML = "";
  }

  const setTitle = (t) => { document.title = t ? `${t} · MessManager` : "MessManager · Mess management for shared homes"; };

  async function ensureBackend() {
    const wantDemo = MM_MODE === "demo";
    if (!sb || !!sb.isDemo !== wantDemo) await useBackend(MM_MODE);
  }

  /* Build the app shell once per user; verify the member still exists and refresh the role. */
  async function ensureShell() {
    const key = `${currentUser.memberId}:${currentUser.role}`;
    if (shellKey === key) return true;
    if (currentUser.memberId) {
      try {
        const { data: fresh } = await getClient().from("members").select("role,name,username").eq("id", currentUser.memberId).maybeSingle();
        if (!fresh) { clearSession(); resetShell(); go("login", true); return false; }
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

  async function route() {
    const my = ++token;
    const stale = () => my !== token;
    const [a, b] = parse();
    const wasFirst = firstRoute; firstRoute = false;
    closeLandingDrawer();

    try {
      /* ── landing ── */
      if (!a || LANDING_SECTIONS[a]) {
        if (!a && wasFirst && currentUser) return go(currentUser.role === "superadmin" ? "admin/messes" : "app/" + homePage(), true);
        showScreen("landing-page"); setTitle("");
        scrollToSection(LANDING_SECTIONS[a]);
        return;
      }

      /* ── demo ── */
      if (a === "demo") {
        if (b) {
          if (!MMDemo_ROLES.includes(b)) return go("demo", true);
          await startDemo(b);
          if (stale()) return;
          return go("app/" + homePage(), true);
        }
        showScreen("demo-screen"); setTitle("Live demo"); window.scrollTo(0, 0);
        loadScripts(SCRIPT_GROUPS.demo).catch(() => {}); // warm up while the visitor chooses
        return;
      }

      /* ── auth screens ── */
      if (a === "login") {
        if (currentUser) return goAfterLogin();
        await useBackend(MM_ENV.demoOnly ? "demo" : "live");
        if (stale()) return;
        showScreen("login-screen"); setTitle("Sign in"); window.scrollTo(0, 0);
        return;
      }
      if (a === "create") {
        if (MM_ENV.demoOnly) return go("demo", true);
        if (currentUser) return goAfterLogin();
        await useBackend("live");
        if (stale()) return;
        showScreen("create-mess-screen"); setTitle("Create a mess"); window.scrollTo(0, 0);
        return;
      }

      /* ── super-admin (live builds only) ── */
      if (a === "admin") {
        if (currentUser?.role !== "superadmin" || MM_ENV.demoOnly) { go("login", true); return; }
        await ensureBackend();
        if (stale()) return;
        setTitle("Super Admin");
        bootSuperAdmin(b === "metrics" ? "metrics" : "messes");
        return;
      }

      /* ── the app ── */
      if (a === "app") {
        if (!currentUser) { rememberReturn(); return go("login", true); }
        if (currentUser.role === "superadmin") return go("admin/messes", true);
        await ensureBackend();
        if (stale()) return;
        await loadAppScripts(currentUser.role);
        if (stale()) return;
        if (!(await ensureShell()) || stale()) return;

        const wanted = b && SLUG.test(b) ? b : homePage();
        const allowed = guardPage(wanted, currentUser.role);
        if (allowed !== wanted || !b) return go("app/" + allowed, true);

        showScreen("app-shell");
        setTitle(pageLabel(allowed));
        await showPage(allowed);
        if (stale()) return;
        document.getElementById("main-content")?.scrollTo?.(0, 0);
        window.scrollTo(0, 0);
        return;
      }

      go("", true); // unknown route → landing
    } catch (e) {
      console.error("[router]", e);
      if (typeof toast === "function") toast("Something went wrong loading that page. Please retry.", "error");
    }
  }

  function start() {
    if (!MM_ENV.demoOnly) document.documentElement.classList.add("live-enabled");
    loadTheme();
    loadSession();
    window.addEventListener("hashchange", route);
    route();
    // After first paint + idle, warm the cache for the demo so "Try the demo" is instant.
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    window.addEventListener("load", () => idle(prefetchAppScripts), { once: true });
  }

  return { start, go, openPage, goAfterLogin, resetShell, route };
})();

const MMDemo_ROLES = ["manager", "member"];

/* ── Demo controls (sidebar / mobile drawer) ── */
function switchDemoRole() {
  const isMgr = currentUser?.role === "manager" || currentUser?.role === "sub_manager";
  Router.go("demo/" + (isMgr ? "member" : "manager"));
}
async function resetDemo() {
  resetDemoData();
  await useBackend("demo");
  Router.resetShell();
  Router.route();
  toast("Demo data reset to the original sample", "success");
}
