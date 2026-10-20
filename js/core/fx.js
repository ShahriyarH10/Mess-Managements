/* ═══════════════════════════════════════════════
   CORE — FX: the expressive motion layer on top of motion.js.
     • count-up numbers (stat cards, landing stats, calendars)
     • click ripples, 3D card tilt + cursor spotlight, magnetic CTAs
     • confetti on success toasts, shake on error toasts
     • circular theme-switch reveal (View Transitions)
     • stagger indices for grids / tables / calendars / nav
     • landing: scroll progress, cursor glow, hero parallax

   Purely presentational and self-contained: it only observes the DOM and adds
   classes / CSS variables. Everything is skipped under prefers-reduced-motion.
   ═══════════════════════════════════════════════ */
(function () {
  "use strict";

  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
  const raf = requestAnimationFrame;

  /* ── Count-up ──────────────────────────────────────────────
     Rolls a number from its previous value (or 0) to the new one, keeping the
     prefix/suffix ("৳", "+", "%") and en-IN grouping. Our own frames are
     remembered so the observer ignores them; if app code rewrites the text
     mid-roll, the roll stops and the app's value wins. */
  const COUNT_SEL = ".stat-value,.hcp-sv,.hero-stat-num,.meal-day-total,[data-countup]";
  const NUM_RE = /^(\D*?)(-?[\d,]*\.?\d+)(\D*)$/;
  const lastWritten = new WeakMap(), lastValue = new WeakMap();

  function formatLike(n, decimals, grouped) {
    return grouped
      ? n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : n.toFixed(decimals);
  }

  function countUp(el) {
    if (el.children.length) return;                       // only plain-text numbers
    const text = el.textContent.trim();
    if (lastWritten.get(el) === el.textContent) return;   // one of our own frames
    const m = NUM_RE.exec(text);
    if (!m) return;
    const target = parseFloat(m[2].replace(/,/g, ""));
    if (!isFinite(target)) return;
    const from = lastValue.has(el) ? lastValue.get(el) : 0;
    lastValue.set(el, target);
    if (from === target || reduced()) return;

    const decimals = (m[2].split(".")[1] || "").length;
    const grouped = m[2].includes(",") || Math.abs(target) >= 1000;
    const final = el.textContent;
    const dur = Math.min(1400, 600 + Math.log10(Math.abs(target - from) + 1) * 160);
    const t0 = performance.now();
    el.classList.add("fx-counting");

    const step = (now) => {
      if (!el.isConnected || el.textContent !== lastWritten.get(el)) { el.classList.remove("fx-counting"); return; }
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(2, -10 * k);                   // easeOutExpo
      if (k < 1) {
        const s = m[1] + formatLike(from + (target - from) * e, decimals, grouped) + m[3];
        lastWritten.set(el, s); el.textContent = s;
        raf(step);
      } else {
        lastWritten.set(el, final); el.textContent = final;
        el.classList.remove("fx-counting");
        el.classList.add("fx-counted");
        setTimeout(() => el.classList.remove("fx-counted"), 700);
      }
    };
    lastWritten.set(el, el.textContent);
    raf(step);
  }

  /* Only roll numbers the user can actually see; others roll when scrolled to. */
  const countIO = "IntersectionObserver" in window ? new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { countIO.unobserve(e.target); countUp(e.target); }
  }), { threshold: 0.2 }) : null;
  const queueCount = el => countIO ? countIO.observe(el) : countUp(el);

  /* ── Stagger indices ──────────────────────────────────────── */
  const STAGGER_SEL = ".meal-calendar,.meal-grid,.meal-month-list,.mh-grid,tbody,.att-cal-grid,.bz-cal-grid,.nav,.mobile-nav,.hist-wrap,.onboard-wrap";
  function stagger(container) {
    const kids = container.children;
    for (let i = 0; i < kids.length; i++) kids[i].style.setProperty("--fx-i", Math.min(i, 24));
  }

  /* ── DOM watcher: new page content, modals, nav rebuilds ─────── */
  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches(COUNT_SEL)) queueCount(root);
    root.querySelectorAll(COUNT_SEL).forEach(queueCount);
    if (root.matches(STAGGER_SEL)) stagger(root);
    root.querySelectorAll(STAGGER_SEL).forEach(stagger);
  }

  function watch() {
    new MutationObserver(muts => {
      const seen = new Set();
      for (const m of muts) {
        const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (!t) continue;
        // text of an existing number changed (re-render / live update) → roll it
        const num = t.closest && t.closest(COUNT_SEL);
        if (num && !seen.has(num) && lastWritten.get(num) !== num.textContent) { seen.add(num); queueCount(num); }
        if (t.matches && t.matches(STAGGER_SEL) && !seen.has(t)) { seen.add(t); stagger(t); }
        m.addedNodes.forEach(n => { if (n.nodeType === 1 && !seen.has(n)) { seen.add(n); scan(n); } });
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    scan(document.body);
  }

  /* ── Click ripple ─────────────────────────────────────────── */
  const RIPPLE_SEL = ".btn,.nav-item,.mob-nav-btn,.theme-toggle-btn,.meal-month-chip,.profile-card,.mob-theme-btn,.land-nav-theme,.auth-theme-btn,.demo-role";
  function ripple(ev) {
    if (ev.button !== 0 || reduced()) return;
    const host = ev.target.closest && ev.target.closest(RIPPLE_SEL);
    if (!host || host.disabled) return;
    const r = host.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const wrap = document.createElement("span");
    wrap.className = "fx-ripple-wrap";
    const dot = document.createElement("span");
    dot.className = "fx-ripple";
    dot.style.cssText = `width:${size}px;height:${size}px;left:${ev.clientX - r.left - size / 2}px;top:${ev.clientY - r.top - size / 2}px`;
    wrap.appendChild(dot);
    host.appendChild(wrap);
    setTimeout(() => wrap.remove(), 650);
  }

  /* ── 3D tilt + spotlight + magnetic buttons (mouse only) ──────── */
  const TILT_SEL = ".stat-card,.profile-card,.feature-card,.demo-role,.hero-visual,.meal-month-chip,.step,.auth-card";
  const MAG_SEL = ".hero-actions .btn,.land-cta .btn,.land-nav-actions .btn";
  let tilted = null, magnet = null;

  function untilt(el) {
    el.classList.remove("fx-tilt");
    el.style.removeProperty("--rx"); el.style.removeProperty("--ry");
  }
  function onMove(ev) {
    if (reduced() || !finePointer()) return;
    const t = ev.target.closest ? ev.target.closest(TILT_SEL) : null;
    if (tilted && tilted !== t) { untilt(tilted); tilted = null; }
    if (t) {
      const r = t.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      const max = t.classList.contains("auth-card") || t.classList.contains("hero-visual") ? 4 : 9;
      t.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
      t.style.setProperty("--my", (y * 100).toFixed(1) + "%");
      t.style.setProperty("--rx", ((0.5 - y) * max).toFixed(2) + "deg");
      t.style.setProperty("--ry", ((x - 0.5) * max).toFixed(2) + "deg");
      t.classList.add("fx-tilt");
      tilted = t;
    }
    const b = ev.target.closest ? ev.target.closest(MAG_SEL) : null;
    if (magnet && magnet !== b) { magnet.style.removeProperty("--tx"); magnet.style.removeProperty("--ty"); magnet.classList.remove("fx-magnet"); magnet = null; }
    if (b) {
      const r = b.getBoundingClientRect();
      b.style.setProperty("--tx", ((ev.clientX - r.left - r.width / 2) * 0.25).toFixed(1) + "px");
      b.style.setProperty("--ty", ((ev.clientY - r.top - r.height / 2) * 0.35).toFixed(1) + "px");
      b.classList.add("fx-magnet");
      magnet = b;
    }
  }

  /* ── Confetti ─────────────────────────────────────────────── */
  const COLORS = ["#d4a853", "#f0d28f", "#4caf82", "#5b9bd5", "#a78bfa", "#e05252", "#ffffff"];
  let confettiCanvas = null, parts = [], confettiRun = false;

  function confetti(x, y, n) {
    if (reduced()) return;
    if (!confettiCanvas) {
      confettiCanvas = document.createElement("canvas");
      confettiCanvas.id = "fx-confetti";
      confettiCanvas.setAttribute("aria-hidden", "true");
      document.body.appendChild(confettiCanvas);
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    confettiCanvas.width = innerWidth * dpr; confettiCanvas.height = innerHeight * dpr;
    confettiCanvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < (n || 90); i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
      const v = 7 + Math.random() * 9;
      parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        w: 5 + Math.random() * 6, h: 3 + Math.random() * 5,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
        c: COLORS[(Math.random() * COLORS.length) | 0], life: 0, circle: Math.random() < 0.25,
      });
    }
    if (!confettiRun) { confettiRun = true; raf(tickConfetti); }
  }
  function tickConfetti() {
    const ctx = confettiCanvas.getContext("2d");
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.life < 140 && p.y < innerHeight + 40);
    for (const p of parts) {
      p.life++; p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.life / 140);
      ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      if (p.circle) { ctx.beginPath(); ctx.arc(0, 0, p.h / 1.4, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.life * 0.15)) + 1);
      ctx.restore();
    }
    if (parts.length) raf(tickConfetti);
    else { confettiRun = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  /* Success toast → confetti burst from the toast; error toast → shake (CSS) */
  function watchToast() {
    const t = document.getElementById("toast");
    if (!t) return;
    let lastBurst = 0;
    new MutationObserver(() => {
      if (!t.classList.contains("show")) return;
      if (t.classList.contains("success") && Date.now() - lastBurst > 900) {
        lastBurst = Date.now();
        const r = t.getBoundingClientRect();
        confetti(r.left + r.width / 2, r.top, 70);
      }
      if (t.classList.contains("error")) {
        const m = document.querySelector(".modal-bg.open .modal,.modal-bg.open .confirm-dialog");
        if (m) {
          m.classList.remove("fx-shake"); void m.offsetWidth; m.classList.add("fx-shake");
          setTimeout(() => m.classList.remove("fx-shake"), 520);   // so the next open replays its entrance
        }
      }
    }).observe(t, { attributes: true, attributeFilter: ["class"] });
  }

  /* ── Theme switch: a circle grows from the click point ─────────── */
  let lastPt = { x: innerWidth - 40, y: 40 };
  function wrapTheme() {
    const orig = window.toggleTheme;
    if (typeof orig !== "function" || orig.__fx) return;
    const wrapped = function () {
      if (!document.startViewTransition || reduced()) return orig.apply(this, arguments);
      const args = arguments, self = this;
      const { x, y } = lastPt;
      const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      document.documentElement.classList.add("fx-theme-swap");
      const vt = document.startViewTransition(() => orig.apply(self, args));
      vt.ready.then(() => document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(.22,1,.36,1)", pseudoElement: "::view-transition-new(root)" }
      )).catch(() => {});
      vt.finished.finally(() => document.documentElement.classList.remove("fx-theme-swap"));
    };
    wrapped.__fx = true;
    window.toggleTheme = wrapped;
  }

  /* ── Landing: scroll progress, cursor glow, hero parallax ───────── */
  function initLanding() {
    const landing = document.getElementById("landing-page");
    if (!landing || reduced()) return;
    const bar = document.createElement("div");
    bar.id = "fx-scroll-bar"; bar.setAttribute("aria-hidden", "true");
    landing.appendChild(bar);
    const glow = document.createElement("div");
    glow.id = "fx-cursor-glow"; glow.setAttribute("aria-hidden", "true");
    landing.appendChild(glow);
    const hero = landing.querySelector(".hero");

    let ticking = false;
    const onScroll = () => {
      if (ticking) return; ticking = true;
      raf(() => {
        ticking = false;
        if (landing.offsetParent === null && getComputedStyle(landing).display === "none") return;
        const max = document.documentElement.scrollHeight - innerHeight;
        bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
        if (hero) hero.style.setProperty("--py", Math.min(scrollY, 900).toFixed(0));
      });
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    landing.addEventListener("pointermove", ev => {
      if (!finePointer()) return;
      glow.style.transform = `translate(${ev.clientX}px,${ev.clientY}px)`;
      glow.classList.add("on");
    }, { passive: true });
    landing.addEventListener("pointerleave", () => glow.classList.remove("on"));
  }

  function init() {
    document.addEventListener("pointerdown", ev => { lastPt = { x: ev.clientX, y: ev.clientY }; ripple(ev); }, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", () => { if (tilted) { untilt(tilted); tilted = null; } });
    wrapTheme();
    watchToast();
    initLanding();
    watch();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.MMFx = { confetti, countUp };
})();
