/* ═══════════════════════════════════════════════
   CORE — Motion: route progress bar, boot splash, skeletons,
   button loading states and landing scroll-reveal.

   Purely presentational. Every entry point is optional (callers guard with
   `window.MMMotion?.`), and nothing here touches app state.
   ═══════════════════════════════════════════════ */
(function () {
  "use strict";

  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MESSAGES = ["Loading your workspace…", "Syncing meals and expenses…", "Preparing your dashboard…"];
  const SPLASH_DELAY = 160;   // don't flash the splash on fast loads
  const SPLASH_MIN = 520;     // once shown, stay long enough to read as intentional

  /* ── Route progress bar + splash, driven by a begin()/end() counter so nested or
        redirected routes (a route that go()es to another) don't end it early. ── */
  let pending = 0, bar, p = 0, trickle = null, hideTimer = null;
  let splash, splashTimer = null, splashShownAt = 0, msgTimer = null, wantSplash = false;

  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement("div");
    bar.id = "route-bar";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    return bar;
  }
  function setBar(v) { p = v; bar.style.transform = `scaleX(${v})`; }

  function showSplash() {
    if (splash || !pending) return;
    splash = document.createElement("div");
    splash.id = "boot-splash";
    splash.setAttribute("role", "status");
    splash.setAttribute("aria-label", "Loading MessManager");
    splash.innerHTML = `
      <div class="splash-mark"><div class="splash-ring r2"></div><div class="splash-ring"></div><img class="splash-logo" src="assets/favicon.svg" alt="" width="48" height="48"></div>
      <div class="splash-name">MessManager</div>
      <div class="splash-track"></div>
      <div class="splash-msg" id="splash-msg">${MESSAGES[0]}</div>`;
    document.body.appendChild(splash);
    splashShownAt = Date.now();
    let i = 0;
    msgTimer = setInterval(() => {
      const el = document.getElementById("splash-msg");
      if (!el) return;
      el.classList.add("swap");
      setTimeout(() => { el.textContent = MESSAGES[++i % MESSAGES.length]; el.classList.remove("swap"); }, 230);
    }, 1400);
  }

  function hideSplash() {
    clearTimeout(splashTimer); splashTimer = null;
    if (!splash) return;
    const el = splash, wait = Math.max(0, SPLASH_MIN - (Date.now() - splashShownAt));
    splash = null;
    setTimeout(() => {
      clearInterval(msgTimer);
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 400);
    }, wait);
  }

  /* opts.splash: this navigation enters the app, so a slow load earns the branded splash. */
  function begin(opts) {
    ensureBar();
    if (pending++ === 0) {
      clearTimeout(hideTimer);
      bar.classList.add("reset"); setBar(0); void bar.offsetWidth; bar.classList.remove("reset");
      bar.classList.add("on"); setBar(0.08);
      trickle = setInterval(() => setBar(p + (0.9 - p) * 0.12), 220);
    }
    if (opts && opts.splash) wantSplash = true;
    if (wantSplash && !splash && !splashTimer) splashTimer = setTimeout(showSplash, SPLASH_DELAY);
  }

  function end() {
    if (pending === 0 || --pending > 0) return;
    clearInterval(trickle); trickle = null;
    wantSplash = false;
    hideSplash();
    setBar(1);
    hideTimer = setTimeout(() => bar.classList.remove("on"), 220);
  }

  /* ── Skeleton markup (matches .topbar / .stat-grid / .card geometry so nothing jumps) ── */
  const statSk = `<div class="stat-card"><div class="sk sk-line w45" style="height:9px"></div><div class="sk sk-num"></div></div>`;
  const rowSk = `<div class="sk-row"><div class="sk sk-circle"></div><div class="sk sk-line"></div><div class="sk sk-line" style="max-width:70px"></div></div>`;

  function pageSkeleton() {
    return `<div class="sk-page" aria-busy="true" aria-label="Loading page">
      <div class="topbar"><div><div class="sk sk-title"></div><div class="sk sk-sub"></div></div></div>
      <div class="content">
        <div class="stat-grid">${statSk.repeat(4)}</div>
        <div class="grid-2">
          <div class="card"><div class="sk sk-line w30" style="height:12px;margin-bottom:16px"></div>${rowSk.repeat(4)}</div>
          <div class="card"><div class="sk sk-line w30" style="height:12px;margin-bottom:16px"></div>${rowSk.repeat(4)}</div>
        </div>
      </div></div>`;
  }
  function rowsSkeleton(n) { return `<div aria-busy="true">${rowSk.repeat(n || 5)}</div>`; }

  /* ── Buttons: an async click handler shows a spinner until it settles.
        Delayed so quick actions don't flicker; called from events.js. ── */
  function trackButton(el, promise) {
    const btn = el && el.closest && el.closest("button.btn");
    if (!btn || btn.classList.contains("is-loading")) return;
    const t = setTimeout(() => { if (btn.isConnected) btn.classList.add("is-loading"); }, 140);
    const done = () => { clearTimeout(t); btn.classList.remove("is-loading"); };
    promise.then(done, done);
  }

  /* ── Landing: reveal sections as they scroll into view ── */
  function initReveal() {
    if (reduced() || !("IntersectionObserver" in window)) return;
    const groups = [".features-grid", ".steps"];
    const targets = [];
    groups.forEach(sel => document.querySelectorAll(sel).forEach(g =>
      Array.from(g.children).forEach((c, i) => { c.style.setProperty("--i", i % 6); targets.push(c); })));
    document.querySelectorAll(".section-label,.section-title,.land-cta>*").forEach(c => targets.push(c));
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    targets.forEach(t => {
      if (t.closest(".hero")) return;        // hero has its own entrance
      t.classList.add("reveal"); io.observe(t);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initReveal);
  else initReveal();

  window.MMMotion = { begin, end, trackButton, pageSkeleton, rowsSkeleton };
  window.pageSkeleton = pageSkeleton;
})();
