/* ═══════════════════════════════════════════════
   MEMBER — Dashboard: settlement stats, today's meals
   ═══════════════════════════════════════════════ */
async function getMe() { return members.find(m => m.id === currentUser.memberId) || null; }

async function renderMyDashboard(el) {
  const member = await getMe();
  if (!member) {
    el.innerHTML = '<div class="content"><div class="empty">Could not load your profile.</div></div>';
    return;
  }

  const { month, year } = thisMonth();
  const key     = monthKey(year, month);
  const prevInfo = previousMonth(month, year);
  const prevKey  = prevInfo.key;

  const [
    allMeals,
    allBazar,
    allRent,
    { data: allUtil },
    rentRec,
    curUtilRes,
    prevUtilRes,
  ] = await Promise.all([
    dbGetAll("meals"),
    dbGetAll("bazar"),
    dbGetAll("rent"),
    sb.from("utility_payments").select("*").eq("mess_id", messId()),
    dbGetMonth("rent", key),
    sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle(),
    sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", prevKey).maybeSingle(),
  ]);

  const utilRec     = curUtilRes.data;
  const prevUtilRec = prevUtilRes.data;

  // Use the canonical settlement calc
  const calc = calcMemberSettlement(member, allMeals, allBazar, rentRec, utilRec, prevUtilRec, key);

  const now = new Date();
  const displayDate = now.getHours() >= 23
    ? new Date(now.getTime() + 24*60*60*1000)
    : now;
  const displayStr = `${displayDate.getFullYear()}-${String(displayDate.getMonth()+1).padStart(2,"0")}-${String(displayDate.getDate()).padStart(2,"0")}`;
  const isNextDay = now.getHours() >= 23;
  const todayRec = allMeals.find(r => r.date === displayStr);
  let todayDay = 0, todayNight = 0;
  if (todayRec) {
    members.forEach(m => {
      const p = mealPartsFromObj(todayRec.meals || {}, m.name);
      todayDay   += p.day;
      todayNight += p.night;
    });
    todayDay   = round2(todayDay);
    todayNight = round2(todayNight);
  }

  let memberBadgesHTML = "";
  if (todayRec) {
    memberBadgesHTML = members.map(m => {
      const p = mealPartsFromObj(todayRec.meals || {}, m.name);
      let badges = "";
      if (p.day   > 0) badges += `<span style="background:var(--blue-bg);color:var(--blue);font-size:10px;padding:1px 5px;border-radius:4px;font-weight:600">D${p.day}</span>`;
      if (p.night > 0) badges += `<span style="background:var(--accent-bg);color:var(--accent);font-size:10px;padding:1px 5px;border-radius:4px;font-weight:600">N${p.night}</span>`;
      return `<div style="display:inline-flex;align-items:center;gap:5px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 10px"><span style="font-size:13px;font-weight:500">${m.name}</span>${badges}</div>`;
    }).join("");
  }

  const netColor = calc.netPayable > 0 ? "var(--red)" : calc.netPayable < 0 ? "var(--green)" : "var(--text)";
  const netLabel = calc.netPayable > 0
    ? "You Pay " + fmtTk(calc.netPayable)
    : calc.netPayable < 0
      ? "You Get " + fmtTk(Math.abs(calc.netPayable))
      : "✓ Settled";

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">My Dashboard</div>
      <div class="page-sub">${MONTHS[month]} ${year} settlement</div>
    </div>
  </div>
  <div class="content">

    <!-- Net due banner -->
    <div style="
      background:var(--bg3);border:1px solid var(--border2);border-radius:var(--radius);
      padding:16px 20px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px
    ">
      <div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">
          Net payable — ${MONTHS[month]} ${year}
        </div>
        <div style="font-size:28px;font-weight:900;color:${netColor}">${netLabel}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">
          Using meals/bazar from ${MONTHS[prevInfo.month]} ${prevInfo.year} + rent/utility from ${MONTHS[month]} ${year}
        </div>
      </div>
      <button class="btn btn-ghost" onclick="showMySettlementBreakdown()" style="font-size:12px">
        📊 See full breakdown
      </button>
    </div>

    <!-- Today's meals -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">${isNextDay ? "Tomorrow" : "Today"} — ${displayStr}</div>
      ${todayRec ? `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-bottom:14px">
          <div style="background:var(--blue-bg);border:1px solid rgba(91,155,213,.2);border-radius:var(--radius-sm);padding:14px;text-align:center">
            <div style="font-size:11px;color:var(--blue);font-weight:600;margin-bottom:6px">Day</div>
            <div style="font-size:20px;font-weight:700;color:var(--blue);line-height:1">${todayDay}</div>
          </div>
          <div style="background:var(--accent-bg);border:1px solid rgba(212,168,83,.2);border-radius:var(--radius-sm);padding:14px;text-align:center">
            <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:6px">Night</div>
            <div style="font-size:20px;font-weight:700;color:var(--accent);line-height:1">${todayNight}</div>
          </div>
          <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;text-align:center">
            <div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:6px">Total</div>
            <div style="font-size:20px;font-weight:700;line-height:1">${round2(todayDay + todayNight)}</div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:7px">${memberBadgesHTML}</div>
      ` : `<div class="empty" style="padding:20px">No meal entry today</div>`}
    </div>

    <!-- ── Embedded mess snapshot (current month) ── -->
    ${buildMessSnapshotBlock(allMeals, allBazar, key)}
  </div>`;

  // Store calc in window for breakdown modal
  window._myDashCalc = calc;
  window._myDashPrevInfo = prevInfo;
}

function showMySettlementBreakdown() {
  const p        = window._myDashCalc;
  const prevInfo = window._myDashPrevInfo;
  if (!p) return;

  const { month, year } = thisMonth();
  const curLabel  = `${MONTHS[month]} ${year}`;
  const prevLabel = `${MONTHS[prevInfo.month]} ${prevInfo.year}`;

  const modal = document.getElementById("modal-content");
  modal.innerHTML = `
    <div class="modal-title">My Settlement Breakdown</div>
    <div class="modal-sub" style="margin-bottom:12px">${curLabel}</div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--red);margin-bottom:6px">
      🔴 Postpaid charges — from ${prevLabel}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:var(--bg3);border-radius:6px;margin-bottom:5px">
      <div>
        <div style="font-weight:600">🍽️ Meal cost</div>
        <div style="font-size:11px;color:var(--text3)">${p.memberMeals} meals × ${fmtTk(p.mealRate)} (total bazar ${fmtTk(p.totalBazar)} ÷ ${p.totalMeals} meals)</div>
      </div>
      <div style="font-weight:700;color:var(--red)">+ ${fmtTk(p.mealCost)}</div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:var(--bg3);border-radius:6px;margin-bottom:5px">
      <div>
        <div style="font-weight:600">👩 Khala bill</div>
        <div style="font-size:11px;color:var(--text3)">${fmtTk(p.khalaTotal)} ÷ ${members.length} members</div>
        ${p.utilityStatus === "paid" ? '<div style="font-size:10px;color:var(--green)">✅ Covered by utility payment</div>' : p.utilityStatus === "partial" ? '<div style="font-size:10px;color:var(--amber)">⚠️ Partially paid</div>' : '<div style="font-size:10px;color:var(--text3)">⏳ Not paid yet</div>'}
      </div>
      <div style="font-weight:700;color:${p.utilityStatus === 'paid' ? 'var(--green)' : 'var(--red)'}">+ ${fmtTk(p.khalaShare)} ${p.utilityStatus === 'paid' ? '✓' : ''}</div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:var(--bg3);border-radius:6px;margin-bottom:5px">
      <div>
        <div style="font-weight:600">📦 Other cost</div>
        <div style="font-size:11px;color:var(--text3)">${fmtTk(p.otherTotal)} ÷ ${members.length} members</div>
        ${p.utilityStatus === "paid" ? '<div style="font-size:10px;color:var(--green)">✅ Covered by utility payment</div>' : p.utilityStatus === "partial" ? '<div style="font-size:10px;color:var(--amber)">⚠️ Partially paid</div>' : '<div style="font-size:10px;color:var(--text3)">⏳ Not paid yet</div>'}
      </div>
      <div style="font-weight:700;color:${p.utilityStatus === 'paid' ? 'var(--green)' : 'var(--red)'}">+ ${fmtTk(p.otherShare)} ${p.utilityStatus === 'paid' ? '✓' : ''}</div>
    </div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--blue);margin:12px 0 6px">
      🔵 Prepaid charges — for ${curLabel}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:var(--bg3);border-radius:6px;margin-bottom:5px">
      <div>
        <div style="font-weight:600">🏠 Room rent</div>
        <div style="font-size:11px;color:var(--text3)">${curLabel}</div>
        ${p.rentStatus === "paid" ? '<div style="font-size:10px;color:var(--green)">✅ Paid</div>' : '<div style="font-size:10px;color:var(--text3)">⏳ Not paid yet</div>'}
      </div>
      <div style="font-weight:700;color:${p.rentStatus === 'paid' ? 'var(--green)' : 'var(--blue)'}">+ ${fmtTk(p.roomRent)} ${p.rentStatus === 'paid' ? '✓' : ''}</div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:var(--bg3);border-radius:6px;margin-bottom:5px">
      <div>
        <div style="font-weight:600">⚡ Utility share (Elec+Gas+WiFi)</div>
        <div style="font-size:11px;color:var(--text3)">${fmtTk(p.prepaidTotal)} ÷ ${members.length} members</div>
        ${p.utilityStatus === "paid" ? '<div style="font-size:10px;color:var(--green)">✅ Covered by utility payment</div>' : p.utilityStatus === "partial" ? '<div style="font-size:10px;color:var(--amber)">⚠️ Partially paid</div>' : '<div style="font-size:10px;color:var(--text3)">⏳ Not paid yet</div>'}
      </div>
      <div style="font-weight:700;color:${p.utilityStatus === 'paid' ? 'var(--green)' : 'var(--blue)'}">+ ${fmtTk(p.prepaidUtility)} ${p.utilityStatus === 'paid' ? '✓' : ''}</div>
    </div>

    <div style="display:flex;justify-content:space-between;padding:9px 12px;background:var(--bg2);border-radius:6px;margin:8px 0;font-weight:700">
      <span>Gross total</span>
      <span>${fmtTk(p.totalPay)}</span>
    </div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--green);margin-bottom:6px">
      ✅ Credits (deducted)
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:rgba(39,174,96,.08);border:1px solid rgba(39,174,96,.2);border-radius:6px;margin-bottom:5px">
      <div>
        <div style="font-weight:600;color:var(--green)">🛒 Bazar credit</div>
        <div style="font-size:11px;color:var(--text3)">Groceries you bought in ${prevLabel}</div>
      </div>
      <div style="font-weight:700;color:var(--green)">− ${fmtTk(p.memberBazar)}</div>
    </div>

    ${p.roomRentPaid > 0 ? `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:rgba(39,174,96,.08);border:1px solid rgba(39,174,96,.2);border-radius:6px;margin-bottom:5px">
        <div>
          <div style="font-weight:600;color:var(--green)">🏠 Rent paid</div>
          <div style="font-size:11px;color:var(--text3)">Room rent already paid for ${curLabel}</div>
        </div>
        <div style="font-weight:700;color:var(--green)">− ${fmtTk(p.roomRentPaid)}</div>
      </div>
    ` : ""}

    ${p.utilityPaid > 0 ? `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:rgba(39,174,96,.08);border:1px solid rgba(39,174,96,.2);border-radius:6px;margin-bottom:5px">
        <div>
          <div style="font-weight:600;color:var(--green)">💳 Utility paid</div>
          <div style="font-size:11px;color:var(--text3)">Covers Elec+Gas+WiFi+Khala+Other in ${curLabel}</div>
          <div style="font-size:10px;color:var(--text3)">Total utility due: ${fmtTk(round2(p.prepaidUtility + p.khalaShare + p.otherShare))}</div>
        </div>
        <div style="font-weight:700;color:var(--green)">− ${fmtTk(p.utilityPaid)}</div>
      </div>
    ` : ""}

    <div style="display:flex;justify-content:space-between;padding:14px 16px;background:var(--accent-bg);border:2px solid var(--accent);border-radius:8px;margin-top:10px;font-size:17px;font-weight:800">
      <span>Net Payable</span>
      <span style="color:${p.netPayable > 0 ? 'var(--red)' : p.netPayable < 0 ? 'var(--green)' : 'var(--text)'}">
        ${p.netPayable > 0 ? 'Pay ' + fmtTk(p.netPayable) : p.netPayable < 0 ? 'Get ' + fmtTk(Math.abs(p.netPayable)) : '✓ Settled'}
      </span>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    </div>
  `;

  document.querySelector(".modal").classList.remove("modal-wide");
  openModal();
}

/* ═══════════════════════════════════════════════════════════════
   MESS SNAPSHOT BLOCK — light, current-month view embedded in the
   member's My Dashboard. Shows mess-wide totals, bazar
   contributors, and member meal totals for the chosen month
   (uses *current* month data, not previous-month settlement basis).
   ═══════════════════════════════════════════════════════════════ */
function buildMessSnapshotBlock(allM, allB, key) {
  const mM = (allM || []).filter(r => String(r.date || "").startsWith(key));
  const mB = (allB || []).filter(r => String(r.date || "").startsWith(key));

  let totalM = 0, totalB = 0;
  const memMeals = {}, memBazar = {};
  members.forEach(m => { memMeals[m.name] = 0; memBazar[m.name] = 0; });

  // Total meals — key-based (name-independent)
  mM.forEach(r => {
    const mObj = r.meals || {}, keys = Object.keys(mObj);
    const hasSplit = keys.some(k => k.endsWith("_day") || k.endsWith("_night"));
    if (hasSplit) keys.forEach(k => { if (k.endsWith("_day") || k.endsWith("_night")) totalM += Number(mObj[k]) || 0; });
    else Object.values(mObj).forEach(v => { totalM += Number(v) || 0; });
    // Per-member
    members.forEach(m => { memMeals[m.name] += mealMemberTotal(mObj, m.name); });
  });
  mB.forEach(r => {
    members.forEach(m => { const v = Number((r.bazar || {})[m.name] || 0); memBazar[m.name] += v; totalB += v; });
  });

  totalM = round2(totalM); totalB = round2(totalB);
  const mealRate = totalM > 0 ? round2(totalB / totalM) : 0;

  // ── Sparkline: daily meals per day this month ──
  const dayMeals = {}; // "DD" -> total
  mM.forEach(r => {
    const dd = String(r.date || "").slice(8, 10);
    if (!dd) return;
    const mObj = r.meals || {}, keys = Object.keys(mObj);
    const hasSplit = keys.some(k => k.endsWith("_day") || k.endsWith("_night"));
    let dayTotal = 0;
    if (hasSplit) keys.forEach(k => { if (k.endsWith("_day") || k.endsWith("_night")) dayTotal += Number(mObj[k]) || 0; });
    else Object.values(mObj).forEach(v => { dayTotal += Number(v) || 0; });
    dayMeals[dd] = (dayMeals[dd] || 0) + dayTotal;
  });
  const dayKeys = Object.keys(dayMeals).sort();
  const maxDayMeal = Math.max(...Object.values(dayMeals), 1);

  // ── Sparkline: cumulative bazar per day ──
  const dayCumB = {}; // "DD" -> cumulative total up to that day
  let runB = 0;
  const bazarByDay = {};
  mB.forEach(r => { const dd = String(r.date || "").slice(8, 10); if (dd) { bazarByDay[dd] = (bazarByDay[dd] || 0) + Object.values(r.bazar || {}).reduce((s, v) => s + (Number(v) || 0), 0); } });
  Object.keys(bazarByDay).sort().forEach(dd => { runB += bazarByDay[dd]; dayCumB[dd] = runB; });
  const bazarDayKeys = Object.keys(dayCumB).sort();
  const maxCumB = Math.max(...Object.values(dayCumB), 1);

  // ── Today's meal card (matches manager view exactly) ──
  const now = new Date();
  const isNextDay = now.getHours() >= 23;
  const displayDate = isNextDay ? new Date(now.getTime() + 86400000) : now;
  const displayStr = `${displayDate.getFullYear()}-${String(displayDate.getMonth()+1).padStart(2,"0")}-${String(displayDate.getDate()).padStart(2,"0")}`;
  const todayRec = allM.find(r => r.date === displayStr);
  let todayDayTotal = 0, todayNightTotal = 0;
  if (todayRec) {
    members.forEach(m => {
      const p = mealPartsFromObj(todayRec.meals || {}, m.name);
      todayDayTotal   += p.day;
      todayNightTotal += p.night;
    });
    todayDayTotal   = round2(todayDayTotal);
    todayNightTotal = round2(todayNightTotal);
  }

  const topB = Object.entries(memBazar).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxB = topB[0]?.[1] || 1;

  // Build sparkline SVG (tiny bar chart)
  function sparkBars(dayKs, dataObj, maxVal, color) {
    if (!dayKs.length) return '<span style="color:var(--text3);font-size:11px">No data yet</span>';
    const W = 160, H = 32, gap = 2;
    const bw = Math.max(2, Math.floor((W - gap * (dayKs.length - 1)) / dayKs.length));
    const bars = dayKs.map((dd, i) => {
      const v = dataObj[dd] || 0;
      const h = Math.max(2, Math.round((v / maxVal) * H));
      const x = i * (bw + gap);
      const y = H - h;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="1" fill="${color}" opacity="${v > 0 ? 0.85 : 0.18}"/>`;
    }).join("");
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;overflow:visible">${bars}</svg>`;
  }

  return `
    <!-- ── Stat cards with sparklines ── -->
    <div class="stat-grid" style="margin-bottom:14px">
      <div class="stat-card stat-card-sparkline" style="border-top:3px solid var(--accent);padding:16px 14px">
        <div class="stat-label" style="display:flex;align-items:center;gap:5px">🍽️ Total meals</div>
        <div class="stat-value" style="font-size:22px;margin-top:6px;color:var(--accent)">${totalM}</div>
        <div style="margin-top:8px;overflow:hidden">${sparkBars(dayKeys, dayMeals, maxDayMeal, "var(--accent)")}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px">${mM.length} day${mM.length===1?"":"s"} logged</div>
      </div>
      <div class="stat-card stat-card-sparkline" style="border-top:3px solid var(--blue);padding:16px 14px">
        <div class="stat-label" style="display:flex;align-items:center;gap:5px">📊 Meal rate</div>
        <div class="stat-value" style="font-size:20px;margin-top:6px;color:var(--blue)">${fmtTk(mealRate)}</div>
        <div style="margin-top:8px">
          ${totalM > 0 ? `
            <div style="background:var(--blue-bg);border-radius:4px;overflow:hidden;height:8px;margin-bottom:4px">
              <div style="width:${Math.min(100, Math.round((totalB / Math.max(totalB, 1)) * 100))}%;height:100%;background:var(--blue);border-radius:4px"></div>
            </div>
            <div style="font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fmtTk(totalB)} ÷ ${totalM}</div>
          ` : '<span style="font-size:10px;color:var(--text3)">No meals yet</span>'}
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px">Per meal cost</div>
      </div>
      <div class="stat-card stat-card-sparkline" style="border-top:3px solid var(--green);padding:16px 14px">
        <div class="stat-label" style="display:flex;align-items:center;gap:5px">🛒 Total bazar</div>
        <div class="stat-value" style="font-size:20px;margin-top:6px;color:var(--green)">${fmtTk(totalB)}</div>
        <div style="margin-top:8px;overflow:hidden">${sparkBars(bazarDayKeys, dayCumB, maxCumB, "var(--green)")}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px">Cumulative spending</div>
      </div>
      <div class="stat-card stat-card-sparkline" style="border-top:3px solid var(--text3);padding:16px 14px">
        <div class="stat-label" style="display:flex;align-items:center;gap:5px">👥 Members</div>
        <div class="stat-value" style="font-size:22px;margin-top:6px">${members.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:6px">in this mess</div>
      </div>
    </div>

    <!-- ── Today's meals (identical to manager view) ── -->
    ${todayRec ? `
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">${isNextDay ? "Tomorrow's meals" : "Today's meals"} — ${displayStr}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:12px">
        <div class="stat-card badge-blue"><div class="stat-label" style="color:var(--blue)">Day meals</div><div class="stat-value" style="color:var(--blue)">${todayDayTotal}</div></div>
        <div class="stat-card badge-amber"><div class="stat-label" style="color:var(--amber)">Night meals</div><div class="stat-value" style="color:var(--amber)">${todayNightTotal}</div></div>
        <div class="stat-card"><div class="stat-label">Total today</div><div class="stat-value">${round2(todayDayTotal + todayNightTotal)}</div></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${members.map(m => {
          const t = mealMemberTotal(todayRec.meals || {}, m.name);
          const _p = mealPartsFromObj(todayRec.meals || {}, m.name);
          const d = _p.day, n = _p.night;
          return `<div style="display:flex;align-items:center;gap:8px;background:var(--bg3);padding:7px 12px;border-radius:var(--radius-sm);border:1px solid var(--border)">
            <span style="font-size:13px;font-weight:500;color:${t > 0 ? "var(--text)" : "var(--text3)"}">${escapeHtml(m.name)}</span>
            ${d > 0 ? `<span class="badge badge-blue">Day ${d}</span>` : ""}
            ${n > 0 ? `<span class="badge badge-amber">Night ${n}</span>` : ""}
            ${t === 0 ? `<span class="badge badge-red">Absent</span>` : ""}
          </div>`;
        }).join("")}
      </div>
    </div>` : `
    <div class="card" style="margin-bottom:14px;text-align:center;padding:24px">
      <div style="color:var(--text3);font-size:13px">No meal entry for ${isNextDay ? "tomorrow" : "today"} yet</div>
    </div>`}

    <!-- ── Bazar contributors + Member meal totals ── -->
    <div class="member-dashboard-bottom-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="card">
        <div class="card-title">🛒 Bazar contributors</div>
        ${topB.length && totalB > 0
          ? topB.map(([name, amt]) => `
              <div class="mini-bar">
                <div class="mini-bar-label">${escapeHtml(name)}</div>
                <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.round((amt / maxB) * 100)}%"></div></div>
                <div class="mini-bar-val">${fmtTk(amt)}</div>
              </div>`).join("")
          : '<div class="empty">No bazar data this month</div>'}
      </div>
      <div class="card">
        <div class="card-title">🍽 Member meal totals</div>
        ${members.length
          ? `<div class="tbl-wrap"><table>
              <thead><tr><th>Member</th><th>Meals</th><th>Bazar</th><th>Balance</th></tr></thead>
              <tbody>${members.map(m => {
                const myM = round2(memMeals[m.name] || 0);
                const myB = round2(memBazar[m.name] || 0);
                const mc  = round2(myM * mealRate);
                const bal = round2(myB - mc);
                return `<tr>
                  <td><b>${escapeHtml(m.name)}</b></td>
                  <td>${myM}</td>
                  <td style="color:var(--green)">${fmtTk(myB)}</td>
                  <td class="${bal >= 0 ? "net-pos" : "net-neg"}">${bal >= 0 ? "Get " + fmtTk(bal) : "Pay " + fmtTk(-bal)}</td>
                </tr>`;
              }).join("")}</tbody>
            </table></div>`
          : '<div class="empty">No members</div>'}
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   MESS OVERVIEW BLOCK — used by the standalone Mess Overview page.
   Shows a personal Settlement Summary + a per-member settlement
   table for the chosen month (canonical, prev-month basis).
   ═══════════════════════════════════════════════════════════════ */
function buildMessOverviewBlock(allM, allB, allR, allU, key, opts = {}) {
  const month = monthIndexFromKey(key);
  const year  = yearFromKey(key);
  const prev  = previousMonth(month, year);

  const mM = (allM || []).filter(r => String(r.date || "").startsWith(key));
  const mB = (allB || []).filter(r => String(r.date || "").startsWith(key));

  let totalM = 0, totalB = 0;
  const memMeals = {};
  const memBazar = {};
  members.forEach(m => { memMeals[m.name] = 0; memBazar[m.name] = 0; });

  mM.forEach(r => members.forEach(m => {
    const v = mealMemberTotal(r.meals || {}, m.name);
    memMeals[m.name] += v;
    totalM += v;
  }));
  mB.forEach(r => members.forEach(m => {
    const v = Number((r.bazar || {})[m.name] || 0);
    memBazar[m.name] += v;
    totalB += v;
  }));

  const mealRate = totalM > 0 ? round2(totalB / totalM) : 0;
  const topB = Object.entries(memBazar).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxB = topB[0]?.[1] || 1;

  // Per-member canonical settlement for this month — drives the read-only
  // "Monthly Log"-style table at the bottom.
  const rentRec = (allR || []).find(r => r.month_key === key) || null;
  const utilRec = (allU || []).find(r => r.month_key === key) || null;
  const utilPrv = (allU || []).find(r => r.month_key === prev.key) || null;
  const settlements = members.map(m =>
    calcMemberSettlement(m, allM, allB, rentRec, utilRec, utilPrv, key)
  );

  const hideHeading = opts.hideHeading;

  // Resolve the logged-in member's settlement (for the personal Settlement
  // Summary shown at the top of the block). Falls back gracefully when no
  // member context (e.g. manager preview).
  const me      = members.find(m => m.id === currentUser?.memberId) || null;
  const myCalc  = me ? settlements.find(s => s.memberName === me.name) : null;

  return `
    ${hideHeading ? "" : `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div style="font-family:var(--font-serif);font-size:17px;font-weight:700">📊 Mess Overview · ${MONTHS[month]} ${year}</div>
        <div style="font-size:11px;color:var(--text3)">Settlement uses meals/bazar from ${MONTHS[prev.month]} ${prev.year}</div>
      </div>`}

    <!-- ── Personal Settlement Summary (replaces mess-wide stats / contributors / meal totals) ── -->
    ${myCalc ? `
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">Settlement summary</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:9px">
          <div class="stat-card">
            <div class="stat-label">My meals (${MONTHS[prev.month].slice(0,3)})</div>
            <div class="stat-value">${myCalc.memberMeals}</div>
            <div class="stat-sub">${myCalc.memberMeals} × ${fmtTk(myCalc.mealRate)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Meal rate</div>
            <div class="stat-value" style="font-size:17px">${fmtTk(myCalc.mealRate)}</div>
            <div class="stat-sub">${fmtTk(myCalc.totalBazar)} ÷ ${myCalc.totalMeals} meals</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Meal cost</div>
            <div class="stat-value" style="font-size:17px">${fmtTk(myCalc.mealCost)}</div>
          </div>
          <div class="stat-card" style="border-color:rgba(39,174,96,.3)">
            <div class="stat-label" style="color:var(--green)">My bazar credit</div>
            <div class="stat-value" style="font-size:17px;color:var(--green)">${fmtTk(myCalc.memberBazar)}</div>
          </div>
        </div>
      </div>
    ` : ""}

    <!-- ── Read-only Monthly Log (settlement table) ── -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div class="card-title" style="margin:0">📋 ${MONTHS[month]} ${year} settlement</div>
        <div style="font-size:11px;color:var(--text3);display:flex;gap:10px;flex-wrap:wrap">
          <span><span style="display:inline-block;width:8px;height:8px;background:var(--red);border-radius:2px;margin-right:3px"></span>Postpaid (${MONTHS[prev.month].slice(0,3)})</span>
          <span><span style="display:inline-block;width:8px;height:8px;background:var(--blue);border-radius:2px;margin-right:3px"></span>Prepaid (${MONTHS[month].slice(0,3)})</span>
          <span><span style="display:inline-block;width:8px;height:8px;background:var(--green);border-radius:2px;margin-right:3px"></span>Credits</span>
        </div>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th>Member</th>
          <th style="color:var(--red)">Meal</th>
          <th style="color:var(--red)">Khala</th>
          <th style="color:var(--red)">Other</th>
          <th style="color:var(--blue)">Util</th>
          <th style="color:var(--blue)">Rent</th>
          <th style="color:var(--green)">Bazar</th>
          <th style="color:var(--green)">Paid</th>
          <th>Net</th>
        </tr></thead>
        <tbody>
          ${settlements.map(p => {
            const totalPaid = round2((p.utilityPaid || 0) + (p.roomRentPaid || 0) + (p.mealPaid || 0));
            return `
              <tr>
                <td><b>${p.memberName}</b></td>
                <td style="color:var(--red)">${fmtTk(p.mealCost)}</td>
                <td style="color:var(--red)">${fmtTk(p.khalaShare)}</td>
                <td style="color:var(--red)">${fmtTk(p.otherShare)}</td>
                <td style="color:var(--blue)">${fmtTk(p.prepaidUtility)}</td>
                <td style="color:var(--blue)">${fmtTk(p.roomRent)}</td>
                <td style="color:var(--green)">${fmtTk(p.memberBazar)}</td>
                <td style="color:${totalPaid>0?'var(--green)':'var(--text3)'}">${fmtTk(totalPaid)}</td>
                <td><b class="${p.netPayable>0?'net-neg':p.netPayable<0?'net-pos':''}">${p.netPayable>0?'Pay '+fmtTk(p.netPayable):p.netPayable<0?'Get '+fmtTk(Math.abs(p.netPayable)):'✓'}</b></td>
              </tr>`;
          }).join("")}
        </tbody>
      </table></div>
    </div>`;
}

/* Mess Overview (called from nav) */
async function renderMessOverview(el) {
  const { month, year } = thisMonth();
  const opts = buildMonthOptions(month, year);
  el.innerHTML = `
    <div class="topbar">
      <div><div class="page-title">Mess Overview</div><div class="page-sub">Mess-wide stats &amp; settlement</div></div>
    </div>
    <div class="content">
      <div class="card" style="margin-bottom:12px">
        <div class="month-sel">
          <label>Month</label>
          <select class="input" id="mo-month" style="width:150px" onchange="loadMessOverview()">${opts.monthOptions}</select>
          <label>Year</label>
          <select class="input" id="mo-year" style="width:95px" onchange="loadMessOverview()">${opts.yearOptions}</select>
        </div>
      </div>
      <div id="mo-body"><div class="loading"><div class="spinner"></div>Loading…</div></div>
    </div>`;
  await loadMessOverview();
}

async function loadMessOverview() {
  const body = document.getElementById("mo-body");
  if (!body) return;
  body.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';
  const month = parseInt(document.getElementById("mo-month")?.value ?? new Date().getMonth());
  const year  = parseInt(document.getElementById("mo-year")?.value  ?? new Date().getFullYear());
  const key   = monthKey(year, month);
  const [allM, allB, allR, { data: allU }] = await Promise.all([
    dbGetAll("meals"),
    dbGetAll("bazar"),
    dbGetAll("rent"),
    sb.from("utility_payments").select("*").eq("mess_id", messId()),
  ]);
  body.innerHTML = buildMessOverviewBlock(allM, allB, allR, allU || [], key, { hideHeading: true });
}

async function renderMyProfile(el) {
  const member = await getMe();
  if (!member) { el.innerHTML = '<div class="content"><div class="empty">Profile not found</div></div>'; return; }
  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">My Profile</div><div class="page-sub">Personal stats</div></div>
    <div class="topbar-actions">
      <select class="input" id="my-prof-period" onchange="refreshMyProfile()" style="width:180px">
        <option value="1" selected>This month</option>
        <option value="last">Last month</option>
        <option value="3">Last 3 months</option>
        <option value="6">Last 6 months</option>
        <option value="all">All time</option>
      </select>
    </div>
  </div>
  <div class="content" id="my-profile-content"><div class="loading"><div class="spinner"></div>Loading…</div></div>`;
  await loadMyProfile(member);
}

