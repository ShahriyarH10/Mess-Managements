/* ═══════════════════════════════════════════════
   CORE — CSP-safe delegated event handling

   The pages render markup with inline attributes such as
   onclick="deleteMember('abc')". A strict Content-Security-Policy
   (script-src 'self', no 'unsafe-inline') makes browsers refuse to execute
   those attributes, which is exactly what stops injected markup from running
   script. This module keeps the existing templates working WITHOUT eval:

     • one listener per event type at the document level
     • the attribute text is parsed by a tiny interpreter that only
       understands a fixed grammar (below) — never arbitrary JavaScript
     • calls are dispatched to existing global functions with literal args

   Supported statements (joined by ";"):
     fn(arg, …)                           args: 'str' "str" 123 true false null
                                                 this  event  this.value
                                                 this.dataset.x  currentUser?.memberId
     if(event.key==='Enter') <stmt>
     if(event.target===this) <stmt>
     this.style.<prop>='<value>'                      (hover effects)
     this.closest('<sel>').classList.add|remove('<c>')
     document.getElementById('<id>').value='<v>'
   Anything else is logged and ignored.
   ═══════════════════════════════════════════════ */
(function () {
  "use strict";

  const EVENTS = ["click", "change", "input", "keydown", "mouseover", "mouseout"];
  const NON_BUBBLING = ["focus", "blur"];
  const STYLE_PROPS = new Set(["borderColor", "transform", "boxShadow", "opacity", "background", "color"]);

  /* Split on a separator, ignoring separators inside quotes or (), [] */
  function splitTop(src, sep) {
    const out = []; let cur = "", depth = 0, quote = null;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quote) {
        cur += ch;
        if (ch === "\\") { cur += src[++i] || ""; }
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") { quote = ch; cur += ch; continue; }
      if (ch === "(" || ch === "[") depth++;
      if (ch === ")" || ch === "]") depth--;
      if (ch === sep && depth === 0) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    if (quote || depth !== 0) throw new Error("Unbalanced handler: " + src);
    if (cur.trim()) out.push(cur);
    return out.map(s => s.trim()).filter(Boolean);
  }

  function unquote(tok) {
    const q = tok[0];
    if ((q !== "'" && q !== '"') || tok[tok.length - 1] !== q || tok.length < 2) return undefined;
    // reject a stray, unescaped quote in the middle (ie. broken-out attribute data)
    let out = "";
    for (let i = 1; i < tok.length - 1; i++) {
      const ch = tok[i];
      if (ch === "\\") { out += tok[++i]; continue; }
      if (ch === q) throw new Error("Unexpected quote in " + tok);
      out += ch;
    }
    return out;
  }

  function arg(tok, el, ev) {
    if (tok === "this") return el;
    if (tok === "event") return ev;
    if (tok === "true") return true;
    if (tok === "false") return false;
    if (tok === "null") return null;
    if (tok === "undefined") return undefined;
    if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(tok)) return Number(tok);
    if (tok === "this.value") return el.value;
    if (tok === "this.checked") return el.checked;
    if (tok === "currentUser?.memberId") return (typeof currentUser !== "undefined" && currentUser) ? currentUser.memberId : undefined;
    let m = /^this\.dataset\.(\w+)$/.exec(tok);
    if (m) return el.dataset[m[1]];
    const s = unquote(tok);
    if (s !== undefined) return s;
    throw new Error("Unsupported argument: " + tok);
  }

  function runStatement(stmt, el, ev) {
    let m;
    if ((m = /^if\(\s*event\.key\s*===\s*'(\w+)'\s*\)\s*(.+)$/s.exec(stmt))) {
      if (ev.key === m[1]) runStatement(m[2], el, ev);
      return;
    }
    if ((m = /^if\(\s*event\.target\s*===\s*this\s*\)\s*(.+)$/s.exec(stmt))) {
      if (ev.target === el) runStatement(m[1], el, ev);
      return;
    }
    if ((m = /^this\.style\.(\w+)\s*=\s*'([^']*)'$/.exec(stmt))) {
      if (!STYLE_PROPS.has(m[1])) throw new Error("Style not allowed: " + m[1]);
      el.style[m[1]] = m[2];
      return;
    }
    if ((m = /^this\.closest\('([^']+)'\)\.classList\.(add|remove)\('([\w-]+)'\)$/.exec(stmt))) {
      const t = el.closest(m[1]);
      if (t) t.classList[m[2]](m[3]);
      return;
    }
    if ((m = /^document\.getElementById\('([\w-]+)'\)\.value\s*=\s*'([^']*)'$/.exec(stmt))) {
      const t = document.getElementById(m[1]);
      if (t) t.value = m[2];
      return;
    }
    if ((m = /^([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/.exec(stmt))) {
      const fn = window[m[1]];
      if (typeof fn !== "function") throw new Error("Unknown handler function: " + m[1]);
      const args = m[2].trim() ? splitTop(m[2], ",").map(t => arg(t, el, ev)) : [];
      const r = fn.apply(window, args);
      if (r && typeof r.catch === "function") {
        if (ev.type === "click") window.MMMotion?.trackButton(el, r);
        r.catch(e => console.error("[handler]", m[1], e));
      }
      return;
    }
    throw new Error("Unsupported handler statement: " + stmt);
  }

  function run(code, el, ev) {
    try { splitTop(code, ";").forEach(s => runStatement(s, el, ev)); }
    catch (e) { console.error("[events]", e.message); }
  }

  /* Under a strict CSP the browser would REFUSE (and log a violation for) every native
     onclick="…" attribute when it fires. To keep the console clean — and make sure the
     browser never tries to compile them — handler attributes are moved to data-on-<event>
     the moment they enter the DOM (MutationObserver callbacks run as a microtask, i.e.
     before any user event can be dispatched). */
  const TYPES = EVENTS.concat(NON_BUBBLING);
  const ATTRS = TYPES.map(t => "on" + t);
  const SELECTOR = ATTRS.map(a => "[" + a + "]").join(",");
  const attrOf = (el, type) => el.getAttribute("data-on-" + type) || el.getAttribute("on" + type);

  function convert(el) {
    for (const t of TYPES) {
      const v = el.getAttribute("on" + t);
      if (v !== null) { el.setAttribute("data-on-" + t, v); el.removeAttribute("on" + t); }
    }
  }
  function convertTree(node) {
    if (node.nodeType !== 1) return;
    convert(node);
    node.querySelectorAll(SELECTOR).forEach(convert);
  }
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === "attributes") convert(m.target);
      else m.addedNodes.forEach(convertTree);
    }
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ATTRS });
  convertTree(document.documentElement);

  /* Walk up from the target like native bubbling would. */
  function onBubbling(ev) {
    for (let el = ev.target instanceof Element ? ev.target : null; el; el = el.parentElement) {
      const code = attrOf(el, ev.type);
      if (code) run(code, el, ev);
    }
  }
  /* focus/blur don't bubble: only the element itself (captured). */
  function onDirect(ev) {
    const el = ev.target;
    if (!(el instanceof Element)) return;
    const code = attrOf(el, ev.type);
    if (code) run(code, el, ev);
  }

  EVENTS.forEach(t => document.addEventListener(t, onBubbling));
  NON_BUBBLING.forEach(t => document.addEventListener(t, onDirect, true));

  window.MMEvents = { splitTop, run };
})();
