/* ═══════════════════════════════════════════════
   CORE — Helpers: utils, theme, session, modal, toast
   ═══════════════════════════════════════════════ */
const today      = () => new Date().toISOString().slice(0, 10);
const thisMonth  = () => { const n = new Date(); return { month: n.getMonth(), year: n.getFullYear() }; };
const pad2       = (n) => String(n + 1).padStart(2, "0");
const monthKey   = (y, m) => `${y}-${pad2(m)}`;
const fmt        = (n) => Number(n || 0).toLocaleString("en-IN");
const fmtTk      = (n) => "৳" + fmt(n);
const round2     = (n) => Math.round((n || 0) * 100) / 100;
const initials   = (name) => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const avatarCol  = (i) => PALETTE[i % PALETTE.length];

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function sanitize(v) {
  if (Array.isArray(v)) return v.map(sanitize);
  if (v && typeof v === "object") {
    const o = {};
    Object.entries(v).forEach(([k, vv]) => { o[k] = sanitize(vv); });
    return o;
  }
  if (typeof v === "string") return escapeHtml(v);
  return v;
}

const cleanText = (v) => String(v ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();

/* ═══════════════════════════════════════════
   THEME
═══════════════════════════════════════════ */
function loadTheme() {
  document.documentElement.setAttribute("data-theme", localStorage.getItem("mm_theme") || "dark");
}
function toggleTheme() {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("mm_theme", next);
}
function togglePw() {
  const i = document.getElementById("login-pass");
  if (i) i.type = i.type === "password" ? "text" : "password";
}

/* ═══════════════════════════════════════════
   SESSION
═══════════════════════════════════════════ */
function saveSession(u, m) {
  currentUser = u; currentMess = m;
  sessionStorage.setItem("mm_user", JSON.stringify(u));
  sessionStorage.setItem("mm_mess", JSON.stringify(m));
}
function loadSession() {
  try {
    const u = sessionStorage.getItem("mm_user");
    const m = sessionStorage.getItem("mm_mess");
    if (u) currentUser = JSON.parse(u);
    if (m) currentMess = JSON.parse(m);
  } catch (e) { currentUser = null; currentMess = null; }
}
function clearSession() {
  currentUser = null; currentMess = null; members = [];
  sessionStorage.removeItem("mm_user");
  sessionStorage.removeItem("mm_mess");
}

/* ═══════════════════════════════════════════
   MODAL & TOAST
═══════════════════════════════════════════ */
function openModal()  { document.getElementById("modal-bg").classList.add("open"); }
function closeModal() {
  document.getElementById("modal-bg").classList.remove("open");
  const m = document.querySelector(".modal");
  if (m) m.classList.remove("modal-wide");
}

let toastTimer;
function toast(msg, type) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "show" + (type ? " " + type : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = "", 3200);
}
