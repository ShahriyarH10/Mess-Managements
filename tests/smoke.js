/* Browser smoke test: drives the real app in an iframe (same origin) and reports
   PASS/FAIL lines into #out. Run headless:
   chrome --headless=new --virtual-time-budget=120000 --dump-dom http://localhost:8000/tests/smoke.html */
(async () => {
  const out = document.getElementById("out");
  const frame = document.getElementById("app");
  let fails = 0;
  const log = (ok, msg) => { if (!ok) fails++; out.textContent += (ok ? "PASS " : "FAIL ") + msg + "\n"; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch (_) {} await sleep(40); } return false; };
  const W = () => frame.contentWindow, D = () => frame.contentDocument;
  const errors = [];
  const hook = () => {
    const w = W();
    if (w.__hooked) return; w.__hooked = true;
    w.addEventListener("error", e => errors.push("error: " + e.message));
    w.addEventListener("unhandledrejection", e => errors.push("rejection: " + (e.reason && e.reason.message || e.reason)));
    w.document.addEventListener("securitypolicyviolation", e => errors.push("CSP: " + e.violatedDirective + " blocked " + (e.blockedURI || e.sample || "inline")));
    const ce = w.console.error; w.console.error = (...a) => { errors.push("console.error: " + a.map(String).join(" ")); ce.apply(w.console, a); };
  };
  const visible = (id) => { const el = D().getElementById(id); return !!el && el.style.display !== "none"; };
  const openHash = async (h) => {
    const cur = W() && W().location.href;
    if (!cur || cur === "about:blank") { frame.src = "../index.html" + h; await new Promise(r => frame.onload = r); }
    else W().location.hash = h;
    await sleep(60);
  };
  const settle = async () => { await until(() => !D().querySelector("#main-content .loading"), 6000); await sleep(150); };
  const P = () => W().__probe;
  const inject = () => new Promise(r => { const sc = D().createElement("script"); sc.src = "../tests/probe.js"; sc.onload = r; D().head.appendChild(sc); });
  const handlerNames = new Set();
  const scanHandlers = () => {
    D().querySelectorAll("*").forEach(el => [...el.attributes].filter(a => /^(data-)?on/.test(a.name)).forEach(a => {
      (a.value.match(/(?:^|[;)\s])([A-Za-z_$][\w$]*)\(/g) || []).forEach(m => handlerNames.add(m.replace(/[;)\s(]/g, "")));
    }));
  };

  try {
    /* 1. landing + lazy loading */
    frame.src = "../index.html"; await new Promise(r => frame.onload = r); await sleep(300); hook(); await inject();
    log(visible("landing-page"), "landing page visible at #/");
    const early = [...D().scripts].map(s => s.getAttribute("src")).filter(Boolean);
    log(!early.some(s => /manager\/|member\/|demo\/|vendor\//.test(s)), "landing loads no page/demo/vendor scripts (" + early.length + " core scripts)");
    log(P().env().liveLogin === true && P().env().liveSignup === false, "flags: real login on, real signup off");
    log(P().sb() === null, "no backend client built on landing");

    /* 2. guards */
    await openHash("#/app/dashboard"); await until(() => W().location.hash === "#/login");
    log(W().location.hash === "#/login" && visible("login-screen"), "unauthenticated #/app/dashboard → #/login");
    await openHash("#/admin/messes"); await until(() => W().location.hash === "#/login");
    log(W().location.hash === "#/login", "unauthenticated #/admin → #/login");
    await openHash("#/create"); await until(() => visible("create-mess-screen"));
    log(visible("create-mess-screen") && D().getElementById("create-demo-note").style.display !== "none", "#/create works in demo-only build, with sandbox note");
    await openHash("#/nope/zzz"); await until(() => W().location.hash === "#/");
    log(visible("landing-page"), "unknown route → landing");

    /* 3. manager demo */
    await openHash("#/demo/manager");
    const ok = await until(() => W().location.hash === "#/app/dashboard" && D().querySelector("#main-content .stat-card"), 10000);
    log(ok, "demo manager lands on #/app/dashboard with stats");
    hook();
    log(P().sb() && P().sb().isDemo === true && P().mode() === "demo", "backend is the in-memory mock");
    log(!/supabase\.co/.test(JSON.stringify(performance.getEntriesByType ? W().performance.getEntriesByType("resource").map(r => r.name) : [])), "no request to supabase.co");
    const ext = W().performance.getEntriesByType("resource").map(r => r.name).filter(n => !n.startsWith(location.origin));
    log(ext.length === 0, "no third-party requests (" + ext.length + ")");
    log(W().document.body.classList.contains("is-demo"), "demo chrome enabled");

    const mgrPages = P().managerNav().filter(i => i.page).map(i => i.page).concat(["transfer"]);
    for (const p of mgrPages) {
      errors.length = 0;
      await openHash("#/app/" + p); await settle();
      const txt = D().getElementById("main-content").innerText;
      const bad = /Error loading page|Page not found/.test(txt) || txt.trim().length < 20;
      log(!bad && errors.length === 0, "manager page " + p + (errors.length ? "  ← " + errors.join(" | ") : bad ? "  ← " + txt.slice(0, 120) : ""));
      scanHandlers();
    }

    /* 4. interactions */
    await openHash("#/app/meals"); await settle();
    D().querySelector('.nav-item[data-page="bazar"]').click();
    await until(() => W().location.hash === "#/app/bazar");
    log(W().location.hash === "#/app/bazar", "sidebar click (delegated handler) changes route");
    await settle();
    W().history.back(); await until(() => W().location.hash === "#/app/meals");
    log(W().location.hash === "#/app/meals", "browser back returns to previous page");

    await openHash("#/app/meals"); await settle();
    const dayInput = D().querySelector(".meal-num-input"); 
    errors.length = 0;
    await W().saveMeals(); await sleep(300);
    log(/saved/i.test(D().getElementById("toast").textContent), "saveMeals() works against mock: toast '" + D().getElementById("toast").textContent + "'");
    const rows = await P().sb().from("audit_log").select("*", { count: "exact", head: true });
    log(rows.count >= 9, "audit log got a new row (count " + rows.count + ")");

    D().querySelector('[data-on-click="toggleTheme()"]').click();
    log(["light", "dark"].includes(D().documentElement.getAttribute("data-theme")), "toggleTheme handler runs");


    /* 4b. interactions through the delegated handlers (no inline-script execution needed) */
    const click = (sel) => { const el = D().querySelector(sel); if (!el) throw new Error("missing " + sel); el.click(); };
    errors.length = 0;
    await openHash("#/app/members"); await settle();
    click('[data-on-click="openAddMemberModal()"]'); await sleep(150);
    log(D().getElementById("modal-bg").classList.contains("open"), "Add-member modal opens via onclick attribute");
    click('#modal-bg [data-on-click="closeModal()"]'); await sleep(100);
    log(!D().getElementById("modal-bg").classList.contains("open"), "closeModal() via onclick attribute");
    D().getElementById("modal-bg").classList.add("open");
    D().getElementById("modal-bg").dispatchEvent(new (W().MouseEvent)("click", { bubbles: true }));
    await sleep(100);
    log(!D().querySelector("[onclick],[onchange],[oninput]"), "no native on* attributes remain in the DOM (all moved to data-on-*)");
    log(!D().getElementById("modal-bg").classList.contains("open"), "backdrop click closes modal (if(event.target===this) form)");

    await openHash("#/app/utility"); await settle();
    click('[data-on-click="saveUtilityGroup(\'prepaid\')"]'); await sleep(400);
    log(/saved/i.test(D().getElementById("toast").textContent), "saveUtilityGroup('prepaid') → '" + D().getElementById("toast").textContent + "'");
    await openHash("#/app/rent"); await settle();
    click('[data-on-click="saveRent()"]'); await sleep(400);
    log(/saved/i.test(D().getElementById("toast").textContent), "saveRent() → '" + D().getElementById("toast").textContent + "'");
    await openHash("#/app/messages"); await settle();
    W().openAnnounceModal(); await sleep(150);
    D().getElementById("an-title").value = "Smoke test notice"; D().getElementById("an-body").value = "Hello";
    click('[data-on-click="postAnnounce()"]'); await sleep(500);
    const an = await P().sb().from("announcements").select("*");
    log(an.data.some(a => a.title === "Smoke test notice"), "postAnnounce() inserts into the mock store");
    await openHash("#/app/notifications"); await settle();
    const nb = D().querySelector('[data-on-click^="markNotificationSeen"]');
    if (nb) { nb.click(); await sleep(400); }
    log(!!nb, "notification 'seen' button present and clickable");
    log(errors.length === 0, "no console errors / CSP violations during interactions" + (errors.length ? " ← " + errors.join(" | ") : ""));

    /* demo reset restores the seed */
    await W().resetDemo(); await settle();
    const an2 = await P().sb().from("announcements").select("*");
    log(!an2.data.some(a => a.title === "Smoke test notice") && an2.data.length === 3, "resetDemo() restores seed data");

    /* settlement numbers sanity */
    await openHash("#/app/dashboard"); await settle();
    const dash = D().getElementById("main-content").innerText;
    log(/৳\s?\d/.test(dash), "dashboard shows taka amounts");

    /* 5. member demo + role guard */
    await openHash("#/demo/member");
    await until(() => W().location.hash === "#/app/my-dashboard" && D().querySelector("#main-content .stat-card, #main-content .card"), 10000);
    log(W().location.hash === "#/app/my-dashboard", "demo member lands on #/app/my-dashboard");
    await openHash("#/app/members"); await until(() => W().location.hash === "#/app/my-dashboard");
    log(W().location.hash === "#/app/my-dashboard", "member opening manager-only route is redirected");
    await openHash("#/app/dashboard"); await until(() => W().location.hash === "#/app/my-dashboard");
    log(W().location.hash === "#/app/my-dashboard", "member opening #/app/dashboard is redirected");
    const memPages = P().memberNav().filter(i => i.page).map(i => i.page).concat(["mess-overview"]);
    for (const p of memPages) {
      errors.length = 0;
      await openHash("#/app/" + p); await settle();
      const txt = D().getElementById("main-content").innerText;
      const bad = /Error loading page|Page not found/.test(txt) || txt.trim().length < 20;
      log(!bad && errors.length === 0, "member page " + p + (errors.length ? "  ← " + errors.join(" | ") : bad ? "  ← " + txt.slice(0, 120) : ""));
      scanHandlers();
    }

    /* 6. every inline-handler function name resolves to a real global function */
    const missing = [...handlerNames].filter(n => !["if", "event", "this"].includes(n) && typeof W()[n] !== "function");
    log(missing.length === 0, "all inline-handler functions exist (" + handlerNames.size + " checked)" + (missing.length ? " missing: " + missing.join(", ") : ""));

    /* 7. login form works against demo accounts, reset + logout */
    W().doLogout(); await until(() => visible("landing-page"));
    log(visible("landing-page") && !P().user(), "logout → landing, session cleared (hash=" + W().location.hash + ", user=" + JSON.stringify(P().user()) + ", landing=" + visible("landing-page") + ")");
    await openHash("#/login"); await until(() => visible("login-screen"));
    D().getElementById("login-user").value = "demo_manager"; D().getElementById("login-pass").value = "Demo@1234";
    W().doLogin(); await until(() => W().location.hash === "#/app/dashboard", 10000);
    log(W().location.hash === "#/app/dashboard", "form login with demo_manager / Demo@1234");
    await openHash("#/login"); await sleep(300);
    log(W().location.hash === "#/app/dashboard", "signed-in user visiting #/login is sent to the app");

    /* 8. full sandbox journey: create a mess → manager → add member → member view → persistence */
    const setv = (id, v) => { D().getElementById(id).value = v; };
    W().doLogout(); await until(() => visible("landing-page"));
    await openHash("#/create"); await until(() => visible("create-mess-screen"));
    setv("cm-name", "Smoke Test Mess"); setv("cm-admin-name", "Test Manager"); setv("cm-username", "smoke_mgr"); setv("cm-password", "secret12"); setv("cm-location", "Dhaka");
    W().doCreateMess(); await until(() => W().location.hash === "#/app/dashboard" && D().querySelector("#main-content .stat-card"), 10000);
    log(W().location.hash === "#/app/dashboard" && P().user().role === "manager" && P().user().username === "smoke_mgr", "created mess → signed in as its manager");
    log(/Smoke Test Mess/.test(D().getElementById("app-mess-name").textContent), "new mess has its own branding");
    await W().switchDemoRole(); await sleep(400);
    log(/Add a member first/.test(D().getElementById("toast").textContent), "switch to member view with no members → helpful message");
    await openHash("#/app/members"); await settle();
    W().openAddMemberModal(); await sleep(150);
    setv("mm-name", "Smoke Member"); setv("mm-user", "smoke_member"); setv("mm-pass", "memberpass1"); setv("mm-room", "A1");
    await W().addMember(); await sleep(400);
    const mm = await P().sb().from("members").select("*").eq("username", "smoke_member").maybeSingle();
    log(!!mm.data && mm.data.password.startsWith("pbkdf2:"), "addMember() stores a PBKDF2-hashed member in the new mess");
    await W().switchDemoRole(); await until(() => W().location.hash === "#/app/my-dashboard", 8000);
    log(W().location.hash === "#/app/my-dashboard" && P().user().username === "smoke_member", "switch to member view → #/app/my-dashboard as the new member");
    await settle();
    log(!/Error loading page/.test(D().getElementById("main-content").innerText), "member dashboard of the new mess renders");
    const loaded = new Promise(r => frame.onload = r); W().location.reload(); await loaded; await sleep(1500); hook(); await inject();
    log(W().location.hash === "#/app/my-dashboard" && P().user() && P().user().username === "smoke_member", "page refresh keeps session + created data");
    await W().switchDemoRole(); await until(() => W().location.hash === "#/app/dashboard", 8000);
    log(P().user().role === "manager", "switch back to manager view");
    W().doLogout(); await until(() => visible("landing-page"));
    await openHash("#/login"); await until(() => visible("login-screen"));
    setv("login-user", "smoke_member"); setv("login-pass", "memberpass1"); W().doLogin();
    await until(() => W().location.hash === "#/app/my-dashboard", 10000);
    log(W().location.hash === "#/app/my-dashboard", "sign in as the new member via the login form");
    W().doLogout(); await until(() => visible("landing-page"));
    await openHash("#/create"); await until(() => visible("create-mess-screen"));
    setv("cm-name", "Dup"); setv("cm-admin-name", "Dup"); setv("cm-username", "demo_manager"); setv("cm-password", "secret12");
    await W().doCreateMess(); await sleep(300);
    log(/already taken/.test(D().getElementById("create-error").textContent), "duplicate username rejected: '" + D().getElementById("create-error").textContent + "'");
    await openHash("#/demo/manager"); await until(() => W().location.hash === "#/app/dashboard", 8000);
    await W().resetDemo(); await until(() => /Mirpur/.test(D().getElementById("app-mess-name").textContent), 8000);
    const gone = await P().sb().from("members").select("*").eq("username", "smoke_member").maybeSingle();
    log(!gone.data && /Mirpur/.test(D().getElementById("app-mess-name").textContent), "resetDemo() discards created data and returns to the sample mess");
  } catch (e) {
    log(false, "harness exception: " + (e && e.stack || e));
  }
  out.textContent += "\n" + (fails ? fails + " FAILED" : "ALL PASSED") + "\n";
  document.title = "DONE";
})();
