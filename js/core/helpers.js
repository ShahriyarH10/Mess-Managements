/* ═══════════════════════════════════════════════
   CORE — Helpers: utils, theme, session, modal, toast
   ═══════════════════════════════════════════════ */
const today      = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`; };
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
  if (i) i.type = i.type === "password" ? "text" : "password";
}

/* SESSION */
function saveSession(u, m) {
  currentUser = u; currentMess = m;
  const payload = { u, m, exp: Date.now() + SESSION_TTL_MS };
  const s = JSON.stringify(payload);
  localStorage.setItem("mm_session", s);
  sessionStorage.setItem("mm_session", s);
}
function loadSession() {
  try {
    const raw = localStorage.getItem("mm_session") || sessionStorage.getItem("mm_session");
    if (!raw) return;
    const payload = JSON.parse(raw);
    if (!payload.exp || Date.now() > payload.exp) {
      clearSession();
      return;
    }
    if (payload.u) currentUser = payload.u;
    if (payload.m) currentMess = payload.m;
  } catch (e) { currentUser = null; currentMess = null; }
}
function clearSession() {
  currentUser = null; currentMess = null; members = [];
  localStorage.removeItem("mm_session");
  sessionStorage.removeItem("mm_session");
  // Legacy keys cleanup
  localStorage.removeItem("mm_user"); localStorage.removeItem("mm_mess");
  sessionStorage.removeItem("mm_user"); sessionStorage.removeItem("mm_mess");
}

/* ROLE GUARD — call at top of every manager-only write function */
function requireManager(fnName) {
  if (!currentUser) {
    console.warn(`[Security] ${fnName} blocked — not logged in`);
    toast("Not authenticated", "error");
    return false;
  }
  if (currentUser.role !== "manager" && currentUser.role !== "superadmin") {
    console.warn(`[Security] ${fnName} blocked — insufficient role: ${currentUser.role}`);
    toast("Manager access required", "error");
    return false;
  }
  return true;
}

/* MODAL & TOAST */
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
  const day = Number(mealsObj?.[memberName + "_day"] || 0);
  const night = Number(mealsObj?.[memberName + "_night"] || 0);
  const legacy = Number(mealsObj?.[memberName] || 0);
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

/* Month navigation — single canonical definitions */
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
  ║                                                                  ║
  ║  For settlement month M (e.g. May 2026):                        ║
  ║                                                                  ║
  ║  POSTPAID — data from previous month (April 2026):              ║
  ║    • Meal cost   = member meals × (total bazar / total meals)   ║
  ║    • Khala share = April khala bill ÷ members                   ║
  ║    • Other share = April other cost ÷ members                   ║
  ║                                                                  ║
  ║  PREPAID — data from current month (May 2026):                  ║
  ║    • Room rent                                                   ║
  ║    • Elec + Gas + WiFi share                                    ║
  ║                                                                  ║
  ║  CREDITS (deducted):                                            ║
  ║    • Bazar credit  = member's own bazar spending (April)        ║
  ║    • Utility paid  = advance utility payment (May record)       ║
  ║                                                                  ║
  ║  Net payable = meal cost + khala + other + rent + prepaid util  ║
  ║              − bazar credit − utility paid                      ║
  ╚══════════════════════════════════════════════════════════════════╝
*/
function calcSettlementTotals(allMeals, allBazar, sourceKey) {
  const mealRows  = (allMeals  || []).filter(r => String(r.date || "").startsWith(sourceKey));
  const bazarRows = (allBazar  || []).filter(r => String(r.date || "").startsWith(sourceKey));

  const memberMeals = {};
  const memberBazar = {};
  members.forEach(m => { memberMeals[m.name] = 0; memberBazar[m.name] = 0; });

  let totalMeals = 0;
  let totalBazar = 0;

  mealRows.forEach(row => {
    members.forEach(m => {
      const v = mealTotalFromObj(row.meals || {}, m.name);
      memberMeals[m.name] = round2(memberMeals[m.name] + v);
      totalMeals += v;
    });
  });

  bazarRows.forEach(row => {
    members.forEach(m => {
      const v = Number((row.bazar || {})[m.name] || 0);
      memberBazar[m.name] = round2(memberBazar[m.name] + v);
      totalBazar += v;
    });
  });

  const mealRate = totalMeals > 0 ? round2(totalBazar / totalMeals) : 0;

  return {
    totalMeals: round2(totalMeals),
    totalBazar: round2(totalBazar),
    mealRate,
    memberMeals,
    memberBazar,
  };
}

function calcMemberSettlement(
  member,
  allMeals,
  allBazar,
  currentRentRec,
  currentUtilRec,
  previousUtilRec,
  settlementKey
) {
  const settlementMonth = monthIndexFromKey(settlementKey);
  const settlementYear  = yearFromKey(settlementKey);
  const sourceKey       = calcSettlementSourceKey(settlementMonth, settlementYear);
  const prevMonthInfo   = previousMonth(settlementMonth, settlementYear);

  const totals      = calcSettlementTotals(allMeals, allBazar, sourceKey);
  const memberMeals = round2(totals.memberMeals[member.name] || 0);
  const memberBazar = round2(totals.memberBazar[member.name] || 0);
  const mealCost    = round2(memberMeals * totals.mealRate);

  const rentEntry    = currentRentRec?.entries?.find(e => e.name === member.name) || {};
  const roomRent     = Number(rentEntry.rent || 0);
  const roomRentPaid = Number(rentEntry.paid || 0);

  const memberCount    = members.length || 1;
  const prepaidTotal   = utilTotalFromBills(currentUtilRec?.bills || {}, UTIL_PREPAID_KEYS);
  const prepaidUtility = round2(prepaidTotal / memberCount);

  const khalaTotal      = Number(previousUtilRec?.bills?.khala || 0);
  const otherTotal      = Number(previousUtilRec?.bills?.other || 0);
  const khalaShare      = round2(khalaTotal / memberCount);
  const otherShare      = round2(otherTotal / memberCount);
  const postpaidUtility = round2(khalaShare + otherShare);

  const utilPayment = (currentUtilRec?.payments || {})[member.name] || {};
  const utilityPaid = Number(utilPayment.paid || 0);
  // Cash collected against the meal portion (mealCost − bazarCredit). Stored
  // alongside the utility payment record because utility_payments is the
  // per-month settlement record. Default 0 for legacy data.
  const mealPaid    = Number(utilPayment.meal_paid || 0);

  // Meal balance owed to the mess for this member: mealCost − bazarCredit.
  // Positive → member owes; negative → member is owed back.
  const mealBalance = round2(mealCost - memberBazar);

  // Carry-forward credit: combines two sources stored in THIS month's bills:
  //   mess_credit   — from the Mess Owes drawdown (negative netPayable path)
  //   change_credit — from overpayment change carry-forward
  const bills = currentUtilRec?.bills || {};
  const messCredit = round2(
    Number((bills.mess_credit   || {})[member.name] || 0) +
    Number((bills.change_credit || {})[member.name] || 0)
  );

  const totalPay   = round2(mealCost + roomRent + prepaidUtility + postpaidUtility);
  // Deduct credits: bazar bought, utility paid, rent paid, meal_paid, and
  // any carry-forward credit from the previous month.
  const netPayable = round2(totalPay - memberBazar - utilityPaid - roomRentPaid - mealPaid - messCredit);

  return {
    memberName: member.name,
    settlementKey,
    sourceKey,
    prevMonthInfo,

    totalMeals: totals.totalMeals,
    totalBazar: totals.totalBazar,
    mealRate:   totals.mealRate,

    memberMeals,
    memberBazar,
    mealCost,

    roomRent,
    roomRentPaid,

    prepaidTotal,
    prepaidUtility,
    khalaTotal,
    otherTotal,
    khalaShare,
    otherShare,
    postpaidUtility,

    utilityPaid,
    utilityStatus: utilPayment.status || "unpaid",
    rentStatus:    rentEntry.status || "unpaid",

    mealBalance,
    messCredit,
    mealPaid,

    totalPay,
    netPayable,
  };
}

function buildMonthOptions(selectedMonth, selectedYear, yearsBack = 3, yearsForward = 2) {
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

/* Grid of month-cards for meal history. Optionally pass `allMeals` to enrich
   each card with month-level stats (total meals, active days, top eater).
   Falls back to chip-style buttons when allMeals is absent. */
function buildMealMonthButtons(keys, onClickName, allMeals) {
  if (!keys.length) return '<div class="empty" style="padding:18px">No meal months yet</div>';

  if (!allMeals) {
    // Legacy fallback (no enrichment available)
    return `<div class="meal-month-list">${keys.map(k => `<button class="meal-month-chip" onclick="${onClickName}('${k}')"><span>${monthLabelFromKey(k)}</span><small>View history</small></button>`).join("")}</div>`;
  }

  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
    ${keys.map(k => {
      const rows = (allMeals || []).filter(r => String(r.date || "").startsWith(k));
      let total = 0, activeDays = 0;
      const perMember = {}; members.forEach(m => { perMember[m.name] = 0; });
      rows.forEach(r => {
        let dayTotal = 0;
        members.forEach(m => {
          const v = mealTotalFromObj(r.meals || {}, m.name);
          perMember[m.name] += v; dayTotal += v;
        });
        if (dayTotal > 0) activeDays++;
        total += dayTotal;
      });
      const top = Object.entries(perMember).sort((a, b) => b[1] - a[1])[0];
      const isTop = top && top[1] > 0;
      const avg = activeDays > 0 ? round2(total / activeDays) : 0;

      return `
        <button onclick="${onClickName}('${k}')" class="profile-card" style="
          all:unset;cursor:pointer;
          padding:13px 13px 11px;
          border:1px solid var(--border);
          border-radius:var(--radius);
          background:var(--bg2);
          display:flex;flex-direction:column;gap:8px;
          transition:transform .15s, border-color .15s
        " onmouseover="this.style.borderColor='var(--accent)';this.style.transform='translateY(-2px)'"
           onmouseout="this.style.borderColor='var(--border)';this.style.transform='translateY(0)'">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
            <div style="font-family:var(--font-serif);font-size:15px;font-weight:700;line-height:1.1">
              ${monthLabelFromKey(k)}
            </div>
            <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">${activeDays} day${activeDays===1?"":"s"}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <div style="background:var(--bg3);border-radius:5px;padding:6px 8px">
              <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">🍽 Meals</div>
              <div style="font-size:15px;font-weight:700;margin-top:1px">${round2(total)}</div>
            </div>
            <div style="background:var(--bg3);border-radius:5px;padding:6px 8px">
              <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Avg/day</div>
              <div style="font-size:15px;font-weight:700;margin-top:1px">${avg}</div>
            </div>
          </div>
          ${isTop ? `
            <div style="font-size:11px;color:var(--text2);line-height:1.3">
              🥇 Top eater:&nbsp;<b style="color:var(--accent)">${top[0]}</b>
              <span style="color:var(--text3)">· ${round2(top[1])} meals</span>
            </div>
          ` : `<div style="font-size:11px;color:var(--text3)">No meal data yet</div>`}
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
    if (entry.total > 0) {
      active++;
      total      += entry.total;
      dayTotal   += entry.day;
      nightTotal += entry.night;
    }
    return `<div class="meal-day ${entry.total > 0 ? "has-meal" : ""}">
      <div class="meal-day-num">${i + 1}</div>
      <div class="meal-day-total">${entry.total > 0 ? entry.total : "—"}</div>
      ${entry.total > 0 ? `<div class="meal-day-meta">D ${entry.day} · N ${entry.night}</div>` : `<div class="meal-day-meta">No meal</div>`}
    </div>`;
  }).join("");
  return {
    html: `<div class="meal-calendar">${cells}</div>`,
    total: round2(total),
    active,
    dayTotal:   round2(dayTotal),
    nightTotal: round2(nightTotal),
  };
}

