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

  const todayStr = today();
  const todayRec = allMeals.find(r => r.date === todayStr);
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

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">

      <!-- Settlement summary -->
      <div class="card">
        <div class="card-title">Settlement summary</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
          <div class="stat-card">
            <div class="stat-label">My meals (${MONTHS[prevInfo.month].slice(0,3)})</div>
            <div class="stat-value">${calc.memberMeals}</div>
            <div class="stat-sub">${calc.memberMeals} × ${fmtTk(calc.mealRate)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Meal rate</div>
            <div class="stat-value" style="font-size:17px">${fmtTk(calc.mealRate)}</div>
            <div class="stat-sub">${fmtTk(calc.totalBazar)} ÷ ${calc.totalMeals} meals</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Meal cost</div>
            <div class="stat-value" style="font-size:17px">${fmtTk(calc.mealCost)}</div>
          </div>
          <div class="stat-card" style="border-color:rgba(39,174,96,.3)">
            <div class="stat-label" style="color:var(--green)">My bazar credit</div>
            <div class="stat-value" style="font-size:17px;color:var(--green)">${fmtTk(calc.memberBazar)}</div>
          </div>
        </div>
      </div>

      <!-- Today's meals -->
      <div class="card">
        <div class="card-title">Today — ${todayStr}</div>
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
    </div>

    <!-- ── Embedded Mess Overview (current month) ── -->
    ${buildMessOverviewBlock(allMeals, allBazar, allRent, allUtil || [], key)}
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
   MESS OVERVIEW BLOCK — reusable. Renders monthly stats, bazar
   contributors, member meal totals, and a per-member settlement
   table for the chosen month. Used by both the standalone Mess
   Overview page AND embedded into the member's dashboard.
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
    const v = mealTotalFromObj(r.meals || {}, m.name);
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

  return `
    ${hideHeading ? "" : `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div style="font-family:var(--font-serif);font-size:17px;font-weight:700">📊 Mess Overview · ${MONTHS[month]} ${year}</div>
        <div style="font-size:11px;color:var(--text3)">Settlement uses meals/bazar from ${MONTHS[prev.month]} ${prev.year}</div>
      </div>`}

    <div class="stat-grid" style="margin-bottom:12px">
      <div class="stat-card"><div class="stat-label">Total meals</div><div class="stat-value">${round2(totalM)}</div></div>
      <div class="stat-card"><div class="stat-label">Meal rate</div><div class="stat-value" style="font-size:17px">${fmtTk(mealRate)}</div></div>
      <div class="stat-card"><div class="stat-label">Total bazar</div><div class="stat-value" style="font-size:17px">${fmtTk(totalB)}</div></div>
      <div class="stat-card"><div class="stat-label">Members</div><div class="stat-value">${members.length}</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div class="card">
        <div class="card-title">🛒 Bazar contributors</div>
        ${topB.length
          ? topB.map(([name, amt]) => `
              <div class="mini-bar">
                <div class="mini-bar-label">${name}</div>
                <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.round((amt / maxB) * 100)}%"></div></div>
                <div class="mini-bar-val">${fmtTk(amt)}</div>
              </div>`).join("")
          : '<div class="empty">No bazar data</div>'}
      </div>
      <div class="card">
        <div class="card-title">🍽 Member meal totals</div>
        ${members.length
          ? `<div class="tbl-wrap"><table>
              <thead><tr><th>Member</th><th>Meals</th><th>Bazar</th><th>Meal cost</th><th>Balance</th></tr></thead>
              <tbody>${members.map(m => {
                const myM = round2(memMeals[m.name] || 0);
                const myB = round2(memBazar[m.name] || 0);
                const mc  = round2(myM * mealRate);
                const bal = round2(myB - mc);
                return `<tr><td><b>${m.name}</b></td><td>${myM}</td><td style="color:var(--green)">${fmtTk(myB)}</td><td>${fmtTk(mc)}</td><td class="${bal>=0?"net-pos":"net-neg"}">${bal>=0?"Get "+fmtTk(bal):"Pay "+fmtTk(-bal)}</td></tr>`;
              }).join("")}</tbody>
            </table></div>`
          : '<div class="empty">No members</div>'}
      </div>
    </div>

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

  const allMealsTotal = meals.reduce((sum, row) => sum + members.reduce((a, m) => a + mealTotalFromObj(row.meals || {}, m.name), 0), 0);
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
