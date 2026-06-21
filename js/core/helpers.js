/* ═══════════════════════════════════════════════
   CORE — Helpers: utils, theme, session, modal, toast, confirm
   ═══════════════════════════════════════════════ */
const today      = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`; };
const thisMonth  = () => { const n = new Date(); return { month: n.getMonth(), year: n.getFullYear() }; };
const pad2       = (n) => String(n + 1).padStart(2, "0");
const monthKey   = (y, m) => `${y}-${pad2(m)}`;
const fmt        = (n) => Number(n || 0).toLocaleString("en-IN");
const fmtTk      = (n) => "৳" + fmt(n);
const round2     = (n) => Math.round((n || 0) * 100) / 100;
// Collision-aware initials: builds a de-duplication map across all member names
// so two members sharing the same standard initials get distinguishable labels.
let _initialsMap = {}; // member id -> display initials string
function buildInitialsMap(memberList) {
  // First pass: compute naive initials for each member
  const naive = memberList.map(m => ({
    id: m.id,
    name: m.name,
    ini: m.name.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase(),
  }));
  // Find which initials collide
  const seen = {};
  naive.forEach(x => { seen[x.ini] = (seen[x.ini] || 0) + 1; });
  // Second pass: for colliding members use first 2 chars of first name
  _initialsMap = {};
  naive.forEach(x => {
    if (seen[x.ini] > 1) {
      const firstName = x.name.trim().split(/\s+/)[0];
      _initialsMap[x.id] = firstName.slice(0, 2).toUpperCase();
    } else {
      _initialsMap[x.id] = x.ini;
    }
  });
  // Third pass: if first-2-chars STILL collide, append a disambiguating digit
  const seen2 = {};
  Object.entries(_initialsMap).forEach(([id, ini]) => {
    seen2[ini] = seen2[ini] || [];
    seen2[ini].push(id);
  });
  Object.values(seen2).forEach(ids => {
    if (ids.length > 1) {
      ids.forEach((id, i) => { _initialsMap[id] = _initialsMap[id].slice(0, 1) + (i + 1); });
    }
  });
}
// Returns display initials for a member by id (falls back to naive if map not yet built)
const memberInitials = (id, name) => _initialsMap[id] || name.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
// Keep legacy initials() for non-member uses (non-collision-aware)
const initials = (name) => name.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

// avatarCol: accepts either a member ID string (stable hash) or a numeric index (legacy)
function avatarCol(idOrIndex) {
  if (typeof idOrIndex === "number") return PALETTE[idOrIndex % PALETTE.length];
  let h = 0;
  const s = String(idOrIndex);
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

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

/* ══════════════════════════════════════════════
   MEAL TOTAL HELPERS  (single source of truth)
   These never depend on the members[] array,
   so they work even if names drift over time.
══════════════════════════════════════════════ */

/**
 * Total meals in ONE meal-row object, regardless of member names.
 * Handles both split format (_day/_night) and legacy (plain name).
 */
function mealRowTotal(mObj) {
  if (!mObj) return 0;
  const keys = Object.keys(mObj);
  const hasSplit = keys.some(k => k.endsWith("_day") || k.endsWith("_night"));
  if (hasSplit) {
    return keys.reduce((s, k) =>
      (k.endsWith("_day") || k.endsWith("_night")) ? s + (Number(mObj[k]) || 0) : s, 0);
  }
  return Object.values(mObj).reduce((s, v) => s + (Number(v) || 0), 0);
}

/**
 * One specific member's meals from ONE meal-row object.
 * Tries: exact name → _day+_night keys → case-insensitive → trimmed.
 */
function mealMemberTotal(mObj, memberName) {
  if (!mObj || !memberName) return 0;
  // Build base-name → total from the raw keys
  const keys = Object.keys(mObj);
  const hasSplit = keys.some(k => k.endsWith("_day") || k.endsWith("_night"));
  const totals = {}; // baseName -> total
  if (hasSplit) {
    keys.forEach(k => {
      if (k.endsWith("_day"))   { const b = k.slice(0,-4); totals[b] = (totals[b]||0) + (Number(mObj[k])||0); }
      if (k.endsWith("_night")) { const b = k.slice(0,-6); totals[b] = (totals[b]||0) + (Number(mObj[k])||0); }
    });
  } else {
    keys.forEach(k => { totals[k] = Number(mObj[k]) || 0; });
  }
  // Exact match
  if (totals[memberName] != null) return round2(totals[memberName]);
  // Case-insensitive
  const lname = memberName.toLowerCase();
  const ci = Object.keys(totals).find(k => k.toLowerCase() === lname);
  if (ci) return round2(totals[ci]);
  // Trimmed
  const tname = memberName.trim();
  const tr = Object.keys(totals).find(k => k.trim() === tname);
  if (tr) return round2(totals[tr]);
  return 0;
}


/* THEME */
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
  if (i) {
    const showing = i.type === "text";
    i.type = showing ? "password" : "text";
    const btn = i.parentElement.querySelector(".pw-eye");
    if (btn) btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  }
}

/* LANDING PAGE MOBILE DRAWER */
function openLandingDrawer() {
  document.getElementById("land-mobile-drawer").classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeLandingDrawer() {
  document.getElementById("land-mobile-drawer").classList.remove("open");
  document.body.style.overflow = "";
}

/* SESSION — localStorage only (sessionStorage copy removed) */
function saveSession(u, m, jwt = null) {
  currentUser = u; currentMess = m;
  const payload = { u, m, jwt, exp: Date.now() + SESSION_TTL_MS };
  localStorage.setItem("mm_session", JSON.stringify(payload));
}
function loadSession() {
  try {
    const raw = localStorage.getItem("mm_session");
    if (!raw) return;
    const payload = JSON.parse(raw);
    if (!payload.exp || Date.now() > payload.exp) { clearSession(); return; }
    if (payload.u) currentUser = payload.u;
    if (payload.m) currentMess = payload.m;
  } catch (e) { currentUser = null; currentMess = null; }
}
function clearSession() {
  currentUser = null; currentMess = null; members = [];
  localStorage.removeItem("mm_session");
  // Legacy key cleanup
  localStorage.removeItem("mm_user"); localStorage.removeItem("mm_mess");
  sessionStorage.clear();
}

/* ROLE GUARD */
// Actions only the full manager (or superadmin) can do — never sub_manager
const FULL_MANAGER_ONLY_FNS = new Set([
  "addMember", "updateMember", "deleteMember", "openLeavingFlow",
  "openManagerResetPasswordModal", "doManagerResetPassword",
  "setSubManager", "renderManagerRoles",
  "toggleMonthLock",
  "saveMessRules",
  "saveFundEntry", "deleteFundEntry",
]);

function requireManager(fnName) {
  if (!currentUser) {
    console.warn(`[Security] ${fnName} blocked — not logged in`);
    toast("Not authenticated", "error");
    return false;
  }
  const isManager    = currentUser.role === "manager";
  const isSubManager = currentUser.role === "sub_manager";
  const isSuperAdmin = currentUser.role === "superadmin";

  if (!isManager && !isSubManager && !isSuperAdmin) {
    console.warn(`[Security] ${fnName} blocked — insufficient role: ${currentUser.role}`);
    toast("Manager access required", "error");
    return false;
  }
  // Sub-managers are blocked from full-manager-only actions
  if (isSubManager && FULL_MANAGER_ONLY_FNS.has(fnName)) {
    console.warn(`[Security] ${fnName} blocked — sub_manager cannot perform this action`);
    toast("Only the main manager can do this", "error");
    return false;
  }
  return true;
}

/* MODAL */
function openModal()  { document.getElementById("modal-bg").classList.add("open"); }
function closeModal() {
  document.getElementById("modal-bg").classList.remove("open");
  const m = document.querySelector(".modal");
  if (m) m.classList.remove("modal-wide");
}

/* TOAST */
let toastTimer;
function toast(msg, type) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "show" + (type ? " " + type : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = "", 3200);
}

/* CONFIRM DIALOG — replaces native confirm() */
function showConfirm({ title, body, confirmLabel = "Confirm", danger = false, onConfirm }) {
  const bg = document.getElementById("confirm-bg");
  const content = document.getElementById("confirm-content");
  content.innerHTML = `
    <div class="confirm-title">${escapeHtml(title)}</div>
    <div class="confirm-body">${escapeHtml(body)}</div>
    <div class="confirm-actions">
      <button class="btn btn-ghost" onclick="closeConfirm()">Cancel</button>
      <button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="confirm-ok-btn">${escapeHtml(confirmLabel)}</button>
    </div>`;
  document.getElementById("confirm-ok-btn").onclick = () => { closeConfirm(); onConfirm(); };
  bg.classList.add("open");
}
function closeConfirm() {
  document.getElementById("confirm-bg").classList.remove("open");
}

/* CALCULATION HELPERS */
const UTIL_PREPAID_KEYS  = ["elec", "gas", "wifi"];
const UTIL_POSTPAID_KEYS = ["khala", "other"];
const UTIL_ALL_KEYS      = [...UTIL_PREPAID_KEYS, ...UTIL_POSTPAID_KEYS];

function mealTotalFromObj(mealsObj, memberName) {
  const hasSplit = mealsObj && (mealsObj[memberName + "_day"] != null || mealsObj[memberName + "_night"] != null);
  if (hasSplit) return round2(Number(mealsObj[memberName + "_day"] || 0) + Number(mealsObj[memberName + "_night"] || 0));
  return Number(mealsObj?.[memberName] || 0);
}

function mealPartsFromObj(mealsObj, memberName) {
  const day   = Number(mealsObj?.[memberName + "_day"]   || 0);
  const night = Number(mealsObj?.[memberName + "_night"] || 0);
  const legacy= Number(mealsObj?.[memberName] || 0);
  const total = (mealsObj?.[memberName + "_day"] != null || mealsObj?.[memberName + "_night"] != null) ? round2(day + night) : legacy;
  return { day, night, total };
}

function monthLabelFromKey(key) {
  const [y, mm] = String(key || "").split("-");
  const idx = Math.max(0, Number(mm || 1) - 1);
  return `${MONTHS[idx] || "Month"} ${y || ""}`.trim();
}

function monthIndexFromKey(key) {
  return Math.max(0, Number(String(key || "").slice(5, 7)) - 1);
}

function yearFromKey(key) {
  return Number(String(key || "").slice(0, 4)) || new Date().getFullYear();
}

function utilTotalFromBills(bills, keys = UTIL_ALL_KEYS) {
  return keys.reduce((sum, key) => sum + Number(bills?.[key] || 0), 0);
}

function utilShareFromRecord(record, keys) {
  return members.length > 0 ? round2(utilTotalFromBills(record?.bills || {}, keys) / members.length) : 0;
}

/* Month navigation */
function previousMonth(month, year) {
  month = Number(month); year = Number(year);
  if (month === 0) return { month: 11, year: year - 1, key: monthKey(year - 1, 11) };
  return { month: month - 1, year, key: monthKey(year, month - 1) };
}

function nextMonth(month, year) {
  month = Number(month); year = Number(year);
  if (month === 11) return { month: 0, year: year + 1, key: monthKey(year + 1, 0) };
  return { month: month + 1, year, key: monthKey(year, month + 1) };
}

function previousMonthFromKey(key) {
  return previousMonth(monthIndexFromKey(key), yearFromKey(key));
}

function setPaymentMonth(month, year) {
  const m = document.getElementById("ut-pay-month");
  const y = document.getElementById("ut-pay-year");
  if (m) m.value = String(month);
  if (y) y.value = String(year);
}

function calcSettlementSourceKey(settlementMonth, settlementYear) {
  return previousMonth(settlementMonth, settlementYear).key;
}

/*
  ╔══════════════════════════════════════════════════════════════════╗
  ║  SETTLEMENT FORMULA (single source of truth)                    ║
  ╚══════════════════════════════════════════════════════════════════╝
*/
function calcSettlementTotals(allMeals, allBazar, sourceKey) {
  const mealRows  = (allMeals  || []).filter(r => String(r.date || "").startsWith(sourceKey));
  const bazarRows = (allBazar  || []).filter(r => String(r.date || "").startsWith(sourceKey));
  const memberMeals = {}, memberBazar = {};
  members.forEach(m => { memberMeals[m.name] = 0; memberBazar[m.name] = 0; });
  let totalMeals = 0, totalBazar = 0;

  mealRows.forEach(row => {
    const mObj = row.meals || {};
    const keys  = Object.keys(mObj);
    const hasSplit = keys.some(k => k.endsWith("_day") || k.endsWith("_night"));

    // ── Total meals: sum directly from keys (name-independent) ──
    if (hasSplit) {
      keys.forEach(k => { if (k.endsWith("_day") || k.endsWith("_night")) totalMeals += Number(mObj[k]) || 0; });
    } else {
      Object.values(mObj).forEach(v => { totalMeals += Number(v) || 0; });
    }

    // ── Per-member meals: exact name match OR key-prefix match ──
    // Build a name->total map from the raw keys in case member names
    // don't exactly match (e.g. sanitization, renaming)
    const keyMealTotals = {}; // "BaseName" -> total
    if (hasSplit) {
      keys.forEach(k => {
        if (k.endsWith("_day")) {
          const base = k.slice(0, -4);
          keyMealTotals[base] = (keyMealTotals[base] || 0) + (Number(mObj[k]) || 0);
        } else if (k.endsWith("_night")) {
          const base = k.slice(0, -6);
          keyMealTotals[base] = (keyMealTotals[base] || 0) + (Number(mObj[k]) || 0);
        }
      });
    } else {
      keys.forEach(k => { keyMealTotals[k] = Number(mObj[k]) || 0; });
    }
    members.forEach(m => {
      // 1. Exact name match
      let v = keyMealTotals[m.name];
      // 2. Case-insensitive match
      if (v == null) {
        const lname = m.name.toLowerCase();
        const found = Object.keys(keyMealTotals).find(k => k.toLowerCase() === lname);
        if (found) v = keyMealTotals[found];
      }
      // 3. Trim-and-compare
      if (v == null) {
        const tname = m.name.trim();
        const found = Object.keys(keyMealTotals).find(k => k.trim() === tname);
        if (found) v = keyMealTotals[found];
      }
      memberMeals[m.name] = round2(memberMeals[m.name] + (v || 0));
    });
  });

  bazarRows.forEach(row => {
    const bObj = row.bazar || {};
    Object.values(bObj).forEach(v => { totalBazar += Number(v) || 0; });
    members.forEach(m => {
      const v = Number(bObj[m.name] || 0);
      memberBazar[m.name] = round2(memberBazar[m.name] + v);
    });
  });

  const mealRate = totalMeals > 0 ? round2(totalBazar / totalMeals) : 0;
  return { totalMeals: round2(totalMeals), totalBazar: round2(totalBazar), mealRate, memberMeals, memberBazar };
}

function calcMemberSettlement(member, allMeals, allBazar, currentRentRec, currentUtilRec, previousUtilRec, settlementKey) {
  const settlementMonth = monthIndexFromKey(settlementKey);
  const settlementYear  = yearFromKey(settlementKey);
  const sourceKey       = calcSettlementSourceKey(settlementMonth, settlementYear);
  const prevMonthInfo   = previousMonth(settlementMonth, settlementYear);
  const totals      = calcSettlementTotals(allMeals, allBazar, sourceKey);
  const memberMeals = round2(totals.memberMeals[member.name] || 0);
  const memberBazar = round2(totals.memberBazar[member.name] || 0);
  const mealCost    = round2(memberMeals * totals.mealRate);
  const rentEntry   = currentRentRec?.entries?.find(e => e.name === member.name) || {};
  const roomRent    = Number(rentEntry.rent || 0);
  const roomRentPaid= Number(rentEntry.paid || 0);
  const memberCount = members.length || 1;
  const prepaidTotal    = utilTotalFromBills(currentUtilRec?.bills || {}, UTIL_PREPAID_KEYS);
  const prepaidUtility  = round2(prepaidTotal / memberCount);
  const khalaTotal  = Number(previousUtilRec?.bills?.khala || 0);
  const otherTotal  = Number(previousUtilRec?.bills?.other || 0);
  const khalaShare  = round2(khalaTotal / memberCount);
  const otherShare  = round2(otherTotal / memberCount);
  const postpaidUtility = round2(khalaShare + otherShare);
  const utilPayment = (currentUtilRec?.payments || {})[member.name] || {};
  const utilityPaid = Number(utilPayment.paid || 0);
  const mealPaid    = Number(utilPayment.meal_paid || 0);
  const creditPaid  = Number(utilPayment.credit_paid || 0); // cash handed back to member
  const mealBalance = round2(mealCost - memberBazar);
  const bills       = currentUtilRec?.bills || {};
  const messCredit  = round2(
    Number((bills.mess_credit   || {})[member.name] || 0) +
    Number((bills.change_credit || {})[member.name] || 0)
  );
  const totalPay       = round2(mealCost + roomRent + prepaidUtility + postpaidUtility);
  const baseNetPayable = round2(totalPay - memberBazar - utilityPaid - roomRentPaid - mealPaid - messCredit);
  // creditPaid = cash handed back to member; caps at 0 so over-accumulated DB values can't flip sign
  const netPayable     = baseNetPayable < 0
    ? round2(Math.min(baseNetPayable + creditPaid, 0))
    : baseNetPayable;
  return {
    memberName: member.name, settlementKey, sourceKey, prevMonthInfo,
    totalMeals: totals.totalMeals, totalBazar: totals.totalBazar, mealRate: totals.mealRate,
    memberMeals, memberBazar, mealCost, roomRent, roomRentPaid,
    prepaidTotal, prepaidUtility, khalaTotal, otherTotal, khalaShare, otherShare, postpaidUtility,
    utilityPaid, utilityStatus: utilPayment.status || "unpaid", rentStatus: rentEntry.status || "unpaid",
    mealBalance, messCredit, mealPaid, creditPaid, totalPay, netPayable,
  };
}

function buildMonthOptions(selectedMonth, selectedYear, yearsBack = 5, yearsForward = 5) {
  const now   = new Date();
  const start = now.getFullYear() - yearsBack;
  const end   = now.getFullYear() + yearsForward;
  const yearOptions  = Array.from({ length: end - start + 1 }, (_, i) => start + i)
    .map(y => `<option value="${y}"${y === selectedYear ? " selected" : ""}>${y}</option>`).join("");
  const monthOptions = MONTHS.map((m, i) => `<option value="${i}"${i === selectedMonth ? " selected" : ""}>${m}</option>`).join("");
  return { monthOptions, yearOptions };
}

function getMealMonthKeys(allMeals) {
  const keys    = [...new Set((allMeals || []).map(r => String(r.date || "").slice(0, 7)).filter(Boolean))].sort().reverse();
  const current = monthKey(new Date().getFullYear(), new Date().getMonth());
  if (!keys.includes(current)) keys.unshift(current);
  return keys.slice(0, 12);
}

function buildMealMonthButtons(keys, onClickName, allMeals) {
  if (!keys.length) return '<div class="empty" style="padding:18px">No meal months yet</div>';
  if (!allMeals) {
    return `<div class="meal-month-list">${keys.map(k => `<button class="meal-month-chip" onclick="${onClickName}('${k}')"><span>${monthLabelFromKey(k)}</span><small>View history</small></button>`).join("")}</div>`;
  }
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
    ${keys.map(k => {
      const rows = (allMeals || []).filter(r => String(r.date || "").startsWith(k));
      let total = 0, activeDays = 0;
      const perMember = {}; members.forEach(m => { perMember[m.name] = 0; });
      rows.forEach(r => {
        let dayTotal = 0;
        members.forEach(m => { const v = mealMemberTotal(r.meals || {}, m.name); perMember[m.name] += v; }); dayTotal += mealRowTotal(r.meals || {});
        if (dayTotal > 0) activeDays++;
        total += dayTotal;
      });
      const top = Object.entries(perMember).sort((a, b) => b[1] - a[1])[0];
      const isTop = top && top[1] > 0;
      const avg = activeDays > 0 ? round2(total / activeDays) : 0;
      return `<button onclick="${onClickName}('${k}')" class="profile-card" style="all:unset;cursor:pointer;padding:13px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);display:flex;flex-direction:column;gap:8px;transition:transform .15s,border-color .15s" onmouseover="this.style.borderColor='var(--accent)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform='translateY(0)'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
          <div style="font-family:var(--font-serif);font-size:15px;font-weight:700;line-height:1.1">${monthLabelFromKey(k)}</div>
          <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">${activeDays} day${activeDays===1?"":"s"}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div style="background:var(--bg3);border-radius:5px;padding:6px 8px"><div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Meals</div><div style="font-size:15px;font-weight:700;margin-top:1px">${round2(total)}</div></div>
          <div style="background:var(--bg3);border-radius:5px;padding:6px 8px"><div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Avg/day</div><div style="font-size:15px;font-weight:700;margin-top:1px">${avg}</div></div>
        </div>
        ${isTop ? `<div style="font-size:11px;color:var(--text2)">Top: <b style="color:var(--accent)">${escapeHtml(top[0])}</b> <span style="color:var(--text3)">· ${round2(top[1])} meals</span></div>` : `<div style="font-size:11px;color:var(--text3)">No meal data yet</div>`}
      </button>`;
    }).join("")}
  </div>`;
}