async function openMemberMealMonth(memberName, key) {
  const allMeals = await dbGetAll("meals");
  const cal      = buildMemberMealCalendar(memberName, allMeals, key);
  const modal    = document.getElementById("modal-content");
  modal.innerHTML = `
    <div class="modal-title">${memberName} — ${monthLabelFromKey(key)}</div>
    <div class="modal-sub">Colored days mean this member has a meal entry on that date.</div>
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

  // Build per-member calendars + totals
  const perMember = members.map(m => {
    const cal = buildMemberMealCalendar(m.name, allMeals, key);
    return { name: m.name, ...cal };
  });

  // Mess-wide stats
  const grandMeals = round2(perMember.reduce((s, p) => s + p.total, 0));
  const grandDays  = perMember.reduce((s, p) => Math.max(s, p.active), 0); // active member-day max as a hint

  const modal = document.getElementById("modal-content");
  modal.innerHTML = `
    <div class="modal-title">All Members — ${monthLabel}</div>
    <div class="modal-sub">Each member's monthly meal calendar. Highlighted days show meal entries with day/night split.</div>

    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat-card"><div class="stat-label">Total meals (mess)</div><div class="stat-value">${grandMeals}</div></div>
      <div class="stat-card"><div class="stat-label">Members</div><div class="stat-value">${members.length}</div></div>
      <div class="stat-card"><div class="stat-label">Most active days</div><div class="stat-value">${grandDays}</div></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
      ${perMember.map((p, i) => {
        const col = avatarCol(i);
        const dim = p.total === 0;
        const dPct = p.total > 0 ? Math.round((p.dayTotal   / p.total) * 100) : 0;
        const nPct = p.total > 0 ? 100 - dPct : 0;
        return `
          <div class="card mc-compact" style="padding:14px;${dim ? 'opacity:.55' : ''};border-color:${p.total>0?'var(--accent)':'var(--border)'}">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
              <div class="avatar" style="background:${col.bg};color:${col.fg};width:34px;height:34px;font-size:12px;flex-shrink:0">${initials(p.name)}</div>
              <div style="min-width:0;flex:1">
                <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
                <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">${monthLabel}</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
              <div class="stat-card" style="padding:8px 10px">
                <div class="stat-label" style="font-size:10px">Total meals</div>
                <div style="font-size:18px;font-weight:700;color:${p.total>0?'var(--green)':'var(--text3)'}">${p.total}</div>
              </div>
              <div class="stat-card" style="padding:8px 10px">
                <div class="stat-label" style="font-size:10px">Meal days</div>
                <div style="font-size:18px;font-weight:700">${p.active}</div>
              </div>
            </div>

            ${p.total > 0 ? `
              <div class="dn-split-bar" title="Day vs Night meal split">
                <div class="dn-d" style="width:${dPct}%"></div>
                <div class="dn-n" style="width:${nPct}%"></div>
              </div>
              <div class="dn-split-row">
                <span>☀ Day &nbsp;<b class="d-val">${p.dayTotal}</b> <span style="opacity:.6">(${dPct}%)</span></span>
                <span>🌙 Night &nbsp;<b class="n-val">${p.nightTotal}</b> <span style="opacity:.6">(${nPct}%)</span></span>
              </div>
            ` : ""}

            ${p.html}
          </div>`;
      }).join("")}
    </div>

    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`;
  document.querySelector(".modal").classList.add("modal-wide");
  openModal();
}
