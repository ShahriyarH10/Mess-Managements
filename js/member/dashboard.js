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
    getClient().from("utility_payments").select("*").eq("mess_id", messId()),
    dbGetMonth("rent", key),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle(),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", prevKey).maybeSingle(),
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

  const netColor  = calc.netPayable > 0 ? "var(--red)" : calc.netPayable < 0 ? "var(--green)" : "var(--text)";
  const netBg     = calc.netPayable > 0 ? "var(--red-bg)" : calc.netPayable < 0 ? "var(--green-bg)" : "var(--bg3)";
  const netBorder = calc.netPayable > 0 ? "rgba(224,82,82,.25)" : calc.netPayable < 0 ? "rgba(76,175,130,.25)" : "var(--border2)";
  const netIcon   = calc.netPayable > 0 ? "⚠️" : calc.netPayable < 0 ? "💚" : "✅";
  const netLabel  = calc.netPayable > 0
    ? "You Pay " + fmtTk(calc.netPayable)
    : calc.netPayable < 0
      ? "You Get " + fmtTk(Math.abs(calc.netPayable))
      : "Settled";

  // Load broadcasts
  let broadcastBanner = "";
  try {
    const bcs = await dbGetBroadcasts();
    if (bcs.length) {
      broadcastBanner = bcs.map(b => {
        const isUrgent = b.priority === "urgent";
        return `<div style="background:${isUrgent ? "var(--red-bg)" : "var(--accent-bg)"};border:1px solid ${isUrgent ? "rgba(224,82,82,.25)" : "rgba(212,168,83,.2)"};border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
          <span style="font-size:18px;flex-shrink:0">${isUrgent ? "🔴" : "📢"}</span>
          <div><div style="font-size:13px;color:var(--text);line-height:1.5">${escapeHtml(b.message)}</div><div style="font-size:10px;color:var(--text3);margin-top:2px">${escapeHtml(b.author)}</div></div>
        </div>`;
      }).join("");
    }
  } catch (_) {}


  // Charges breakdown for visual bar
  const totalCharges = calc.totalPay || 1;
  const mealPct    = Math.round((calc.mealCost       / totalCharges) * 100);
  const rentPct    = Math.round((calc.roomRent        / totalCharges) * 100);
  const utilPct    = Math.round((calc.prepaidUtility  / totalCharges) * 100);
  const khalaPct   = Math.round(((calc.khalaShare + calc.otherShare) / totalCharges) * 100);

  // My personal meal stats this month (current month, not prev)
  const myCurrentMeals = (() => {
    let total = 0;
    const curMM = allMeals.filter(r => r.date.startsWith(key));
    curMM.forEach(r => { total += mealMemberTotal(r.meals || {}, member.name); });
    return round2(total);
  })();
  const myCurrentBazar = (() => {
    let total = 0;
    allBazar.filter(r => r.date.startsWith(key)).forEach(r => {
      total += Number((r.bazar || {})[member.name] || 0);
    });
    return round2(total);
  })();
  // Current month mess-wide meal rate
  const curMonthMealRate = (() => {
    let totM = 0, totB = 0;
    allMeals.filter(r => r.date.startsWith(key)).forEach(r => {
      const mObj = r.meals || {}, ks = Object.keys(mObj);
      const hasSplit = ks.some(k => k.endsWith("_day") || k.endsWith("_night"));
      if (hasSplit) ks.forEach(k => { if (k.endsWith("_day") || k.endsWith("_night")) totM += Number(mObj[k]) || 0; });
      else Object.values(mObj).forEach(v => { totM += Number(v) || 0; });
    });
    allBazar.filter(r => r.date.startsWith(key)).forEach(r => {
      Object.values(r.bazar || {}).forEach(v => { totB += Number(v) || 0; });
    });
    return totM > 0 ? round2(totB / totM) : 0;
  })();
  // Current month mess-wide totals for stat cards
  let curMonthTotalMeals = 0, curMonthTotalBazar = 0;
  allMeals.filter(r => r.date.startsWith(key)).forEach(r => {
    const mObj = r.meals || {}, ks = Object.keys(mObj);
    const hasSplit = ks.some(k => k.endsWith("_day") || k.endsWith("_night"));
    if (hasSplit) ks.forEach(k => { if (k.endsWith("_day") || k.endsWith("_night")) curMonthTotalMeals += Number(mObj[k]) || 0; });
    else Object.values(mObj).forEach(v => { curMonthTotalMeals += Number(v) || 0; });
  });
  allBazar.filter(r => r.date.startsWith(key)).forEach(r => {
    Object.values(r.bazar || {}).forEach(v => { curMonthTotalBazar += Number(v) || 0; });
  });
  curMonthTotalMeals = round2(curMonthTotalMeals);
  curMonthTotalBazar = round2(curMonthTotalBazar);
  const myTodayParts = todayRec ? mealPartsFromObj(todayRec.meals || {}, member.name) : { day: 0, night: 0 };

  // Daily my-meals heatmap for current month
  const now2 = new Date();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDay2 = now2.getDate();
  const myDayMeals = {};
  allMeals.filter(r => r.date.startsWith(key)).forEach(r => {
    const dd = parseInt(r.date.slice(8), 10);
    myDayMeals[dd] = round2((myDayMeals[dd] || 0) + mealMemberTotal(r.meals || {}, member.name));
  });
  const myMaxDay = Math.max(...Object.values(myDayMeals), 1);

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">My Dashboard</div>
      <div class="page-sub">${member.name} · ${MONTHS[month]} ${year}</div>
    </div>
  </div>
  <div class="content">
    ${broadcastBanner}

    <!-- ── Net payable hero card ── -->
    <div style="background:${netBg};border:1px solid ${netBorder};border-radius:var(--radius);padding:18px 20px;margin-bottom:14px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">
            Net payable — ${MONTHS[month]} ${year}
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="font-size:30px;font-weight:900;color:${netColor};line-height:1">${netIcon} ${netLabel}</div>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px">
            Meals/bazar from ${MONTHS[prevInfo.month]} ${prevInfo.year} · Rent/utility from ${MONTHS[month]} ${year}
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="showMySettlementBreakdown()" style="flex-shrink:0">📊 Breakdown</button>
      </div>

      <!-- Charges breakdown bar -->
      ${calc.totalPay > 0 ? `
      <div style="margin-top:14px">
        <div style="font-size:10px;color:var(--text3);margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px">Your charges this month</div>
        <div style="display:flex;height:8px;border-radius:99px;overflow:hidden;gap:2px">
          ${calc.mealCost      > 0 ? `<div style="flex:${mealPct};background:var(--accent);border-radius:2px" title="Meal cost ${fmtTk(calc.mealCost)}"></div>` : ""}
          ${calc.roomRent      > 0 ? `<div style="flex:${rentPct};background:var(--amber);border-radius:2px" title="Rent ${fmtTk(calc.roomRent)}"></div>` : ""}
          ${calc.prepaidUtility> 0 ? `<div style="flex:${utilPct};background:var(--purple);border-radius:2px" title="Utility ${fmtTk(calc.prepaidUtility)}"></div>` : ""}
          ${(calc.khalaShare + calc.otherShare) > 0 ? `<div style="flex:${khalaPct};background:var(--blue);border-radius:2px" title="Khala+Other ${fmtTk(calc.khalaShare + calc.otherShare)}"></div>` : ""}
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
          ${calc.mealCost > 0       ? `<span style="font-size:10px;color:var(--accent)">🍽 Meal ${fmtTk(calc.mealCost)}</span>` : ""}
          ${calc.roomRent > 0       ? `<span style="font-size:10px;color:var(--amber)">🏠 Rent ${fmtTk(calc.roomRent)}</span>` : ""}
          ${calc.prepaidUtility > 0 ? `<span style="font-size:10px;color:var(--purple)">⚡ Util ${fmtTk(calc.prepaidUtility)}</span>` : ""}
          ${(calc.khalaShare+calc.otherShare) > 0 ? `<span style="font-size:10px;color:var(--blue)">👩 Khala ${fmtTk(round2(calc.khalaShare+calc.otherShare))}</span>` : ""}
        </div>
      </div>
      ` : ""}

      <!-- Credits row -->
      ${(calc.memberBazar + calc.utilityPaid + calc.roomRentPaid + calc.mealPaid) > 0 ? `
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid ${netBorder};display:flex;gap:10px;flex-wrap:wrap">
        <span style="font-size:10px;color:var(--text3)">Credits:</span>
        ${calc.memberBazar  > 0 ? `<span style="font-size:10px;color:var(--green)">🛒 Bazar ${fmtTk(calc.memberBazar)}</span>` : ""}
        ${calc.roomRentPaid > 0 ? `<span style="font-size:10px;color:var(--green)">🏠 Rent paid ${fmtTk(calc.roomRentPaid)}</span>` : ""}
        ${calc.utilityPaid  > 0 ? `<span style="font-size:10px;color:var(--green)">⚡ Util paid ${fmtTk(calc.utilityPaid)}</span>` : ""}
        ${calc.mealPaid     > 0 ? `<span style="font-size:10px;color:var(--green)">💵 Meal paid ${fmtTk(calc.mealPaid)}</span>` : ""}
      </div>
      ` : ""}
    </div>

    <!-- ── Mess-wide stat cards ── -->
    <div class="stat-grid" style="margin-bottom:14px">
      <div class="stat-card stat-card-sparkline" style="border-top:3px solid var(--accent);padding:14px">
        <div class="stat-label">🍽️ Mess meals (${MONTHS[month].slice(0,3)})</div>
        <div class="stat-value" style="font-size:22px;color:var(--accent);margin-top:6px">${curMonthTotalMeals}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:6px">total this month</div>
      </div>
      <div class="stat-card stat-card-sparkline" style="border-top:3px solid var(--blue);padding:14px">
        <div class="stat-label">📊 Current meal rate</div>
        <div class="stat-value" style="font-size:20px;color:var(--blue);margin-top:6px">${fmtTk(curMonthMealRate)}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:6px">per meal this month</div>
      </div>
      <div class="stat-card stat-card-sparkline" style="border-top:3px solid var(--green);padding:14px">
        <div class="stat-label">🛒 Total bazar</div>
        <div class="stat-value" style="font-size:20px;color:var(--green);margin-top:6px">${fmtTk(curMonthTotalBazar)}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:6px">this month</div>
      </div>
      <div class="stat-card stat-card-sparkline" style="border-top:3px solid var(--text3);padding:14px">
        <div class="stat-label">👥 Members</div>
        <div class="stat-value" style="font-size:22px;margin-top:6px">${members.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:6px">in this mess</div>
      </div>
    </div>

    <!-- ── My meal activity heatmap ── -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-title" style="margin-bottom:10px">📅 My meal activity — ${MONTHS[month]}</div>
      <div style="display:grid;grid-template-columns:repeat(${Math.min(daysInMonth,16)},1fr);gap:3px;margin-bottom:6px">
        ${Array.from({length: daysInMonth}, (_, i) => {
          const d = i + 1;
          const v = myDayMeals[d] || 0;
          const isToday = d === todayDay2;
          const opacity = v === 0 ? 0.1 : 0.25 + (v / myMaxDay) * 0.75;
          const bg = v === 0 ? "var(--bg4)" : `rgba(212,168,83,${opacity.toFixed(2)})`;
          return `<div title="Day ${d}: ${v} meals" style="height:20px;border-radius:3px;background:${bg};border:${isToday ? "2px solid var(--accent)" : "1px solid transparent"};display:flex;align-items:center;justify-content:center">
            <span style="font-size:7px;color:${v>0?"var(--text)":"var(--text3)"};opacity:.7">${d}</span>
          </div>`;
        }).join("")}
      </div>
      <div style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--text3)">
        <span>No meal</span>
        ${[0.1,0.35,0.6,0.85,1].map(o=>`<div style="width:12px;height:8px;border-radius:2px;background:rgba(212,168,83,${o})"></div>`).join("")}
        <span>High</span>
        <span style="margin-left:auto">Today = outlined</span>
      </div>
    </div>

    <!-- ── Today's meals ── -->
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:6px">
        <div class="card-title" style="margin-bottom:0">${isNextDay ? "Tomorrow" : "Today"} — ${displayStr}</div>
        ${todayRec ? `
          <div style="display:flex;gap:5px">
            <span style="background:var(--blue-bg);color:var(--blue);padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600">☀ ${todayDay} day</span>
            <span style="background:var(--accent-bg);color:var(--accent);padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600">🌙 ${todayNight} night</span>
          </div>` : ""}
      </div>
      ${todayRec ? `
        <!-- My meal highlight -->
        <div style="background:${myTodayParts.day+myTodayParts.night>0?"var(--accent-bg)":"var(--red-bg)"};border:1px solid ${myTodayParts.day+myTodayParts.night>0?"rgba(212,168,83,.2)":"rgba(224,82,82,.2)"};border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;gap:10px">
          <div style="font-size:20px">${myTodayParts.day+myTodayParts.night>0?"🍽️":"😴"}</div>
          <div>
            <div style="font-size:12px;font-weight:700;color:${myTodayParts.day+myTodayParts.night>0?"var(--accent)":"var(--red)"}">${myTodayParts.day+myTodayParts.night>0?"You are eating today":"You are absent today"}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">
              ${myTodayParts.day>0?`☀ Day: ${myTodayParts.day}  `:""}${myTodayParts.night>0?`🌙 Night: ${myTodayParts.night}`:""}
              ${myTodayParts.day+myTodayParts.night===0?"No meals recorded for you":""}
            </div>
          </div>
        </div>
        <!-- All members -->
        <div style="display:flex;flex-wrap:wrap;gap:7px">${memberBadgesHTML}</div>
      ` : `<div class="empty" style="padding:20px">No meal entry for ${isNextDay?"tomorrow":"today"} yet</div>`}
    </div>

    <!-- ── Embedded mess snapshot (current month) ── -->
    ${buildMessSnapshotBlock(allMeals, allBazar, key, member.name)}
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
function buildMessSnapshotBlock(allM, allB, key, myName) {
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

  // Sparkline data
  const dayMeals = {};
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

  // Cumulative bazar per day sparkline
  const bazarByDay = {};
  mB.forEach(r => {
    const dd = String(r.date || "").slice(8, 10);
    if (dd) bazarByDay[dd] = (bazarByDay[dd] || 0) + Object.values(r.bazar || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  });
  let runB = 0;
  const dayCumB = {};
  Object.keys(bazarByDay).sort().forEach(dd => { runB += bazarByDay[dd]; dayCumB[dd] = runB; });
  const bazarDayKeys = Object.keys(dayCumB).sort();
  const maxCumB = Math.max(...Object.values(dayCumB), 1);

  const topB = Object.entries(memBazar).sort((a, b) => b[1] - a[1]).filter(([,v]) => v > 0).slice(0, 6);
  const maxB = topB[0]?.[1] || 1;
  const maxMemMeal = Math.max(...Object.values(memMeals), 1);

  // Sparkline SVG
  function sparkBars(dayKs, dataObj, maxVal, color) {
    if (!dayKs.length) return '<span style="color:var(--text3);font-size:11px">No data yet</span>';
    const W = 160, H = 32, gap = 2;
    const bw = Math.max(2, Math.floor((W - gap * (dayKs.length - 1)) / dayKs.length));
    const bars = dayKs.map((dd, i) => {
      const v = dataObj[dd] || 0;
      const h = Math.max(2, Math.round((v / maxVal) * H));
      const x = i * (bw + gap), y = H - h;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="1" fill="${color}" opacity="${v > 0 ? 0.85 : 0.18}"/>`;
    }).join("");
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;overflow:visible">${bars}</svg>`;
  }

  return `
    <!-- ── Member meal comparison ── -->
    ${members.length > 0 && totalM > 0 ? `
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">👥 Who ate how much — ${MONTHS[monthIndexFromKey(key)]}</div>
      <div style="display:grid;gap:8px">
        ${members.map((m, i) => {
          const v = round2(memMeals[m.name] || 0);
          const baz = round2(memBazar[m.name] || 0);
          const pct = Math.round((v / maxMemMeal) * 100);
          const col = avatarCol(i);
          const isMe = myName && m.name === myName;
          const mealCost2 = round2(v * mealRate);
          const balance = round2(baz - mealCost2);
          return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--radius-sm);background:${isMe?"var(--accent-bg)":"transparent"};border:1px solid ${isMe?"rgba(212,168,83,.2)":"transparent"}">
            <div style="width:28px;height:28px;border-radius:50%;background:${col.bg};color:${col.fg};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0">${initials(m.name)}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;gap:4px">
                <span style="font-size:12px;font-weight:${isMe?"700":"500"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${isMe?"var(--accent)":"var(--text)"}">${escapeHtml(m.name)}${isMe?" (You)":""}</span>
                <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
                  <span style="font-size:12px;font-weight:600">${v} meals</span>
                  ${baz > 0 ? `<span style="font-size:10px;background:var(--green-bg);color:var(--green);padding:1px 6px;border-radius:99px">${fmtTk(baz)}</span>` : ""}
                  ${balance !== 0 ? `<span style="font-size:10px;background:${balance>0?"var(--green-bg)":"var(--red-bg)"};color:${balance>0?"var(--green)":"var(--red)"};padding:1px 6px;border-radius:99px">${balance>0?"Get":"Pay"} ${fmtTk(Math.abs(balance))}</span>` : `<span style="font-size:10px;background:var(--bg3);color:var(--text3);padding:1px 6px;border-radius:99px">Settled</span>`}
                </div>
              </div>
              <div style="height:6px;background:var(--bg4);border-radius:99px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${isMe?"var(--accent)":col.fg};border-radius:99px;opacity:${isMe?1:0.7};transition:width .8s var(--ease-spring)"></div>
              </div>
            </div>
          </div>`;
        }).join("")}
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:10px;color:var(--text3);display:flex;gap:12px;flex-wrap:wrap">
        <span>Bar = meals eaten · Green pill = bazar · Balance based on current rate ${fmtTk(mealRate)}/meal</span>
      </div>
    </div>` : ""}

    <!-- ── Bazar contributors ── -->
    ${topB.length > 0 ? `
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">🛒 Bazar contributors — ${MONTHS[monthIndexFromKey(key)]}</div>
      ${topB.map(([name, amt], i) => {
        const pct = Math.round((amt / maxB) * 100);
        const col = avatarCol(members.findIndex(m => m.name === name));
        const isMe = myName && name === myName;
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:9px;padding:4px 6px;border-radius:var(--radius-sm);background:${isMe?"var(--green-bg)":"transparent"}">
          <div style="width:26px;height:26px;border-radius:50%;background:${col.bg};color:${col.fg};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0">${initials(name)}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">
              <span style="font-size:12px;font-weight:${isMe?"700":"500"};color:${isMe?"var(--green)":"var(--text)"}">${escapeHtml(name)}${isMe?" (You)":""}</span>
              <span style="font-size:12px;font-weight:600;color:var(--green)">${fmtTk(amt)}</span>
            </div>
            <div style="height:5px;background:var(--bg4);border-radius:99px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:${isMe?"var(--green)":col.fg};border-radius:99px;opacity:.85;transition:width .8s var(--ease-spring)"></div>
            </div>
          </div>
          <span style="font-size:10px;color:var(--text3);width:26px;text-align:right">${pct}%</span>
        </div>`;
      }).join("")}
    </div>` : ""}
  `;
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
    getClient().from("utility_payments").select("*").eq("mess_id", messId()),
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
    getClient().from("utility_payments").select("*").eq("mess_id", messId()),
    dbGetMonth("rent", curKey),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", curKey).maybeSingle(),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", prev.key).maybeSingle(),
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

    <div class="profile-detail-bottom-grid" style="display:grid;gap:12px;margin-top:14px">
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
    const { data: member } = await getClient().from("members").select("id, password")
      .eq("id", memberId).maybeSingle();

    if (!member) return showErr("Incorrect password. Please try again.");

    // Support both hashed and legacy plaintext passwords during transition
    const isHashed  = member.password === currentHash;
    const isLegacy  = member.password === currentPw;
    if (!isHashed && !isLegacy) return showErr("Incorrect password. Please try again.");

    // Save new hashed password
    const newHash = await hashPassword(newPw);
    const { error } = await getClient().from("members").update({ password: newHash }).eq("id", memberId);
    if (error) throw error;

    closeModal();
    toast("Password updated successfully ✓", "success");

    // Refresh session so it stays valid
    saveSession(currentUser, currentMess);
  } catch (e) {
    showErr("Error: " + e.message);
  }
}