function buildMemberMealCalendar(memberName, allMeals, key) {
  const year  = yearFromKey(key);
  const month = monthIndexFromKey(key);
  const days  = new Date(year, month + 1, 0).getDate();
  const byDate = {};
  (allMeals || []).filter(r => String(r.date || "").startsWith(key)).forEach(r => {
    byDate[String(r.date).slice(8, 10)] = mealPartsFromObj(r.meals || {}, memberName);
  });
  let total = 0, active = 0, dayTotal = 0, nightTotal = 0;
  const cells = Array.from({ length: days }, (_, i) => {
    const day   = String(i + 1).padStart(2, "0");
    const entry = byDate[day] || { day: 0, night: 0, total: 0 };
    if (entry.total > 0) { active++; total += entry.total; dayTotal += entry.day; nightTotal += entry.night; }
    return `<div class="meal-day ${entry.total > 0 ? "has-meal" : ""}">
      <div class="meal-day-num">${i + 1}</div>
      <div class="meal-day-total">${entry.total > 0 ? entry.total : "—"}</div>
      ${entry.total > 0 ? `<div class="meal-day-meta">D ${entry.day} · N ${entry.night}</div>` : `<div class="meal-day-meta">No meal</div>`}
    </div>`;
  }).join("");
  return { html: `<div class="meal-calendar">${cells}</div>`, total: round2(total), active, dayTotal: round2(dayTotal), nightTotal: round2(nightTotal) };
}