async function refreshMyProfile() { const member = await getMe(); if (!member) return; await loadMyProfile(member); }

async function loadMyProfile(member) {
  const content = document.getElementById("my-profile-content");
  if (!content) return;
  content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  const period = document.getElementById("my-prof-period")?.value || "1";
  const { month, year } = thisMonth();
  let curM = month, curY = year;
  if (period === "last") { curM = month === 0 ? 11 : month - 1; curY = month === 0 ? year - 1 : year; }

  const curKey = monthKey(curY, curM);
  const prev   = profilePreviousMonth(curM, curY);

  const [allM, allB, allR, { data: allU }, profRentRes, profCurUtilRes, profPrevUtilRes] = await Promise.all([
    dbGetAll("meals"), dbGetAll("bazar"), dbGetAll("rent"),
    sb.from("utility_payments").select("*").eq("mess_id", messId()),
    dbGetMonth("rent", curKey),
    sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", curKey).maybeSingle(),
    sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", prev.key).maybeSingle(),
  ]);

  const curUtilRec  = profCurUtilRes.data;
  const prevUtilRec = profPrevUtilRes.data;

  const { meals, bazar, rent, utility } = getFilteredData(allM, allB, allR, period, allU || []);
  const s        = getMemberStats(member, meals, bazar, rent, utility);
  const allStats = getMemberStats(member, allM, allB, allR, allU || []);

  const idx = members.findIndex(m => m.id === member.id);
  const col = avatarCol(Math.max(idx, 0));

  const allMK = Object.keys(allStats.byMonth).sort();
  const r8    = allMK.slice(-8);
  const maxM  = Math.max(...r8.map(k => allStats.byMonth[k]?.meals || 0), 1);

  const periodLabel = { "1": "This month", "last": "Last month", "3": "Last 3 months", "6": "Last 6 months", "all": "All time" }[period] || "This month";

  const allMealsTotal = meals.reduce((sum, row) => sum + mealRowTotal(row.meals || {}), 0);
  const allBazarTotal = bazar.reduce((sum, row) => sum + Object.values(row.bazar || {}).reduce((a, v) => a + Number(v || 0), 0), 0);
  const mealShare  = allMealsTotal > 0 ? Math.round((s.totalMeals / allMealsTotal) * 100) : 0;
  const bazarShare = allBazarTotal > 0 ? Math.round((s.totalBazar / allBazarTotal) * 100) : 0;

  const settlementCalc = calcMemberSettlement(member, allM, allB, profRentRes, curUtilRec, prevUtilRec, curKey);
  const mealNet  = round2(settlementCalc.memberBazar - settlementCalc.mealCost);
  const myRentEntry = profRentRes?.entries?.find(e => e.name === member.name) || {};
  const myUtilPay   = (curUtilRec?.payments || {})[member.name] || {};
  const rentNet  = round2(Number(myRentEntry.paid || 0) - Number(myRentEntry.rent || 0));
  const utilNet  = getUtilityBalance(member, curUtilRec, prevUtilRec);
  const rc = myRentEntry.status === "paid" ? "badge-green" : myRentEntry.status === "partial" ? "badge-amber" : "badge-red";
  const uc = myUtilPay.status   === "paid" ? "badge-green" : myUtilPay.status   === "partial" ? "badge-amber" : "badge-red";

  const recentMonthsHTML = `
    <div class="card" style="padding:16px">
      <div class="card-title">Recent months</div>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Month</th><th>Meals</th><th>Bazar</th><th>Rent paid</th><th>Util paid</th></tr></thead>
          <tbody>
            ${allMK.length
              ? allMK.slice(-6).reverse().map(k => {
                  const d      = allStats.byMonth[k] || {};
                  const mIndex = parseInt(k.slice(5), 10) - 1;
                  const y      = k.slice(0, 4);
                  return `<tr><td>${MONTHS[mIndex]} ${y}</td><td>${round2(d.meals || 0)}</td><td>${fmtTk(d.bazar || 0)}</td><td style="color:var(--green)">${fmtTk(d.rentPaid || 0)}</td><td style="color:var(--green)">${fmtTk(d.utilityPaid || 0)}</td></tr>`;
                }).join("")
              : `<tr><td colspan="5" class="empty">No recent data</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>`;

  const whatIOweHTML = buildWhatIOweHTML(member, allM, allB, profRentRes, curUtilRec, prevUtilRec, curM, curY);

  content.innerHTML = `
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:14px">
        <div class="avatar" style="width:52px;height:52px;font-size:17px;background:${col.bg};color:${col.fg};border:2px solid var(--accent)">
          ${initials(member.name)}
        </div>
        <div>
          <div style="font-family:var(--font-serif);font-size:22px;font-weight:700">${member.name}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">Room ${member.room || "—"}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:1px">@${member.username || "—"} · Joined: ${member.joined || "—"}</div>
          <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">
            <span class="badge ${rc}">${myRentEntry.status === "paid" ? "Rent paid" : "Rent due"}</span>
            <span class="badge ${uc}">${myUtilPay.status === "paid" ? "Utility paid" : "Utility due"}</span>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        <div style="text-align:right">
          <div style="font-size:11px;color:var(--text3)">Meal balance</div>
          <div style="font-size:18px;font-weight:800" class="${mealNet >= 0 ? "net-pos" : "net-neg"}">
            ${mealNet >= 0 ? "Get " + fmtTk(mealNet) : "Pay " + fmtTk(Math.abs(mealNet))}
          </div>
        </div>
        <div style="text-align:right;padding-left:20px;border-left:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text3)">Rent balance</div>
          <div style="font-size:18px;font-weight:800" class="${rentNet >= 0 ? "net-pos" : "net-neg"}">${rentNet >= 0 ? "+" : ""}${fmtTk(rentNet)}</div>
        </div>
        <div style="text-align:right;padding-left:20px;border-left:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text3)">Utility balance</div>
          <div style="font-size:18px;font-weight:800" class="${utilNet >= 0 ? "net-pos" : "net-neg"}">${utilNet >= 0 ? "+" : ""}${fmtTk(utilNet)}</div>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:7px;margin-bottom:18px">
      ${[
        ["Total meals", s.totalMeals, null],
        ["Active days", s.activeDays, null],
        ["Avg/day",     s.avgMeals,   null],
        ["Bazar spent", fmtTk(s.totalBazar), null],
        ["Meal cost",   fmtTk(s.mealCost),   null],
        ["Rent paid",   fmtTk(s.rentPaid),   "var(--green)"],
        ["Util paid",   fmtTk(round2(s.utilityPaid)), "var(--green)"],
      ].map(([label, value, color]) => `
        <div class="stat-card" style="padding:9px">
          <div class="stat-label">${label}</div>
          <div style="font-size:15px;font-weight:700;margin-top:4px;${color ? "color:" + color : ""}">${value}</div>
        </div>
      `).join("")}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Mess share — ${periodLabel}</div>
      <div class="mini-bar">
        <div class="mini-bar-label">Meal share</div>
        <div class="mini-bar-track" style="height:8px"><div class="mini-bar-fill" style="width:${mealShare}%"></div></div>
        <div class="mini-bar-val">${mealShare}%</div>
      </div>
      <div class="mini-bar">
        <div class="mini-bar-label">Bazar share</div>
        <div class="mini-bar-track" style="height:8px"><div class="mini-bar-fill" style="width:${bazarShare}%"></div></div>
        <div class="mini-bar-val">${bazarShare}%</div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Monthly meal history</div>
      ${r8.length ? `
        <div class="hist-labels">${r8.map(k => `<span>${MONTHS[parseInt(k.slice(5), 10) - 1].slice(0, 3)}</span>`).join("")}</div>
        <div class="hist-wrap">${r8.map(k => {
          const v = allStats.byMonth[k]?.meals || 0;
          const h = Math.max(Math.round((v / maxM) * 44), 3);
          return `<div class="hist-b" style="height:${h}px"><div class="tip">${MONTHS[parseInt(k.slice(5), 10) - 1].slice(0, 3)}: ${v}</div></div>`;
        }).join("")}</div>
      ` : `<div style="color:var(--text3);font-size:13px">No history</div>`}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
      ${recentMonthsHTML}
      ${whatIOweHTML}
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════
   CHANGE PASSWORD
═══════════════════════════════════════════ */
function openChangePasswordModal(memberId) {
  document.getElementById("modal-content").innerHTML = `
    <div class="modal-title">🔑 Change Password</div>
    <div class="modal-sub">Enter your current password to confirm, then set a new one.</div>

    <div class="field">
      <label>Current password *</label>
      <input type="password" class="input" id="cp-current" placeholder="Your current password" autocomplete="current-password"/>
    </div>
    <div class="field">
      <label>New password *</label>
      <input type="password" class="input" id="cp-new" placeholder="Min 6 characters" autocomplete="new-password"/>
    </div>
    <div class="field">
      <label>Confirm new password *</label>
      <input type="password" class="input" id="cp-confirm" placeholder="Repeat new password" autocomplete="new-password"/>
    </div>
    <div id="cp-error" style="display:none;color:var(--red);font-size:13px;margin-bottom:8px"></div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="doChangePassword('${memberId}')">Update password</button>
    </div>`;
  openModal();
}

async function doChangePassword(memberId) {
  const currentPw  = document.getElementById("cp-current")?.value;
  const newPw      = document.getElementById("cp-new")?.value;
  const confirmPw  = document.getElementById("cp-confirm")?.value;
  const errEl      = document.getElementById("cp-error");

  const showErr = (msg) => { errEl.style.display = "block"; errEl.textContent = msg; };
  errEl.style.display = "none";

  if (!currentPw)               return showErr("Enter your current password.");
  if (!newPw || newPw.length < 6) return showErr("New password must be at least 6 characters.");
  if (newPw !== confirmPw)       return showErr("New passwords do not match.");
  if (newPw === currentPw)       return showErr("New password must be different from current.");

  try {
    // Verify current password against DB
    const currentHash = await hashPassword(currentPw);
    const { data: member } = await sb.from("members").select("id, password")
      .eq("id", memberId).maybeSingle();

    if (!member) return showErr("Incorrect password. Please try again.");

    // Support both hashed and legacy plaintext passwords during transition
    const isHashed  = member.password === currentHash;
    const isLegacy  = member.password === currentPw;
    if (!isHashed && !isLegacy) return showErr("Incorrect password. Please try again.");

    // Save new hashed password
    const newHash = await hashPassword(newPw);
    const { error } = await sb.from("members").update({ password: newHash }).eq("id", memberId);
    if (error) throw error;

    closeModal();
    toast("Password updated successfully ✓", "success");

    // Refresh session so it stays valid
    saveSession(currentUser, currentMess);
  } catch (e) {
    showErr("Error: " + e.message);
  }
}
