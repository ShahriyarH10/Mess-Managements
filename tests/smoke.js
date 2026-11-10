/* Browser smoke test: drives the real app in an iframe (same origin) and reports
   PASS/FAIL lines into #out. Open http://localhost:8000/tests/smoke.html in a browser and
   wait ~2 minutes for the summary.
   Don't use Chrome's --virtual-time-budget: it fast-forwards timers while the 100k-round
   PBKDF2 password hashing runs in real time, so the login/sign-up checks time out falsely. */
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
    log(P().env().liveLogin === true && P().env().liveSignup === true, "flags: real login on, real signup on");
    log(P().sb() === null, "no backend client built on landing");

    /* 2. guards */
    await openHash("#/app/dashboard"); await until(() => W().location.hash === "#/login");
    log(W().location.hash === "#/login" && visible("login-screen"), "unauthenticated #/app/dashboard → #/login");
    await openHash("#/admin/messes"); await until(() => W().location.hash === "" || W().location.hash === "#/");
    log(["", "#/"].includes(W().location.hash), "removed #/admin route → landing page");
    await openHash("#/create"); await until(() => visible("create-mess-screen"));
    log(visible("create-mess-screen") && D().getElementById("create-demo-note").style.display === "none" && !D().body.classList.contains("is-demo"), "#/create is the REAL signup (no sandbox note, not demo mode)");
    await openHash("#/demo/create"); await until(() => D().getElementById("create-demo-note").style.display !== "none");
    log(visible("create-mess-screen") && D().body.classList.contains("is-demo"), "#/demo/create is the sandbox signup (note shown, demo mode)");
    await openHash("#/nope/zzz"); await until(() => W().location.hash === "#/");
    log(visible("landing-page"), "unknown route → landing");

    /* 3. manager demo */
    await openHash("#/demo/manager");
    const ok = await until(() => W().location.hash === "#/demo/app/dashboard" && D().querySelector("#main-content .dk-card, #main-content .stat-card"), 10000);
    log(ok, "demo manager lands on #/demo/app/dashboard with stats");
    hook();
    log(P().sb() && P().sb().isDemo === true && P().mode() === "demo", "backend is the in-memory mock");
    log(!/supabase\.co/.test(JSON.stringify(performance.getEntriesByType ? W().performance.getEntriesByType("resource").map(r => r.name) : [])), "no request to supabase.co");
    const ext = W().performance.getEntriesByType("resource").map(r => r.name).filter(n => !n.startsWith(location.origin));
    log(ext.length === 0, "no third-party requests (" + ext.length + ")");
    log(W().document.body.classList.contains("is-demo"), "demo chrome enabled");

    const mgrPages = P().managerNav().filter(i => i.page).map(i => i.page).concat(["transfer"]);
    for (const p of mgrPages) {
      errors.length = 0;
      await openHash("#/demo/app/" + p); await settle();
      const txt = D().getElementById("main-content").innerText;
      const bad = /Error loading page|Page not found/.test(txt) || txt.trim().length < 20;
      log(!bad && errors.length === 0, "manager page " + p + (errors.length ? "  ← " + errors.join(" | ") : bad ? "  ← " + txt.slice(0, 120) : ""));
      scanHandlers();
    }

    /* 4. interactions */
    await openHash("#/demo/app/meals"); await settle();
    D().querySelector('.nav-item[data-page="bazar"]').click();
    await until(() => W().location.hash === "#/demo/app/bazar");
    log(W().location.hash === "#/demo/app/bazar", "sidebar click (delegated handler) changes route");
    await settle();
    W().history.back(); await until(() => W().location.hash === "#/demo/app/meals");
    log(W().location.hash === "#/demo/app/meals", "browser back returns to previous page");

    await openHash("#/demo/app/meals"); await settle();
    const dayInput = D().querySelector(".meal-num-input"); 
    errors.length = 0;
    const firstM = P().members()[0], mdv = P().mealDayVals();
    const dayBefore = mdv[firstM.id] || 0; mdv[firstM.id] = dayBefore + 1;   // a real change, so it's audited
    await W().saveMeals(); await sleep(300);
    log(/saved/i.test(D().getElementById("toast").textContent), "saveMeals() works against mock: toast '" + D().getElementById("toast").textContent + "'");
    const rows = await P().sb().from("audit_log").select("*", { count: "exact", head: true });
    const mealA = ((await P().sb().from("audit_log").select("*").eq("entity", "meal")).data || [])
      .find(e => e.summary.includes(`${firstM.name} ${dayBefore}+`) && e.summary.includes(`→ ${dayBefore + 1}+`));
    log(rows.count >= 9 && !!mealA, "audit log got a new row with old → new (count " + rows.count + ": \"" + (mealA?.summary || "none") + "\")");
    const n1 = (await P().sb().from("audit_log").select("*", { count: "exact", head: true })).count;
    await W().saveMeals(); await sleep(300);
    log((await P().sb().from("audit_log").select("*", { count: "exact", head: true })).count === n1, "saving again with nothing changed adds no audit noise");

    D().querySelector('[data-on-click="toggleTheme()"]').click();
    log(["light", "dark"].includes(D().documentElement.getAttribute("data-theme")), "toggleTheme handler runs");


    /* 4b. interactions through the delegated handlers (no inline-script execution needed) */
    const click = (sel) => { const el = D().querySelector(sel); if (!el) throw new Error("missing " + sel); el.click(); };
    errors.length = 0;
    await openHash("#/demo/app/members"); await settle();
    click('[data-on-click="openAddMemberModal()"]'); await sleep(150);
    log(D().getElementById("modal-bg").classList.contains("open"), "Add-member modal opens via onclick attribute");
    click('#modal-bg [data-on-click="closeModal()"]'); await sleep(100);
    log(!D().getElementById("modal-bg").classList.contains("open"), "closeModal() via onclick attribute");
    D().getElementById("modal-bg").classList.add("open");
    D().getElementById("modal-bg").dispatchEvent(new (W().MouseEvent)("click", { bubbles: true }));
    await sleep(100);
    log(!D().querySelector("[onclick],[onchange],[oninput]"), "no native on* attributes remain in the DOM (all moved to data-on-*)");
    log(!D().getElementById("modal-bg").classList.contains("open"), "backdrop click closes modal (if(event.target===this) form)");

    await openHash("#/demo/app/utility"); await settle();
    click('[data-on-click="saveUtilityGroup(\'prepaid\')"]'); await sleep(400);
    log(/saved/i.test(D().getElementById("toast").textContent), "saveUtilityGroup('prepaid') → '" + D().getElementById("toast").textContent + "'");
    await openHash("#/demo/app/rent"); await settle();
    click('[data-on-click="saveRent()"]'); await sleep(400);
    log(/saved/i.test(D().getElementById("toast").textContent), "saveRent() → '" + D().getElementById("toast").textContent + "'");

    // Room Rent / Utility are for correcting totals: raising "paid" there must not create receipts
    {
      const rcpts = async () => ((await P().sb().from("member_payments").select("*").eq("mess_id", P().messId())).data || []).length;
      const n0 = await rcpts(), mid = P().members()[0].id;
      const rp = D().getElementById("rp-" + mid); rp.value = String(Number(rp.value || 0) + 500);
      await W().saveRent(); await sleep(300);
      await openHash("#/demo/app/utility"); await settle();
      const up = D().getElementById("up-" + mid);
      if (up) { up.value = String(Number(up.value || 0) + 300); await W().saveUtilityPayments(); await sleep(300); }
      log(!!up && (await rcpts()) === n0, `raising paid on Room Rent / Utility creates no receipt (${n0} → ${await rcpts()}, utility field ${!!up})`);
      const aud = ((await P().sb().from("audit_log").select("*").eq("mess_id", P().messId())).data || []);
      const rentA = aud.find(e => e.entity === "rent" && /^Room Rent .*: .* paid ৳[\d.]+ → ৳[\d.]+/.test(e.summary));
      const utilA = aud.find(e => e.entity === "utility" && /^Utility payments .*: .* paid ৳[\d.]+ → ৳[\d.]+/.test(e.summary));
      log(!!rentA && !!utilA, `…but both saves are in the audit log with old → new ("${rentA?.summary}" / "${utilA?.summary}")`);
    }
    await openHash("#/demo/app/messages"); await settle();
    D().getElementById("bc-msg").value = "Smoke test notice";
    click('[data-on-click="sendBroadcast()"]'); await sleep(500);
    const an = await P().sb().from("broadcasts").select("*");
    log(an.data.some(a => a.message === "Smoke test notice"), "sendBroadcast() inserts into the mock store");
    log(/Smoke test notice/.test(D().getElementById("msg-broadcasts-wrap").innerText), "new notice appears in the Messages list");
    await openHash("#/demo/app/notifications"); await settle();
    const nb = D().querySelector('[data-on-click^="markNotificationSeen"]');
    if (nb) { nb.click(); await sleep(400); }
    log(!!nb, "notification 'seen' button present and clickable");
    log(errors.length === 0, "no console errors / CSP violations during interactions" + (errors.length ? " ← " + errors.join(" | ") : ""));

    /* demo reset restores the seed */
    await W().resetDemo(); await settle();
    const an2 = await P().sb().from("broadcasts").select("*");
    log(!an2.data.some(a => a.message === "Smoke test notice"), "resetDemo() restores seed data");

    /* settlement numbers sanity */
    await openHash("#/demo/app/dashboard"); await settle();
    const dash = D().getElementById("main-content").innerText;
    log(/৳\s?\d/.test(dash), "dashboard shows taka amounts");

    /* 5. member demo + role guard */
    await openHash("#/demo/member");
    await until(() => W().location.hash === "#/demo/app/my-dashboard" && D().querySelector("#main-content .stat-card, #main-content .card"), 10000);
    log(W().location.hash === "#/demo/app/my-dashboard", "demo member lands on #/demo/app/my-dashboard");
    await openHash("#/demo/app/members"); await until(() => W().location.hash === "#/demo/app/my-dashboard");
    log(W().location.hash === "#/demo/app/my-dashboard", "member opening manager-only route is redirected");
    await openHash("#/demo/app/dashboard"); await until(() => W().location.hash === "#/demo/app/my-dashboard");
    log(W().location.hash === "#/demo/app/my-dashboard", "member opening #/demo/app/dashboard is redirected");
    const memPages = P().memberNav().filter(i => i.page).map(i => i.page).concat(["mess-overview"]);
    for (const p of memPages) {
      errors.length = 0;
      await openHash("#/demo/app/" + p); await settle();
      const txt = D().getElementById("main-content").innerText;
      const bad = /Error loading page|Page not found/.test(txt) || txt.trim().length < 20;
      log(!bad && errors.length === 0, "member page " + p + (errors.length ? "  ← " + errors.join(" | ") : bad ? "  ← " + txt.slice(0, 120) : ""));
      scanHandlers();
    }

    /* 5b. Give Payment: member files a request → manager confirms it → money is applied */
    errors.length = 0;
    const gpMember = P().user().memberId;
    await openHash("#/demo/app/give-payment"); await settle();
    const gpAmt = D().getElementById("gp-amount");
    log(!!gpAmt, "give-payment page shows the amount field for a member who owes");
    if (gpAmt) {
      gpAmt.value = "100"; gpAmt.dispatchEvent(new (W().Event)("input", { bubbles: true }));
      log(D().getElementById("gp-chips").children.length > 0, "typing an amount previews the split chips");
      await W().submitGivePayment(); await sleep(500);
      const pays = await P().sb().from("member_payments").select("*").eq("member_id", gpMember);
      const mine = pays.data || [];
      log(mine.length === 1 && mine[0].status === "pending" && Number(mine[0].amount) === 100 && mine[0].receipt_no === 1,
        "submitGivePayment() files a pending request with a receipt number (" + JSON.stringify(mine.map(p => [p.status, p.amount, p.receipt_no])) + ")");
      const nt = await P().sb().from("notifications").select("*").eq("type", "payment_request");
      log((nt.data || []).length === 1 && nt.data[0].data.paymentId === mine[0]?.id, "manager gets a payment_request notification");
      log(/Receipt/.test(D().getElementById("gp-history").innerText) && /Pending/.test(D().getElementById("gp-history").innerText),
        "request appears in 'My payments' as Pending");
      const rentBefore = JSON.stringify((await P().sb().from("rent").select("*")).data);
      const utilBefore = JSON.stringify((await P().sb().from("utility_payments").select("*")).data);
      log(JSON.stringify((await P().sb().from("rent").select("*")).data) === rentBefore, "request alone changes no rent/utility data");

      await openHash("#/demo/manager"); 
      await until(() => W().location.hash === "#/demo/app/dashboard" && D().querySelector("#main-content .dk-card, #main-content .stat-card"), 10000);
      await openHash("#/demo/app/collect"); await settle();
      const wrapTxt = D().getElementById("cp-pending-wrap")?.innerText || "";
      log(/Member payments to confirm/.test(wrapTxt) && /Confirm received/.test(wrapTxt), "manager Collect page lists the pending request");
      await W().confirmPaymentRequest(mine[0].id); await sleep(800);
      const done = (await P().sb().from("member_payments").select("*").eq("id", mine[0].id).maybeSingle()).data;
      const sp = done?.split || {};
      const spTotal = ["allocPrevDue", "allocRent", "allocUtil", "allocMeal", "change"].reduce((a, k) => a + Number(sp[k] || 0), 0);
      log(done?.status === "confirmed" && Math.abs(spTotal - 100) < 0.01 && done.still_due != null && !!done.confirmed_by,
        "confirmPaymentRequest() stamps it confirmed with a split that adds up to the amount (" + JSON.stringify(sp) + ", still_due " + done?.still_due + ")");
      const utilAfter = JSON.stringify((await P().sb().from("utility_payments").select("*")).data);
      const rentAfter = JSON.stringify((await P().sb().from("rent").select("*")).data);
      log(sp.allocRent > 0 || sp.allocUtil > 0 || sp.allocMeal > 0 || sp.allocPrevDue > 0 ? (utilAfter !== utilBefore || rentAfter !== rentBefore) : true,
        "confirming writes the allocation into rent / utility_payments");
      log(D().getElementById("modal-bg").classList.contains("open") && /PAYMENT RECEIPT/.test(D().getElementById("modal-content").innerText),
        "confirmed receipt modal opens");
      W().closeModal();
      log(!(D().getElementById("cp-pending-wrap")?.innerText || "").trim(), "confirmed request leaves the pending list");
      const nc = await P().sb().from("notifications").select("*").eq("type", "payment_confirmed");
      log((nc.data || []).length === 1 && nc.data[0].data.to_member_id === gpMember, "member gets a payment_confirmed notification");
      const again = await W().dbClaimMemberPayment(mine[0].id, "confirmed", "x");
      log(again === null, "a confirmed payment cannot be claimed (applied) twice");
      scanHandlers();
    }
    log(errors.length === 0, "no console errors during the Give Payment flow" + (errors.length ? " ← " + errors.join(" | ") : ""));

    /* 6. every inline-handler function name resolves to a real global function */
    const missing = [...handlerNames].filter(n => !["if", "event", "this"].includes(n) && typeof W()[n] !== "function");
    log(missing.length === 0, "all inline-handler functions exist (" + handlerNames.size + " checked)" + (missing.length ? " missing: " + missing.join(", ") : ""));

    /* 6b. an overpayment saved twice at once (double tap on a slow connection) is recorded once */
    {
      await openHash("#/demo/manager"); await until(() => W().location.hash === "#/demo/app/dashboard", 8000);
      await openHash("#/demo/app/collect"); await settle();
      const sid = P().members().find(m => m.username === "demo_nayeem").id;
      const count = async () => ((await P().sb().from("member_payments").select("*").eq("member_id", sid)).data || []).length;
      const before = await count();
      // pay 300 more than every open bucket adds up to, so there is change to record
      const pr = P().collectCtx().perMember[sid];
      const open = Math.max(0, pr.mealCost - pr.memberBazar - pr.mealPaid) + Math.max(0, pr.utilDue - pr.utilPaid) + Math.max(0, pr.rentDue - pr.rentPaid) + (pr.prevDue || 0);
      const amt = Math.ceil(open) + 300, expectChange = Math.round((amt - open) * 100) / 100;
      D().getElementById("cp-amt-" + sid).value = String(amt);
      await Promise.all([W().saveCollectRow(sid), W().saveCollectRow(sid)]);
      await sleep(300); W().closeModal();
      const util = (await P().sb().from("utility_payments").select("*").eq("mess_id", P().messId()).eq("month_key", P().collectCtx().key).maybeSingle()).data;
      const change = Number((util?.bills?.pending_change || {})["Nayeem Khan"] || 0);
      log(await count() === before + 1 && Math.abs(change - expectChange) < 0.02,
        `double-tapped Collect Save records the overpayment once (receipts +${(await count()) - before}, change ${change} of ${expectChange})`);
      log(!/<svg|class="ic/.test(D().getElementById("toast").textContent), "Collect save toast shows plain text, not markup");

      /* 6c. a duplicate saved before the guard existed: Remove duplicate fixes receipts and the doubled change */
      const iid = P().members().find(m => m.username === "demo_imran").id;
      const pi = P().collectCtx().perMember[iid];
      const openI = Math.max(0, pi.mealCost - pi.memberBazar - pi.mealPaid) + Math.max(0, pi.utilDue - pi.utilPaid) + Math.max(0, pi.rentDue - pi.rentPaid) + (pi.prevDue || 0);
      const amtI = Math.ceil(openI) + 200, changeI = Math.round((amtI - openI) * 100) / 100;
      D().getElementById("cp-amt-" + iid).value = String(amtI);
      await Promise.all([W()._saveCollectRow(iid), W()._saveCollectRow(iid)]);   // the old, unguarded double save
      await sleep(300); W().closeModal(); await W().loadCollectMonth(); await sleep(200);
      const pendI = async () => Number(((await P().sb().from("utility_payments").select("*").eq("mess_id", P().messId()).eq("month_key", P().collectCtx().key).maybeSingle()).data?.bills?.pending_change || {})["Imran Hossain"] || 0);
      const doubled = await pendI();
      log(/Duplicate receipts \(1\)/i.test(D().getElementById("cp-dupes").innerText) && Math.abs(doubled - 2 * changeI) < 0.02,
        `Collect flags the old double save as a duplicate (change stored ${doubled}, should be ${changeI})`);
      const dupBtn = D().querySelector('#cp-dupes [data-on-click^="removeDuplicateReceipt"]');
      dupBtn.click(); await until(() => D().getElementById("confirm-ok-btn"), 4000); await sleep(200);
      D().getElementById("confirm-ok-btn").click();
      await until(() => !D().getElementById("cp-dupes").innerText.trim(), 6000);
      const rowsI = ((await P().sb().from("member_payments").select("*").eq("member_id", iid)).data || []);
      const counted = rowsI.filter(p => p.status === "confirmed").length, dupMarked = rowsI.filter(p => p.status !== "confirmed" && p.split?.duplicate_of).length;
      log(counted === 1 && dupMarked === 1 && Math.abs((await pendI()) - changeI) < 0.02,
        `Remove duplicate: 1 counted + 1 marked duplicate, change back to ${changeI} (now ${await pendI()})`);
    }

    /* 6d. Return Amount: a collection that leaves a "Negative balance owed" can be reversed
           (earlier partial payments survive); Save records partial cash without carrying;
           Carry fwd moves the rest to next month. */
    {
      const ctx = () => P().collectCtx();
      const fid = P().members().find(m => m.username === "demo_mahfuz").id, FN = "Mahfuz Alam";
      const util = async (key) => (await P().sb().from("utility_payments").select("*").eq("mess_id", P().messId()).eq("month_key", key).maybeSingle()).data;
      const rentPaid = async () => Number(((await P().sb().from("rent").select("*").eq("mess_id", P().messId()).eq("month_key", ctx().key).maybeSingle()).data?.entries || [])
        .find(e => e.member_id === fid || e.name === FN)?.paid || 0);
      const snap = async () => { const u = await util(ctx().key); const p = (u?.payments || {})[FN] || {}; return { rent: await rentPaid(), util: Number(p.paid || 0), meal: Number(p.meal_paid || 0), pd: Number(p.prev_due_paid || 0) }; };
      const near = (a, b) => Math.abs(a - b) < 0.02;
      const collect = async (amt) => { D().getElementById("cp-amt-" + fid).value = String(amt); await W().saveCollectRow(fid); await sleep(200); W().closeModal(); };

      // give Mahfuz a ৳500 meal surplus, so paying every open bucket leaves the mess owing ৳500
      let r = ctx().perMember[fid];
      const mealRem = r.mealCost - r.memberBazar - r.mealPaid;
      const u0 = await util(ctx().key); const pays = { ...(u0?.payments || {}) };
      pays[FN] = { ...(pays[FN] || {}), meal_paid: Math.round((Number(pays[FN]?.meal_paid || 0) + mealRem + 500) * 100) / 100 };
      await W().dbUpsertUtility(ctx().month, ctx().year, ctx().key, u0?.bills || {}, pays);
      await W().loadCollectMonth(); await sleep(150);

      await collect(100);                                   // an earlier partial payment
      const partial = await snap();
      r = ctx().perMember[fid];
      const open = Math.max(0, r.utilDue - r.utilPaid) + Math.max(0, r.rentDue - r.rentPaid) + (r.prevDue || 0);
      await collect(Math.round(open * 100) / 100);           // fills rent + utility → ৳500 negative, no change
      r = ctx().perMember[fid];
      const amts = W().returnAmountsFor(r);
      const xBtn = () => D().querySelector(`#retr-${fid} .cp-mcard-x`);
      log(near(amts.owesRemaining, 500) && amts.changeRemaining < 0.01 && !!xBtn(),
        `negative-balance card shows ✕ (owes ${amts.owesRemaining}, change ${amts.changeRemaining}, ✕ ${!!xBtn()})`);
      xBtn().click(); await until(() => D().getElementById("confirm-ok-btn"), 4000); await sleep(150);
      D().getElementById("confirm-ok-btn").click();
      await until(() => !D().getElementById("retr-" + fid), 6000); await sleep(200);
      const afterRev = await snap();
      log(near(afterRev.rent, partial.rent) && near(afterRev.util, partial.util) && near(afterRev.pd, partial.pd) && !D().getElementById("retr-" + fid),
        `reversing it restores the earlier partial payment exactly (rent ${afterRev.rent}/${partial.rent}, util ${afterRev.util}/${partial.util}, prev ${afterRev.pd}/${partial.pd})`);

      // recreate the ৳500 negative, then return only ৳200 with Save
      await collect(Math.round(open * 100) / 100);
      D().getElementById("ret-amt-" + fid).value = "200";
      await W().saveReturnRow(fid); await sleep(200); W().closeModal();
      r = ctx().perMember[fid];
      const nk = ctx().nextMonth.key;
      const carried = Number(((await util(nk))?.bills?.mess_credit || {})[FN] || 0);
      log(near(W().returnAmountsFor(r).owesRemaining, 300) && carried < 0.01 && !!D().getElementById("retr-" + fid) && !xBtn(),
        `Save with ৳200 of ৳500 keeps ৳300 to return and carries nothing (left ${W().returnAmountsFor(r).owesRemaining}, carried ${carried}, ✕ hidden ${!xBtn()})`);

      D().getElementById("ret-amt-" + fid).value = "";
      await W().saveReturnRow(fid); await sleep(150);
      log(near(W().returnAmountsFor(ctx().perMember[fid]).owesRemaining, 300), "Save with no amount changes nothing");

      await W().carryReturnRow(fid); await sleep(200); W().closeModal();
      const carried2 = Number(((await util(nk))?.bills?.mess_credit || {})[FN] || 0);
      log(near(carried2, 300) && !D().getElementById("retr-" + fid), `Carry fwd moves the ৳300 left to next month (carried ${carried2})`);

      // overpaid change from 6b (Nayeem): a partial Save only reduces pending change
      const sid = P().members().find(m => m.username === "demo_nayeem").id;
      const pend = async () => Number(((await util(ctx().key))?.bills?.pending_change || {})["Nayeem Khan"] || 0);
      const chg0 = await pend(), cc0 = Number(((await util(nk))?.bills?.change_credit || {})["Nayeem Khan"] || 0);
      D().getElementById("ret-amt-" + sid).value = "100";
      await W().saveReturnRow(sid); await sleep(200); W().closeModal();
      const cc1 = Number(((await util(nk))?.bills?.change_credit || {})["Nayeem Khan"] || 0);
      log(chg0 > 100 && near(await pend(), chg0 - 100) && near(cc1, cc0),
        `partial change return keeps the rest pending (pending ${chg0} → ${await pend()}, change credit ${cc0} → ${cc1})`);
    }
    log(errors.length === 0, "no console errors during the Return Amount flow" + (errors.length ? " ← " + errors.join(" | ") : ""));

    /* 6e. Receipts this month: reverse a wrongly entered payment — any order, exact undo */
    {
      const ctx = () => P().collectCtx();
      const rid = P().members().find(m => m.username === "demo_rakib").id, RN = "Rakib Hasan";
      const util = async () => (await P().sb().from("utility_payments").select("*").eq("mess_id", P().messId()).eq("month_key", ctx().key).maybeSingle()).data;
      const snap = async () => {
        const p = ((await util())?.payments || {})[RN] || {};
        const rent = ((await P().sb().from("rent").select("*").eq("mess_id", P().messId()).eq("month_key", ctx().key).maybeSingle()).data?.entries || [])
          .find(e => e.member_id === rid || e.name === RN);
        return JSON.stringify([Number(rent?.paid || 0), Number(p.paid || 0), Number(p.meal_paid || 0), Number(p.prev_due_paid || 0)]);
      };
      const collect = async (amt) => { D().getElementById("cp-amt-" + rid).value = String(amt); await W().saveCollectRow(rid); await sleep(200); W().closeModal(); };
      const mine = () => (ctx().receipts || []).filter(p => p.member_id === rid && p.status === "confirmed")
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const btn = (id, on) => D().querySelector(`#cp-receipts [data-on-click="reverseReceipt('${id}')"]`) && on;
      const confirmOk = async () => { await until(() => D().getElementById("confirm-ok-btn"), 4000); await sleep(150); D().getElementById("confirm-ok-btn").click(); };

      const s0 = await snap();
      await collect(100); const s1 = await snap();
      await sleep(20); await collect(250); const s2 = await snap();
      const [r2, r1] = mine();
      const sum = (j) => JSON.parse(j).reduce((a, b) => a + b, 0);
      log(!!D().getElementById("cp-receipts-card") && !!btn(r2.id, true) && !!btn(r1.id, true),
        "Receipts this month lists both, and either can be reversed");

      // a wrong OLDER payment can be undone even though a newer one exists
      W().reverseReceipt(r1.id); await confirmOk(); await sleep(600);
      log(Math.abs(sum(await snap()) - (sum(s2) - 100)) < 0.02 && mine().length === 1 && mine()[0].id === r2.id,
        `reversing the older payment takes back only its ৳100 (${await snap()} from ${s2})`);

      // a total lowered by hand below what the receipt added blocks it, with the reason shown
      const sp2 = r2.split, field = sp2.allocUtil > 0 ? "util" : "rent";
      const u1 = await util(); const pays = JSON.parse(JSON.stringify(u1?.payments || {}));
      const rentRow = (await P().sb().from("rent").select("*").eq("mess_id", P().messId()).eq("month_key", ctx().key).maybeSingle()).data;
      const entries = JSON.parse(JSON.stringify(rentRow?.entries || []));
      const ent = entries.find(e => e.member_id === rid || e.name === RN);
      const orig = field === "util" ? pays[RN].paid : ent.paid;
      const lowerTo = (v) => field === "util"
        ? W().dbUpsertUtility(ctx().month, ctx().year, ctx().key, u1?.bills || {}, { ...pays, [RN]: { ...pays[RN], paid: v } })
        : W().dbUpsertRent(ctx().month, ctx().year, ctx().key, entries.map(e => e === ent ? { ...e, paid: v } : e));
      await lowerTo(Math.max(0, (field === "util" ? sp2.allocUtil : sp2.allocRent) - 50));
      await W().loadCollectMonth(); await sleep(200);
      const why = W()._reverseCheck(ctx().receipts.find(p => p.id === r2.id), ctx().receipts, ctx().perMember[rid]).reason;
      log(!btn(r2.id, true) && /lowered by hand/i.test(why) && D().getElementById("cp-receipts").textContent.includes(why.slice(0, 40)), "a receipt whose total was lowered by hand is blocked, reason shown on it (" + why.trim().slice(0, 80) + "…)");
      await lowerTo(orig); await W().loadCollectMonth(); await sleep(200);

      W().reverseReceipt(r2.id); await confirmOk(); await sleep(600);
      const st = ((await P().sb().from("member_payments").select("*").eq("member_id", rid)).data || []).map(p => p.status);
      log((await snap()) === s0 && st.length === 2 && st.every(x => x === "reversed"),
        `reversing the rest restores the original totals; both kept as Reversed (${st.join(",")})`);

      // 6d left Mahfuz's last payment with its negative balance partly returned + carried → not reversible
      const fid = P().members().find(m => m.username === "demo_mahfuz").id;
      const fl = (ctx().receipts || []).filter(p => p.member_id === fid && p.status === "confirmed")
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const chk = W()._reverseCheck(fl[0], ctx().receipts, ctx().perMember[fid]);
      log(!chk.ok && /handed back or carried/i.test(chk.reason), "a payment whose excess was already returned / carried cannot be reversed (" + chk.reason + ")");
    }
    log(errors.length === 0, "no console errors during the Receipts flow" + (errors.length ? " ← " + errors.join(" | ") : ""));

    /* 6f. the audit log now records the money actions above, with old → new values */
    {
      const all = ((await P().sb().from("audit_log").select("*").eq("mess_id", P().messId())).data || []);
      const has = (entity, re) => all.some(e => e.entity === entity && re.test(e.summary));
      const checks = [
        ["collect",  /^Collected ৳[\d.]+ from Rakib Hasan/, "Collect Payment save"],
        ["collect",  /^Return Amount for Mahfuz Alam: returned ৳200 cash/, "Return Amount Save"],
        ["collect",  /^Return Amount for Mahfuz Alam: carried ৳300 to /, "Return Amount Carry fwd"],
        ["collect",  /^Reversed payment ৳[\d.]+ from Rakib Hasan · receipt #/, "receipt reversal"],
        ["collect",  /sent a payment request of ৳100/, "member's Give Payment request"],
      ];
      const miss = checks.filter(([e, re]) => !has(e, re)).map(c => c[2]);
      log(!miss.length, "audit log records: " + checks.map(c => c[2]).join(", ") + (miss.length ? " ← MISSING: " + miss.join(", ") : ""));
      log(!all.some(e => /&amp;|&lt;|&#39;/.test(e.summary || "")), "audit summaries hold plain names (no HTML entities)");
    }

    /* 7. login form works against demo accounts, reset + logout */
    W().doLogout(); await until(() => visible("landing-page"));
    log(visible("landing-page") && !P().user(), "logout → landing, session cleared (hash=" + W().location.hash + ", user=" + JSON.stringify(P().user()) + ", landing=" + visible("landing-page") + ")");
    await openHash("#/demo/login"); await until(() => visible("login-screen"));
    D().getElementById("login-user").value = "demo_manager"; D().getElementById("login-pass").value = "Demo@1234";
    W().doLogin(); await until(() => W().location.hash === "#/demo/app/dashboard", 10000);
    log(W().location.hash === "#/demo/app/dashboard", "form login with demo_manager / Demo@1234");
    await openHash("#/demo/login"); await sleep(300);
    log(W().location.hash === "#/demo/app/dashboard", "signed-in sandbox user visiting #/demo/login is sent to the app");

    /* 8. full sandbox journey: create a mess → manager → add member → member view → persistence */
    const setv = (id, v) => { D().getElementById(id).value = v; };
    W().doLogout(); await until(() => visible("landing-page"));
    await openHash("#/demo/create"); await until(() => visible("create-mess-screen"));
    setv("cm-name", "Smoke Test Mess"); setv("cm-admin-name", "Test Manager"); setv("cm-username", "smoke_mgr"); setv("cm-password", "secret12"); setv("cm-location", "Dhaka");
    W().doCreateMess(); await until(() => W().location.hash === "#/demo/app/dashboard" && D().querySelector("#main-content .dk-card, #main-content .stat-card"), 10000);
    log(W().location.hash === "#/demo/app/dashboard" && P().user().role === "manager" && P().user().username === "smoke_mgr", "created mess → signed in as its manager");
    log(/Smoke Test Mess/.test(D().getElementById("app-mess-name").textContent), "new mess has its own branding");
    await W().switchDemoRole(); await sleep(400);
    log(/Add a member first/.test(D().getElementById("toast").textContent), "switch to member view with no members → helpful message");
    await openHash("#/demo/app/members"); await settle();
    W().openAddMemberModal(); await sleep(150);
    setv("mm-name", "Smoke Member"); setv("mm-user", "smoke_member"); setv("mm-pass", "memberpass1"); setv("mm-room", "A1");
    await W().addMember(); await sleep(400);
    const mm = await P().sb().from("members").select("*").eq("username", "smoke_member").maybeSingle();
    log(!!mm.data && mm.data.password.startsWith("pbkdf2:"), "addMember() stores a PBKDF2-hashed member in the new mess");
    await W().switchDemoRole(); await until(() => W().location.hash === "#/demo/app/my-dashboard", 8000);
    log(W().location.hash === "#/demo/app/my-dashboard" && P().user().username === "smoke_member", "switch to member view → #/demo/app/my-dashboard as the new member");
    await settle();
    log(!/Error loading page/.test(D().getElementById("main-content").innerText), "member dashboard of the new mess renders");
    const loaded = new Promise(r => frame.onload = r); W().location.reload(); await loaded; await sleep(1500); hook(); await inject();
    log(W().location.hash === "#/demo/app/my-dashboard" && P().user() && P().user().username === "smoke_member", "page refresh keeps session + created data");
    await W().switchDemoRole(); await until(() => W().location.hash === "#/demo/app/dashboard", 8000);
    log(P().user().role === "manager", "switch back to manager view");
    W().doLogout(); await until(() => visible("landing-page"));
    await openHash("#/demo/login"); await until(() => visible("login-screen"));
    setv("login-user", "smoke_member"); setv("login-pass", "memberpass1"); W().doLogin();
    await until(() => W().location.hash === "#/demo/app/my-dashboard", 10000);
    log(W().location.hash === "#/demo/app/my-dashboard", "sign in as the new member via the login form");

    /* 8b. records are stored by member id; removing a member archives them and keeps every record */
    const loginAs = async (u, p, hash) => {
      W().doLogout(); await until(() => visible("landing-page"));
      await openHash("#/demo/login"); await until(() => visible("login-screen"));
      setv("login-user", u); setv("login-pass", p); W().doLogin();
      if (hash) { await until(() => W().location.hash === hash, 10000); await settle(); }
    };
    const smId = mm.data.id, smMess = mm.data.mess_id, raw = () => P().memberKeys().raw(P().sb());
    await loginAs("smoke_mgr", "secret12", "#/demo/app/dashboard");
    await openHash("#/demo/app/meals"); await settle();
    await W().saveMeals(); await sleep(400);
    const stored = (await raw().from("meals").select("*").eq("mess_id", smMess)).data || [];
    log(stored.some(r => (smId + "_day") in r.meals) && !stored.some(r => "Smoke Member_day" in r.meals),
      "saveMeals() stores the member's meals under their member id: " + JSON.stringify(stored.map(r => r.meals)));
    const viaApp = (await P().sb().from("meals").select("*").eq("mess_id", smMess)).data || [];
    log(viaApp.some(r => "Smoke Member_day" in r.meals), "…and the app reads them back by name");

    await openHash("#/demo/app/members"); await settle();
    await W().openLeavingFlow(smId); await sleep(200);
    log(/records kept/i.test(D().getElementById("modal-content").innerText), "leaving flow explains records are kept");
    W().archiveMember(smId); await sleep(150);
    D().getElementById("confirm-ok-btn").click();
    await until(() => P().formerMembers().some(m => m.id === smId), 5000); await sleep(200);
    const archived = await raw().from("members").select("*").eq("id", smId).maybeSingle();
    log(!!archived.data && !!archived.data.left_at, "removing a member archives them (row kept, left_at set)");
    log(!P().members().some(m => m.id === smId) && /former members/i.test(D().getElementById("main-content").innerText),
      "archived member leaves the list and appears under Former members");
    const kept = (await raw().from("meals").select("*").eq("mess_id", smMess)).data || [];
    log(kept.some(r => (smId + "_day") in r.meals), "archived member's meals are kept");
    // the manager re-saving that day (form lists current members only) must not erase them
    await openHash("#/demo/app/meals"); await settle();
    await W().saveMeals(); await sleep(400);
    const resaved = (await raw().from("meals").select("*").eq("mess_id", smMess)).data || [];
    log(resaved.some(r => (smId + "_day") in r.meals), "manager re-saving the day keeps the archived member's meals: " + JSON.stringify(resaved.map(r => r.meals)));
    await openHash("#/demo/app/members"); await settle();
    log(((await P().sb().from("meals").select("*").eq("mess_id", smMess)).data || []).some(r => "Smoke Member_day" in r.meals),
      "…and still read under their name");
    W().openAddMemberModal(); await sleep(150);
    setv("mm-name", "Smoke Member"); setv("mm-user", "smoke_member"); setv("mm-pass", "memberpass1");
    await W().addMember(); await sleep(300);
    log(/former member/i.test(D().getElementById("toast").textContent), "re-adding a former member points to Restore: '" + D().getElementById("toast").textContent + "'");
    W().closeModal();

    await loginAs("smoke_member", "memberpass1");
    await until(() => /removed from the mess/.test(D().getElementById("login-error").textContent), 10000);
    log(/removed from the mess/.test(D().getElementById("login-error").textContent) && !P().user(), "an archived member can't sign in");

    await loginAs("smoke_mgr", "secret12", "#/demo/app/dashboard");
    await openHash("#/demo/app/members"); await settle();
    W().restoreMember(smId); await sleep(150);
    D().getElementById("confirm-ok-btn").click();
    await until(() => P().members().some(m => m.id === smId), 5000);
    log(P().members().some(m => m.id === smId) && !P().formerMembers().length, "restoring brings the member back");
    await loginAs("smoke_member", "memberpass1", "#/demo/app/my-dashboard");
    log(W().location.hash === "#/demo/app/my-dashboard", "a restored member can sign in again");
    W().doLogout(); await until(() => visible("landing-page"));
    await openHash("#/demo/create"); await until(() => visible("create-mess-screen"));
    setv("cm-name", "Dup"); setv("cm-admin-name", "Dup"); setv("cm-username", "demo_manager"); setv("cm-password", "secret12");
    await W().doCreateMess(); await sleep(300);
    log(/already taken/.test(D().getElementById("create-error").textContent), "duplicate username rejected: '" + D().getElementById("create-error").textContent + "'");

    /* 9. worlds are isolated: sandbox sign-out leaves a real-world session alone; URLs don't cross */
    await openHash("#/demo/manager"); await until(() => W().location.hash === "#/demo/app/dashboard", 8000);
    W().localStorage.setItem("mm_session", JSON.stringify({ u: { name: "Real", username: "real", role: "manager", memberId: "x" }, m: { id: "m" }, jwt: null, exp: Date.now() + 1e9 }));
    W().doLogout(); await until(() => visible("landing-page"));
    log(!!W().localStorage.getItem("mm_session"), "sandbox sign-out does not touch the real-world session (localStorage)");
    W().localStorage.removeItem("mm_session");
    await openHash("#/demo/manager"); await until(() => W().location.hash === "#/demo/app/dashboard", 8000);
    await openHash("#/app/dashboard"); await until(() => W().location.hash === "#/login");
    log(W().location.hash === "#/login", "a sandbox session does not open the REAL app (#/app/… → #/login)");
    await openHash("#/demo/app/meals"); await until(() => W().location.hash === "#/demo/app/meals" && D().querySelector("#main-content .card"), 8000);
    log(W().location.hash === "#/demo/app/meals" && visible("app-shell"), "…while the sandbox session still opens #/demo/app/…");
    W().doLogout(); await until(() => visible("landing-page"));
    await openHash("#/demo/app/meals"); await until(() => W().location.hash === "#/demo/app/meals" && D().querySelector("#main-content .card"), 10000);
    log(W().location.hash === "#/demo/app/meals" && !!P().user(), "signed-out #/demo/app/meals deep link → starts the sample demo and opens that page");
    await openHash("#/demo"); await until(() => W().location.hash === "#/demo/app/dashboard", 8000);
    log(W().location.hash === "#/demo/app/dashboard", "#/demo is a single entry point (no role picker)");
    log(!D().querySelector('a[href="#/demo/member"]') && !/view as a member/i.test(D().getElementById("landing-page").innerText), "no 'member demo' button anywhere in the UI");
    await openHash("#/demo/manager"); await until(() => W().location.hash === "#/demo/app/dashboard", 8000);
    await W().resetDemo(); await until(() => /Mirpur/.test(D().getElementById("app-mess-name").textContent), 8000);
    const gone = await P().sb().from("members").select("*").eq("username", "smoke_member").maybeSingle();
    log(!gone.data && /Mirpur/.test(D().getElementById("app-mess-name").textContent), "resetDemo() discards created data and returns to the sample mess");
  } catch (e) {
    log(false, "harness exception: " + (e && e.stack || e));
  }
  out.textContent += "\n" + (fails ? fails + " FAILED" : "ALL PASSED") + "\n";
  document.title = "DONE";
})();
