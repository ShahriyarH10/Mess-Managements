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
  let p;
  if (typeof idOrIndex === "number") p = PALETTE[((idOrIndex % PALETTE.length) + PALETTE.length) % PALETTE.length];
  else {
    let h = 0;
    const s = String(idOrIndex);
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    p = PALETTE[Math.abs(h) % PALETTE.length];
  }
  // a translucent tint of the member's colour reads well on dark and light backgrounds
  return { bg: p.fg + "2e", fg: p.fg };
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


/* THEME — storage can throw (private mode / blocked cookies): fall back to dark */
function loadTheme() {
  let t = "dark";
  try { t = localStorage.getItem("mm_theme") || "dark"; } catch (_) {}
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
}
function toggleTheme() {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("mm_theme", next); } catch (_) {}
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

/* OVERLAY CLOSE ANIMATION — `.open` is removed at once (so state checks stay instant),
   while `.closing` keeps the overlay painted for its exit animation (css/09-fx.css). */
const CLOSE_MS = 240;
function animateClose(el) {
  if (!el) return;
  const wasOpen = el.classList.contains("open");
  el.classList.remove("open");
  if (!wasOpen || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  clearTimeout(el._closeT);
  el.classList.add("closing");
  el._closeT = setTimeout(() => el.classList.remove("closing"), CLOSE_MS);
}
function cancelClose(el) {
  if (!el) return;
  clearTimeout(el._closeT);
  el.classList.remove("closing");
}

/* LANDING PAGE MOBILE DRAWER */
function openLandingDrawer() {
  const d = document.getElementById("land-mobile-drawer");
  cancelClose(d); d.classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeLandingDrawer() {
  animateClose(document.getElementById("land-mobile-drawer"));
  document.body.style.overflow = "";
}

/* SESSION — one per world. live: localStorage (30 days) · sandbox: sessionStorage (tab lifetime).
   Loading is done by Router.selectWorld(). */
function saveSession(u, m, jwt = null) {
  currentUser = u; currentMess = m;
  const demo = MM_MODE === "demo";
  const payload = { u, m, jwt, exp: Date.now() + SESSION_TTL_MS };
  try {
    (demo ? sessionStorage : localStorage).setItem(demo ? DEMO_SESSION_KEY : SESSION_KEY, JSON.stringify(payload));
  } catch (_) { /* storage blocked — session lives in memory for this page only */ }
}
// Clears only the ACTIVE world's session, so leaving the sandbox never signs you out of a real
// account in the same browser (and vice-versa).
function clearSession() {
  currentUser = null; currentMess = null; members = [];
  try {
    if (MM_MODE === "demo") sessionStorage.removeItem(DEMO_SESSION_KEY);
    else { localStorage.removeItem(SESSION_KEY); localStorage.removeItem("mm_user"); localStorage.removeItem("mm_mess"); }
  } catch (_) {}
}

/* ROLE GUARD */
// Actions only the full manager can do — never sub_manager
const FULL_MANAGER_ONLY_FNS = new Set([
  "addMember", "updateMember", "deleteMember", "openLeavingFlow",
  "openManagerResetPasswordModal", "doManagerResetPassword",
  "setSubManager",
  "toggleMonthLock",
  "saveMessRules",
  "saveFundEntry", "deleteFundEntry",
  "doTransferRole",
]);

function requireManager(fnName) {
  if (!currentUser) {
    console.warn(`[Security] ${fnName} blocked — not logged in`);
    toast("Not authenticated", "error");
    return false;
  }
  const isManager    = currentUser.role === "manager";
  const isSubManager = currentUser.role === "sub_manager";

  if (!isManager && !isSubManager) {
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
function openModal() {
  const bg = document.getElementById("modal-bg"), m = bg.querySelector(".modal");
  cancelClose(bg);
  clearTimeout(m?._widthT);
  if (m) m.style.width = "";
  bg.classList.add("open");
}
function closeModal() {
  const bg = document.getElementById("modal-bg"), m = bg.querySelector(".modal");
  if (m) {
    // keep the current width while it animates out, so a wide modal doesn't snap narrow
    if (bg.classList.contains("open")) m.style.width = m.offsetWidth + "px";
    m.classList.remove("modal-wide");
    clearTimeout(m._widthT);
    m._widthT = setTimeout(() => { m.style.width = ""; }, CLOSE_MS);
  }
  animateClose(bg);
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
      <button class="btn btn-ghost" data-on-click="closeConfirm()">Cancel</button>
      <button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="confirm-ok-btn">${escapeHtml(confirmLabel)}</button>
    </div>`;
  document.getElementById("confirm-ok-btn").onclick = () => { closeConfirm(); onConfirm(); };
  cancelClose(bg);
  bg.classList.add("open");
}
function closeConfirm() {
  animateClose(document.getElementById("confirm-bg"));
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

/* Outstanding net due carried forward from ALL past unpaid settlements —
   not just the single immediately-previous month. Walks backward from
   settlementKey through every month that has settlement data, accumulating
   each month's own unpaid balance minus whatever was later paid down
   against it (payments[name].prev_due_paid in the following month's record).
   Without this walk, a member who misses two or more months in a row would
   only ever see the most recent month's shortfall — older debt would
   silently disappear from the Log, Collect, Dashboard, and Profile pages.

   Deliberately does NOT use the rent/utility "status" text field to decide
   whether a month is settled. That field is set once (either manually or
   by the auto-status logic in Collect Payments, which compares against
   whatever the bill total was AT THAT MOMENT) and is never revisited if
   the bills are edited afterward — and bill entry is split across separate
   "Save prepaid bills" / "Save postpaid bills" actions, so editing bills
   after a payment was already recorded and marked "paid" is a completely
   normal sequence, not an edge case. Trusting status here previously let
   a stale "paid" flag zero out a real, freshly-computed balance. The
   Math.max(0, ...) floor below already correctly reduces a genuinely
   fully-paid month's contribution to 0 without needing the status field. */
function calcPrevDueForMember(member, allMeals, allBazar, allRent, allUtil, settlementKey, maxLookback = 24) {
  const rentByKey = {}; (allRent || []).forEach(r => { if (r) rentByKey[r.month_key] = r; });
  const utilByKey = {}; (allUtil || []).forEach(u => { if (u) utilByKey[u.month_key] = u; });

  // Always include the immediately previous month — even if it has no
  // rent record yet (manager may have entered utility bills only so far).
  const immPrev = previousMonthFromKey(settlementKey).key;
  const chain = [immPrev];

  // Walk further back through months with a rent record — the reliable
  // indicator that a month had an actual settlement.
  let k = previousMonthFromKey(immPrev).key;
  let hops = 0;
  while (hops < maxLookback && rentByKey[k]) {
    chain.unshift(k);
    k = previousMonthFromKey(k).key;
    hops++;
  }
  chain.push(settlementKey);
  // chain is now [oldest..., immPrev, settlementKey] — always ≥ 2 entries

  let carry = 0;
  for (let i = 1; i < chain.length; i++) {
    const cur  = chain[i];
    const prev = chain[i - 1];
    const rentPrevRec     = rentByKey[prev] || null;
    const utilPrevRec     = utilByKey[prev] || null;
    const utilPrevPrevRec = utilByKey[previousMonthFromKey(prev).key] || null;

    const netOwnPrev = calcMemberSettlement(member, allMeals, allBazar, rentPrevRec, utilPrevRec, utilPrevPrevRec, prev).netPayable;
    const prevDuePaidThisStep = round2(Number((utilByKey[cur]?.payments || {})[member.name]?.prev_due_paid || 0));

    carry = round2(Math.max(0, carry + netOwnPrev - prevDuePaidThisStep));
  }
  return carry;
}

/* Priority-ordered split: Rent → Util → Meal.
   Fills each bucket fully before moving to the next.
   Excess (amount > totalRem) → change.
   Negative mealRem (bazar surplus) is clamped to 0 —
   the surplus is already baked into netPayable so the
   member simply pays less. */
/* Priority order: prevDue (old debt) → Rent → Util → Meal */
function computeSplit3(amount, mealRem, utilRem, rentRem, prevDue = 0) {
  amount   = Math.max(0, round2(amount  || 0));
  const m  = Math.max(0, round2(mealRem || 0));
  const u  = Math.max(0, round2(utilRem || 0));
  const r  = Math.max(0, round2(rentRem || 0));
  const pd = Math.max(0, round2(prevDue || 0));
  const totalRem = round2(m + u + r + pd);

  if (amount <= 0)        return { allocMeal: 0, allocUtil: 0, allocRent: 0, allocPrevDue: 0, change: 0 };
  if (totalRem <= 0)      return { allocMeal: 0, allocUtil: 0, allocRent: 0, allocPrevDue: 0, change: amount };
  if (amount >= totalRem) return { allocMeal: m, allocUtil: u, allocRent: r, allocPrevDue: pd, change: round2(amount - totalRem) };

  let remaining = amount;

  const allocPrevDue = round2(Math.min(remaining, pd));
  remaining = round2(remaining - allocPrevDue);

  const allocRent = round2(Math.min(remaining, r));
  remaining = round2(remaining - allocRent);

  const allocUtil = round2(Math.min(remaining, u));
  remaining = round2(remaining - allocUtil);

  const allocMeal = round2(Math.min(remaining, m));

  return { allocMeal, allocUtil, allocRent, allocPrevDue, change: 0 };
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

/* ═══════════════════════════════════════════
   MEMBER PHOTOS — stored as a small JPEG data: URL in members.photo
═══════════════════════════════════════════ */
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const isPhoto = p => typeof p === "string" && p.length <= 60000 && PHOTO_RE.test(p);

/* Avatar contents for a member: their photo, else collision-aware initials. */
function avFace(id, name) {
  const m = (typeof members !== "undefined" ? members : []).find(x => x.id === id);
  return m && isPhoto(m.photo) ? `<img class="av-img" src="${m.photo}" alt="" loading="lazy" decoding="async"/>` : memberInitials(id, name);
}
/* Same, looked up by display name (audit log actors, etc.). */
function avFaceByName(name) {
  const m = (typeof members !== "undefined" ? members : []).find(x => x.name === name);
  return m ? avFace(m.id, m.name) : initials(name || "?");
}

/* Inline background/foreground for a member's avatar circle, by name. */
function avStyle(name) {
  const list = typeof members !== "undefined" ? members : [];
  const i = list.findIndex(x => x.name === name);
  const c = avatarCol(i >= 0 ? i : 0);
  return `background:${c.bg};color:${c.fg}`;
}

/* Read an image file → centre-cropped 160×160 JPEG data: URL (≤ ~25 KB).
   FileReader (not blob: URLs) because the CSP only allows data: images. */
function compressMemberPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Choose an image file (JPG, PNG or WebP)"));
    if (file.size > 15 * 1024 * 1024) return reject(new Error("That image is too large (max 15 MB)"));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Couldn't read that file"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("This image format isn't supported here — try a JPG or PNG"));
      img.onload = () => {
        const S = 160, side = Math.min(img.naturalWidth, img.naturalHeight);
        const c = document.createElement("canvas");
        c.width = c.height = S;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, S, S);           // transparent PNGs → white, not black
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, S, S);
        let q = 0.86, out = c.toDataURL("image/jpeg", q);
        while (out.length > 25000 && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
        isPhoto(out) ? resolve(out) : reject(new Error("Couldn't process that image"));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* Dashboard sparkline (manager + member): draws itself in via stroke-dashoffset
   (css/09-fx.css) over a soft area. Styles: .dk-spark* in css/05-components.css. */
function buildSparkline(values, color, opts) {
  const v = values.length > 1 ? values : [0, ...(values.length ? values : [0])];
  // fit: scale to the values' own range (for rates that never go near 0)
  const fit = opts && opts.fit;
  const W = 120, H = 34;
  let max = fit ? Math.max(...v) : Math.max(...v, 1), min = fit ? Math.min(...v) : Math.min(...v, 0);
  if (fit) { const pad = (max - min) * 0.2 || Math.abs(max) * 0.05 || 1; max += pad; min -= pad; }
  const pts = v.map((y, i) => [(i / (v.length - 1)) * W, H - 3 - ((y - min) / (max - min || 1)) * (H - 6)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const last = pts[pts.length - 1];
  return `<svg class="dk-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path class="dk-spark-area" d="${line} L${W} ${H} L0 ${H} Z" fill="${color}"/>
    <path class="dk-spark-line" d="${line}" stroke="${color}" pathLength="1"/>
    <circle class="dk-spark-dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.6" fill="${color}"/>
  </svg>`;
}

/* ═══════════════════════════════════════════
   MONTH HISTORY — Meal Entry, Bazar Entry, member Meal Log
   One fetch per table feeds a page's recent-entries table, its month cards
   and the month calendars. Pages pass refresh=true when they render and after
   every save/delete; month pop-ups reuse the rows already loaded.
═══════════════════════════════════════════ */
const _historyRows = {};
function historyRows(table, refresh) {
  const k = messId() + ":" + table;
  if (refresh || !_historyRows[k]) {
    _historyRows[k] = dbGetAll(table).catch(e => { delete _historyRows[k]; throw e; });
  }
  return _historyRows[k];
}

const MONTH_HISTORY_MAX   = 24;  // months kept in the grid
const MONTH_HISTORY_FIRST = 6;   // shown before "Show older"

/* Rows → [{ key, total, days, perName, daysByName }] newest first, in one pass.
   valueOf(row) → { name: amount }  (one entry per member for that day). */
function summarizeMonths(rows, valueOf) {
  const by = new Map();
  (rows || []).forEach(r => {
    const key = String(r.date || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    let g = by.get(key);
    if (!g) by.set(key, g = { key, total: 0, days: 0, perName: {}, daysByName: {} });
    let day = 0;
    Object.entries(valueOf(r) || {}).forEach(([name, v]) => {
      const n = Number(v) || 0;
      if (!n) return;
      g.perName[name] = (g.perName[name] || 0) + n;
      g.daysByName[name] = (g.daysByName[name] || 0) + 1;
      day += n;
    });
    if (day > 0) { g.total += day; g.days++; }
  });
  const cur = monthKey(new Date().getFullYear(), new Date().getMonth());
  if (!by.has(cur)) by.set(cur, { key: cur, total: 0, days: 0, perName: {}, daysByName: {} });
  return [...by.values()].sort((a, b) => b.key.localeCompare(a.key)).slice(0, MONTH_HISTORY_MAX);
}

/* Per-member meal totals of one meals row (handles the day/night split). */
function mealsByMember(r) {
  const o = {};
  members.forEach(m => { o[m.name] = mealMemberTotal(r.meals || {}, m.name); });
  return o;
}

/* Month cards. opts: { onClick, money, memberName, id, emptyText } */
function buildMonthHistory(months, opts) {
  const { onClick, money = false, memberName = null, id = "mh", emptyText = "No months yet" } = opts;
  if (!months.length || months.every(m => !m.total)) return `<div class="empty" style="padding:18px">${emptyText}</div>`;
  const cur = monthKey(new Date().getFullYear(), new Date().getMonth());
  const val  = m => memberName ? round2(m.perName[memberName] || 0) : round2(m.total);
  const days = m => memberName ? (m.daysByName[memberName] || 0) : m.days;
  // trend compares the average per active day, so a month still in progress isn't always "down"
  const pace = m => days(m) > 0 ? val(m) / days(m) : 0;
  const fmtV = v => money ? fmtTk(v) : String(round2(v));
  const max = Math.max(1, ...months.map(val));

  const cards = months.map((m, i) => {
    const v = val(m), prev = months[i + 1], d = days(m);
    const pv = prev ? pace(prev) : 0;
    const trend = prev && pv > 0 && d > 0 ? Math.round(((pace(m) - pv) / pv) * 100) : null;
    const top = Object.entries(m.perName).sort((a, b) => b[1] - a[1])[0];
    const share = memberName && m.total > 0 ? Math.round((v / m.total) * 100) : null;
    const avg = d > 0 ? round2(v / d) : 0;
    return `
    <button class="mh-card${m.key === cur ? " mh-cur" : ""}${i >= MONTH_HISTORY_FIRST ? " mh-older" : ""}" data-on-click="${onClick}('${m.key}')">
      <div class="mh-head">
        <span class="mh-month">${monthLabelFromKey(m.key)}</span>
        ${m.key === cur ? `<span class="mh-tag">This month</span>` : ""}
      </div>
      <div class="mh-val">${fmtV(v)}${!money ? `<small> meals</small>` : ""}</div>
      <div class="mh-bar"><i style="width:${Math.round((v / max) * 100)}%"></i></div>
      <div class="mh-meta">
        <span>${d} day${d === 1 ? "" : "s"} · ${fmtV(avg)}/day</span>
        ${trend == null ? "" : `<span class="${!money ? "" : trend > 0 ? "mh-up" : trend < 0 ? "mh-down" : ""}" title="Average per day vs previous month">${trend > 0 ? "↑" : trend < 0 ? "↓" : "→"} ${Math.abs(trend)}%</span>`}
      </div>
      <div class="mh-foot">${
        memberName
          ? (share != null ? `${share}% of ${fmtV(m.total)} mess ${money ? "total" : "meals"}` : "No mess data yet")
          : top && top[1] > 0 ? `${money ? "🥇 " : "Top: "}<b>${escapeHtml(_unescapeName(top[0]))}</b> · ${fmtV(top[1])}` : "No entries yet"
      }</div>
    </button>`;
  }).join("");

  const older = Math.max(0, months.length - MONTH_HISTORY_FIRST);
  return `<div class="mh-grid" id="${id}">${cards}</div>
    ${older ? `<button class="btn btn-ghost btn-sm mh-more" data-on-click="toggleMonthHistory('${id}', this)">Show ${older} older month${older === 1 ? "" : "s"}</button>` : ""}`;
}

/* Member names come back HTML-escaped in members[] but raw as JSON keys; show them once-escaped. */
function _unescapeName(s) {
  return String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

function toggleMonthHistory(id, btn) {
  const grid = document.getElementById(id);
  if (!grid) return;
  const open = grid.classList.toggle("mh-all");
  const n = grid.querySelectorAll(".mh-older").length;
  if (btn) btn.textContent = open ? "Show fewer" : `Show ${n} older month${n === 1 ? "" : "s"}`;
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
  const allMeals = await historyRows("meals");
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
    <div class="modal-footer"><button class="btn btn-ghost" data-on-click="closeModal()">Close</button></div>`;
  document.querySelector(".modal").classList.remove("modal-wide");
  openModal();
}

async function openManagerMealMonth(key) {
  // only this month's rows: each member's calendar would otherwise re-scan the whole table
  const allMeals = (await historyRows("meals")).filter(r => String(r.date || "").startsWith(key));
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
            <div class="avatar" style="background:${col.bg};color:${col.fg};width:34px;height:34px;font-size:12px;flex-shrink:0">${avFace(p.id, p.name)}</div>
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
    <div class="modal-footer"><button class="btn btn-ghost" data-on-click="closeModal()">Close</button></div>`;
  document.querySelector(".modal").classList.add("modal-wide");
  openModal();
}

/* ONBOARDING — shown when mess is new (no members besides admin, no meal data) */
function buildOnboardingChecklist(hasMembersAdded, hasMealsLogged, hasUtilitySet) {
  const step = (done, text, action) => `
    <div class="onboard-step">
      <span style="font-size:16px">${done ? "✅" : "⬜"}</span>
      <span style="${done ? "color:var(--text3);text-decoration:line-through" : ""}">${text}</span>
      ${!done && action ? `<button class="btn btn-ghost btn-sm" style="margin-left:auto" data-on-click="${action}">Go →</button>` : ""}
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