async function openMemberMealMonth(memberName, key) {
  const allMeals = await dbGetAll("meals");
  const cal      = buildMemberMealCalendar(memberName, allMeals, key);
  const modal    = document.getElementById("modal-content");
  modal.innerHTML = `
    <div class="modal-title">${escapeHtml(memberName)} — ${monthLabelFromKey(key)}</div>
    <div class="modal-sub">Coloured days indicate a meal entry exists for that date.</div>
    <div class="stat-grid" style="margin-bottom:14px">
      <div class="stat-card"><div class="stat-label">Total meals</div><div class="stat-value">${cal.total}</div></div>
      <div class="stat-card"><div class="stat-label">Meal days</div><div class="stat-value">${cal.active}</div></div>
    </div>
    ${cal.html}
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`;
  document.querySelector(".modal").classList.remove("modal-wide");
  openModal();
}

async function openManagerMealMonth(key) {
  const allMeals = await dbGetAll("meals");
  const monthLabel = monthLabelFromKey(key);
  const perMember = members.map(m => { const cal = buildMemberMealCalendar(m.name, allMeals, key); return { name: m.name, ...cal }; });
  const grandMeals = round2(perMember.reduce((s, p) => s + p.total, 0));
  const grandDays  = perMember.reduce((s, p) => Math.max(s, p.active), 0);
  const modal = document.getElementById("modal-content");
  modal.innerHTML = `
    <div class="modal-title">All Members — ${monthLabel}</div>
    <div class="modal-sub">Each member's monthly meal calendar with day/night split.</div>
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat-card"><div class="stat-label">Total meals (mess)</div><div class="stat-value">${grandMeals}</div></div>
      <div class="stat-card"><div class="stat-label">Members</div><div class="stat-value">${members.length}</div></div>
      <div class="stat-card"><div class="stat-label">Most active days</div><div class="stat-value">${grandDays}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
      ${perMember.map((p, i) => {
        const col = avatarCol(i);
        const dim = p.total === 0;
        const dPct = p.total > 0 ? Math.round((p.dayTotal / p.total) * 100) : 0;
        const nPct = p.total > 0 ? 100 - dPct : 0;
        return `<div class="card mc-compact" style="padding:14px;${dim ? "opacity:.55" : ""};border-color:${p.total>0?"var(--accent)":"var(--border)"}">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div class="avatar" style="background:${col.bg};color:${col.fg};width:34px;height:34px;font-size:12px;flex-shrink:0">${memberInitials(p.id, p.name)}</div>
            <div style="min-width:0;flex:1">
              <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name)}</div>
              <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">${monthLabel}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
            <div class="stat-card" style="padding:8px 10px"><div class="stat-label" style="font-size:10px">Total meals</div><div style="font-size:18px;font-weight:700;color:${p.total>0?"var(--green)":"var(--text3)"}">${p.total}</div></div>
            <div class="stat-card" style="padding:8px 10px"><div class="stat-label" style="font-size:10px">Meal days</div><div style="font-size:18px;font-weight:700">${p.active}</div></div>
          </div>
          ${p.total > 0 ? `
            <div class="dn-split-bar" title="Day vs Night">
              <div class="dn-d" style="width:${dPct}%"></div>
              <div class="dn-n" style="width:${nPct}%"></div>
            </div>
            <div class="dn-split-row">
              <span>☀ Day&nbsp;<b class="d-val">${p.dayTotal}</b> <span style="opacity:.6">(${dPct}%)</span></span>
              <span>🌙 Night&nbsp;<b class="n-val">${p.nightTotal}</b> <span style="opacity:.6">(${nPct}%)</span></span>
            </div>` : ""}
          ${p.html}
        </div>`;
      }).join("")}
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`;
  document.querySelector(".modal").classList.add("modal-wide");
  openModal();
}

/* ONBOARDING — shown when mess is new (no members besides admin, no meal data) */
function buildOnboardingChecklist(hasMembersAdded, hasMealsLogged, hasUtilitySet) {
  const step = (done, text, action) => `
    <div class="onboard-step">
      <span style="font-size:16px">${done ? "✅" : "⬜"}</span>
      <span style="${done ? "color:var(--text3);text-decoration:line-through" : ""}">${text}</span>
      ${!done && action ? `<button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="${action}">Go →</button>` : ""}
    </div>`;
  return `
    <div class="onboard-wrap">
      <div class="onboard-title">👋 Welcome to your new mess!</div>
      <div class="onboard-sub">Complete these steps to get started.</div>
      ${step(hasMembersAdded, "Add your first member", "navigate('members')")}
      ${step(hasMealsLogged, "Log today's meals", "navigate('meals')")}
      ${step(hasUtilitySet, "Set up this month's utility bills", "navigate('utility')")}
    </div>`;
}
