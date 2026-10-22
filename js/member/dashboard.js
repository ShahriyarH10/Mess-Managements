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

  // Outstanding balance carried forward from ALL past unpaid settlements,
  // not just the previous month (calcPrevDueForMember walks the full chain
  // — see js/core/helpers.js for why a single-month lookback lost debt).
  calc.prevDue = calcPrevDueForMember(member, allMeals, allBazar, allRent, allUtil, key);
  calc.netWithPrevDue = round2(calc.netPayable + calc.prevDue);

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

  const netColor  = calc.netWithPrevDue > 0 ? "var(--red)" : calc.netWithPrevDue < 0 ? "var(--green)" : "var(--text)";
  const netBg     = calc.netWithPrevDue > 0 ? "var(--red-bg)" : calc.netWithPrevDue < 0 ? "var(--green-bg)" : "var(--bg3)";
  const netBorder = calc.netWithPrevDue > 0 ? "rgba(224,82,82,.25)" : calc.netWithPrevDue < 0 ? "rgba(76,175,130,.25)" : "var(--border2)";
  const netIcon   = calc.netWithPrevDue > 0 ? "⚠️" : calc.netWithPrevDue < 0 ? "💚" : "✅";
  const netLabel  = calc.netWithPrevDue > 0
    ? "You Pay " + fmtTk(calc.netWithPrevDue)
    : calc.netWithPrevDue < 0
      ? "You Get " + fmtTk(Math.abs(calc.netWithPrevDue))
      : "Settled";

  // Load broadcasts
  let broadcastBanner = "";
  try {
    const bcs = await dbGetBroadcasts();
    if (bcs.length) {
      broadcastBanner = `<div class="card mb-notices">
        ${bcs.slice(0, 3).map(b => `<div class="mb-notice${b.priority === "urgent" ? " mb-urgent" : ""}">
          <span class="mb-notice-dot"></span>
          <span class="mb-notice-msg">${escapeHtml(b.message)}</span>
          <span class="mb-notice-by">${escapeHtml(b.author)}</span>
        </div>`).join("")}
        ${bcs.length > 3 ? `<button class="btn btn-ghost btn-sm" onclick="navigate('my-messages')">All ${bcs.length} messages →</button>` : ""}
      </div>`;
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

  // ── Per-day series for the sparklines + calendar ──
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDay2   = now.getDate();
  const daysGone    = Math.min(todayDay2, daysInMonth);
  const curMM = allMeals.filter(r => r.date.startsWith(key));
  const curMB = allBazar.filter(r => r.date.startsWith(key));
  const myDayMeals = {}, dayMessMeals = {}, myDayBazar = {}, dayMessBazar = {};
  curMM.forEach(r => {
    const dd = parseInt(r.date.slice(8), 10);
    myDayMeals[dd] = round2((myDayMeals[dd] || 0) + mealMemberTotal(r.meals || {}, member.name));
    dayMessMeals[dd] = (dayMessMeals[dd] || 0) + members.reduce((t, m) => t + mealMemberTotal(r.meals || {}, m.name), 0);
  });
  curMB.forEach(r => {
    const dd = parseInt(r.date.slice(8), 10);
    myDayBazar[dd]   = (myDayBazar[dd] || 0) + Number((r.bazar || {})[member.name] || 0);
    dayMessBazar[dd] = (dayMessBazar[dd] || 0) + Object.values(r.bazar || {}).reduce((t, v) => t + (Number(v) || 0), 0);
  });
  const myMaxDay = Math.max(...Object.values(myDayMeals), 1);
  const sMeals = [], sRate = [], sBal = [], sBazar = [];
  let cM = 0, cB = 0, myM = 0, myB = 0;
  for (let d = 1; d <= daysGone; d++) {
    cM += dayMessMeals[d] || 0; cB += dayMessBazar[d] || 0;
    myM += myDayMeals[d] || 0;  myB += myDayBazar[d] || 0;
    const rate = cM > 0 ? cB / cM : 0;
    sMeals.push(myDayMeals[d] || 0); sRate.push(rate); sBal.push(myB - myM * rate); sBazar.push(myB);
  }
  const myDaysEaten = Object.values(myDayMeals).filter(v => v > 0).length;
  const myPace      = myDaysEaten > 0 ? round2(myCurrentMeals / myDaysEaten) : 0;
  const messAvg     = members.length ? round2(curMonthTotalMeals / members.length) : 0;
  const myMealCost  = round2(myCurrentMeals * curMonthMealRate);
  const myMealBal   = round2(myCurrentBazar - myMealCost);           // + = mess owes me (meals only)
  const bazarShare  = curMonthTotalBazar > 0 ? Math.round((myCurrentBazar / curMonthTotalBazar) * 100) : 0;

  // Previous month's rate, for the trend
  let pM = 0, pB = 0;
  allMeals.filter(r => r.date.startsWith(prevKey)).forEach(r => { pM += members.reduce((t, m) => t + mealMemberTotal(r.meals || {}, m.name), 0); });
  allBazar.filter(r => r.date.startsWith(prevKey)).forEach(r => { pB += Object.values(r.bazar || {}).reduce((t, v) => t + (Number(v) || 0), 0); });
  const prevRate = pM > 0 ? pB / pM : 0;
  const rateTrend = (() => {
    if (!prevRate || !curMonthMealRate) return `no ${MONTHS[prevInfo.month]} data`;
    const pct = Math.round(((curMonthMealRate - prevRate) / prevRate) * 100);
    if (!pct) return `→ same as ${MONTHS[prevInfo.month].slice(0, 3)}`;
    return `<span class="${pct > 0 ? "dk-bad" : "dk-good"}">${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs ${MONTHS[prevInfo.month].slice(0, 3)}</span>`;
  })();

  // Mess table: meals, bazar, meal balance at the current rate
  const memMeals = {}, memBazar = {};
  members.forEach(m => { memMeals[m.name] = 0; memBazar[m.name] = 0; });
  curMM.forEach(r => members.forEach(m => { memMeals[m.name] += mealMemberTotal(r.meals || {}, m.name); }));
  curMB.forEach(r => members.forEach(m => { memBazar[m.name] += Number((r.bazar || {})[m.name] || 0); }));
  const maxMemMeal = Math.max(...Object.values(memMeals), 1);

  const kpi = (cls, icon, label, value, sub, graphic) => `
    <div class="dk-card ${cls}">
      <div class="dk-head"><span class="dk-ico">${icon}</span><span class="dk-label">${label}</span></div>
      <div class="stat-value dk-value">${value}</div>
      <div class="dk-sub">${sub}</div>
      ${graphic}
    </div>`;
  const pays  = calc.netWithPrevDue > 0.01, gets = calc.netWithPrevDue < -0.01;
  const heroCls = pays ? "mb-pay" : gets ? "mb-get" : "mb-ok";
  const credits = [
    calc.memberBazar      > 0 && `🛒 Bazar ${fmtTk(calc.memberBazar)}`,
    calc.roomRentPaid     > 0 && `🏠 Rent paid ${fmtTk(calc.roomRentPaid)}`,
    calc.utilityPaid      > 0 && `⚡ Util paid ${fmtTk(calc.utilityPaid)}`,
    calc.mealPaid         > 0 && `💵 Meal paid ${fmtTk(calc.mealPaid)}`,
    (calc.messCredit || 0) > 0 && `↩ Carried ${fmtTk(calc.messCredit)}`,
  ].filter(Boolean);
  const charges = [
    [calc.mealCost,       "var(--accent)", "🍽 Meal"],
    [calc.roomRent,       "var(--amber)",  "🏠 Rent"],
    [calc.prepaidUtility, "var(--purple)", "⚡ Utility"],
    [round2(calc.khalaShare + calc.otherShare), "var(--blue)", "👩 Khala & other"],
  ].filter(c => c[0] > 0);
  const me = myTodayParts, eating = me.day + me.night > 0;
  const lead = (new Date(year, month, 1).getDay() + 1) % 7;   // Saturday-first week

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">My Dashboard</div>
      <div class="page-sub">${member.name} · ${MONTHS[month]} ${year} · day ${daysGone} of ${daysInMonth}</div>
    </div>
    <div class="topbar-actions">
      <button class="btn btn-ghost btn-sm" onclick="navigate('my-receipts')">🧾 My receipts</button>
      <button class="btn btn-primary btn-sm" onclick="navigate('give-payment')">💵 Give payment</button>
    </div>
  </div>
  <div class="content dk">
    ${broadcastBanner}

    <!-- ── Balance ── -->
    <div class="card mb-hero ${heroCls}">
      <div class="mb-hero-top">
        <div class="mb-hero-main">
          <div class="mb-hero-lbl">Net payable · ${MONTHS[month]} ${year}</div>
          <div class="mb-hero-amt">${pays ? "You pay" : gets ? "You get" : "✓ Settled"} ${pays || gets ? `<span class="stat-value">${fmtTk(Math.abs(calc.netWithPrevDue))}</span>` : ""}</div>
          <div class="mb-hero-note">Meals & bazar from ${MONTHS[prevInfo.month]} ${prevInfo.year} · rent & utility from ${MONTHS[month]} ${year}</div>
          ${(calc.prevDue || 0) > 0 ? `<div class="mb-hero-warn">Includes ${fmtTk(calc.prevDue)} unpaid from before ${MONTHS[prevInfo.month]} ${prevInfo.year}</div>` : ""}
        </div>
        <div class="mb-hero-actions">
          ${pays ? `<button class="btn btn-primary btn-sm" onclick="navigate('give-payment')">Pay now</button>` : ""}
          <button class="btn btn-ghost btn-sm" onclick="showMySettlementBreakdown()">📊 Breakdown</button>
        </div>
      </div>
      ${calc.totalPay > 0 ? `
      <div class="mb-charges">
        <div class="mb-stack">${charges.map(c => `<i style="flex:${c[0]};background:${c[1]}" title="${c[2]} ${fmtTk(c[0])}"></i>`).join("")}</div>
        <div class="mb-legend">${charges.map(c => `<span><i style="background:${c[1]}"></i>${c[2]} <b>${fmtTk(c[0])}</b></span>`).join("")}</div>
      </div>` : ""}
      ${credits.length ? `<div class="mb-credits"><span>Credits</span>${credits.map(c => `<span class="mb-credit">${c}</span>`).join("")}</div>` : ""}
    </div>

    <!-- ── My numbers this month ── -->
    <div class="stat-grid dk-kpis">
      ${kpi("dk-gold",  "🍽️", "My meals", myCurrentMeals, `${myPace}/day · mess avg ${messAvg}`, buildSparkline(sMeals, "var(--accent)"))}
      ${kpi("dk-blue",  "📊", "Meal rate", fmtTk(curMonthMealRate), rateTrend, buildSparkline(sRate, "var(--blue)"))}
      ${kpi(myMealBal >= 0 ? "dk-green" : "dk-red", myMealBal >= 0 ? "💚" : "🧾", myMealBal >= 0 ? "Meal credit" : "Meal cost due",
          fmtTk(Math.abs(myMealBal)), `bazar ${fmtTk(myCurrentBazar)} − meals ${fmtTk(myMealCost)}`,
          buildSparkline(sBal, myMealBal >= 0 ? "var(--green)" : "var(--red)"))}
      ${kpi("dk-gray",  "🛒", "My bazar", fmtTk(myCurrentBazar), `${bazarShare}% of ${fmtTk(curMonthTotalBazar)} mess bazar`, buildSparkline(sBazar, "var(--text2)"))}
    </div>

    <!-- ── Today + my calendar ── -->
    <div class="dk-row">
      <div class="card dk-today">
        <div class="dk-card-title">
          <span><span class="dk-live"></span>${isNextDay ? "Tomorrow" : "Today"} · ${escapeHtml(displayStr)}</span>
          <button class="btn btn-ghost btn-sm" onclick="navigate('my-meals')">Change</button>
        </div>
        ${todayRec ? `
        <div class="mb-me ${eating ? "" : "mb-me-off"}">
          <span class="mb-me-ico">${eating ? "🍽️" : "😴"}</span>
          <div><b>${eating ? "You're eating" : "You're off"}</b>
            <div>${eating ? [me.day && `☀ Day ${me.day}`, me.night && `🌙 Night ${me.night}`].filter(Boolean).join(" · ") : "No meals for you today"}</div></div>
          <span class="mb-me-mess">Mess: <b>${todayDay}</b> day · <b>${todayNight}</b> night</span>
        </div>
        <div class="dk-eaters">
          ${members.map((m, i) => {
            const pt = mealPartsFromObj(todayRec.meals || {}, m.name), col = avatarCol(i), off = pt.day + pt.night === 0;
            return `<div class="dk-eater${off ? " dk-off" : ""}${m.name === member.name ? " dk-me" : ""}">
              <span class="dk-av" style="background:${col.bg};color:${col.fg}">${avFace(m.id, m.name)}</span>
              <span class="dk-eater-name">${escapeHtml(m.name)}</span>
              <span class="dk-dn">${off ? `<i class="dk-absent">Off</i>` : `<i class="${pt.day ? "on-d" : ""}">D</i><i class="${pt.night ? "on-n" : ""}">N</i>`}</span>
            </div>`;
          }).join("")}
        </div>` : `<div class="empty" style="padding:22px 10px">No meal entry for ${isNextDay ? "tomorrow" : "today"} yet</div>`}
      </div>

      <div class="card dk-activity">
        <div class="dk-card-title"><span>My meals · ${MONTHS[month]}</span><span class="dk-legend">${myDaysEaten} days eaten</span></div>
        <div class="dk-cal">
          ${["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"].map(d => `<span class="dk-wd">${d}</span>`).join("")}
          ${Array.from({ length: lead }, () => `<span></span>`).join("")}
          ${Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1, v = myDayMeals[d] || 0;
            const a = v ? (0.3 + (v / myMaxDay) * 0.7).toFixed(2) : 0;
            return `<div class="dk-day${d === todayDay2 ? " dk-today-cell" : ""}${d > daysGone ? " dk-future" : ""}" title="${MONTHS[month]} ${d}: ${v} meals"
              ${v ? `style="--a:${a}"` : ""}><span>${d}</span>${v ? `<b>${v}</b>` : ""}</div>`;
          }).join("")}
        </div>
      </div>
    </div>

    <!-- ── The mess this month ── -->
    ${members.length && curMonthTotalMeals > 0 ? `
    <div class="card">
      <div class="dk-card-title"><span>The mess · ${MONTHS[month]}</span><span class="dk-legend">at ${fmtTk(curMonthMealRate)}/meal</span></div>
      <div class="tbl-wrap">
        <table class="dk-members mb-members">
          <thead><tr><th>Member</th><th>Meals</th><th style="text-align:right">Bazar</th><th style="text-align:right">Meal balance</th></tr></thead>
          <tbody>
          ${members.map((m, i) => {
            const v = round2(memMeals[m.name] || 0), bz = round2(memBazar[m.name] || 0), col = avatarCol(i);
            const bal = round2(bz - v * curMonthMealRate), isMe = m.name === member.name;
            return `<tr class="${isMe ? "dk-me-row" : ""}">
              <td><div class="dk-who"><span class="dk-av" style="background:${col.bg};color:${col.fg}">${avFace(m.id, m.name)}</span>${escapeHtml(m.name)}${isMe ? ` <span class="badge badge-amber">You</span>` : ""}</div></td>
              <td><div class="dk-meals"><div class="dk-bar"><i style="width:${Math.round((v / maxMemMeal) * 100)}%;background:${isMe ? "var(--accent)" : col.fg}"></i></div><b>${v}</b></div></td>
              <td style="text-align:right;color:${bz > 0 ? "var(--green)" : "var(--text3)"};font-weight:600">${bz > 0 ? fmtTk(bz) : "—"}</td>
              <td style="text-align:right">${Math.abs(bal) < 0.01 ? `<span class="badge">Settled</span>`
                : `<span class="badge ${bal > 0 ? "badge-green" : "badge-red"}">${bal > 0 ? "Gets" : "Owes"} ${fmtTk(Math.abs(bal))}</span>`}</td>
            </tr>`;
          }).join("")}
          </tbody>
        </table>
      </div>
    </div>` : ""}

    <!-- ── Mess Info (WiFi, bank, contacts) ── -->
    <div id="my-dash-mess-info"></div>
  </div>`;

  // Load mess info asynchronously
  dbGetMessRules().then(rules => {
    const infoWrap = document.getElementById("my-dash-mess-info");
    if (!infoWrap) return;
    const hasAny = rules && (rules.wifi_pass || rules.bank_info || rules.contacts);
    if (!hasAny) return;
    infoWrap.innerHTML = `
      <div class="card">
        <div class="dk-card-title"><span>🏠 Mess info</span></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
          ${rules.wifi_pass ? `
          <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:12px">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">📶 WiFi</div>
            <div style="font-size:15px;font-weight:700;font-family:monospace;user-select:all;color:var(--accent)">${escapeHtml(rules.wifi_pass)}</div>
          </div>` : ''}
          ${rules.bank_info ? `
          <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:12px">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">💳 Payment</div>
            <div style="font-size:12px;white-space:pre-wrap;color:var(--text2);line-height:1.5">${escapeHtml(rules.bank_info)}</div>
          </div>` : ''}
          ${rules.contacts ? `
          <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:12px">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">📞 Contacts</div>
            <div style="font-size:12px;white-space:pre-wrap;color:var(--text2);line-height:1.5">${escapeHtml(rules.contacts)}</div>
          </div>` : ''}
        </div>
        ${rules.rules_text ? `
        <details style="margin-top:10px">
          <summary style="cursor:pointer;font-size:12px;color:var(--text3);font-weight:600">📜 Mess rules</summary>
          <div style="font-size:13px;color:var(--text2);margin-top:8px;line-height:1.7">${renderMarkdown(rules.rules_text)}</div>
        </details>` : ''}
      </div>`;
  }).catch(() => {});

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

    ${(p.messCredit || 0) > 0 ? `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:rgba(52,152,219,.08);border:1px solid rgba(52,152,219,.3);border-radius:6px;margin-bottom:5px">
        <div>
          <div style="font-weight:600;color:var(--blue)">↩ Carry-forward credit</div>
          <div style="font-size:11px;color:var(--text3)">Credit from last month's overpayment or Mess Owes balance</div>
        </div>
        <div style="font-weight:700;color:var(--blue)">− ${fmtTk(p.messCredit)}</div>
      </div>
    ` : `
      <div style="padding:8px 12px;background:var(--bg3);border-radius:6px;margin-bottom:5px;font-size:12px;color:var(--text3)">
        ↩ No carry-forward credit this month
      </div>
    `}

    ${(p.prevDue || 0) > 0 ? `
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--red);margin:12px 0 6px">
        🔴 Previous due — before ${prevLabel}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:var(--red-bg);border:1px solid rgba(224,82,82,.25);border-radius:6px;margin-bottom:5px">
        <div>
          <div style="font-weight:600;color:var(--red)">⚠️ Unpaid balance carried forward</div>
          <div style="font-size:11px;color:var(--text3)">Still outstanding from settlements before ${prevLabel}</div>
        </div>
        <div style="font-weight:700;color:var(--red)">+ ${fmtTk(p.prevDue)}</div>
      </div>
    ` : ""}

    <div style="display:flex;justify-content:space-between;padding:14px 16px;background:var(--accent-bg);border:2px solid var(--accent);border-radius:8px;margin-top:10px;font-size:17px;font-weight:800">
      <span>Net Payable</span>
      <span style="color:${p.netWithPrevDue > 0 ? 'var(--red)' : p.netWithPrevDue < 0 ? 'var(--green)' : 'var(--text)'}">
        ${p.netWithPrevDue > 0 ? 'Pay ' + fmtTk(p.netWithPrevDue) : p.netWithPrevDue < 0 ? 'Get ' + fmtTk(Math.abs(p.netWithPrevDue)) : '✓ Settled'}
      </span>
    </div>

    <div style="font-size:11px;color:var(--text3);margin-top:10px;line-height:1.6;background:var(--bg3);padding:8px 12px;border-radius:6px">
      <b>Formula:</b> ${fmtTk(p.mealCost)} + ${fmtTk(p.khalaShare)} + ${fmtTk(p.otherShare)} + ${fmtTk(p.roomRent)} + ${fmtTk(p.prepaidUtility)} − ${fmtTk(p.memberBazar)} − ${fmtTk(p.mealPaid||0)} − ${fmtTk(p.roomRentPaid)} − ${fmtTk(p.utilityPaid)}${(p.messCredit||0) > 0 ? ` − ${fmtTk(p.messCredit)} (carried fwd)` : ''}${(p.prevDue||0) > 0 ? ` + ${fmtTk(p.prevDue)} (prev due)` : ''} = <b>${fmtTk(p.netWithPrevDue)}</b>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    </div>
  `;

  document.querySelector(".modal").classList.remove("modal-wide");
  openModal();
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
          <th style="color:var(--blue)">↩ Carry fwd</th>
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
                <td style="color:${(p.messCredit||0)>0?'var(--blue)':'var(--text3)'}">${(p.messCredit||0)>0?'↩ '+fmtTk(p.messCredit):'—'}</td>
                <td><b class="${p.netPayable>0?'net-neg':p.netPayable<0?'net-pos':''}">${p.netPayable>0?'Pay '+fmtTk(p.netPayable):p.netPayable<0?'Get '+fmtTk(Math.abs(p.netPayable)):'✓'}</b></td>
              </tr>`;

          }).join("")}
        </tbody>
      </table></div>
      <div style="font-size:12px;color:var(--text3);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
        💡 <b style="color:var(--blue)">↩ Carry fwd</b> = credit from last month's overpayment or Mess Owes balance applied to reduce this month's net payable.
      </div>
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
    <div><div class="page-title">My Profile</div><div class="page-sub">Your stats, balances and history</div></div>
    <div class="topbar-actions">
      <select class="input" id="my-prof-period" onchange="refreshMyProfile()" style="width:180px">
        <option value="next">Next month</option>
        <option value="1" selected>This month</option>
        <option value="last">Last month</option>
        <option value="3">Last 3 months</option>
        <option value="6">Last 6 months</option>
        <option value="all">All time</option>
      </select>
    </div>
  </div>
  <div class="content dk" id="my-profile-content"><div class="loading"><div class="spinner"></div>Loading…</div></div>`;
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
  if (period === "next") { curM = month === 11 ? 0 : month + 1; curY = month === 11 ? year + 1 : year; }
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
  const filteredUtilForStats = getFilteredUtilityOnly(allU || [], period);
  const s        = getMemberStats(member, meals, bazar, rent, utility, filteredUtilForStats);
  const allStats = getMemberStats(member, allM, allB, allR, allU || [], null); // null = use full allU (all-time)

  const idx = members.findIndex(m => m.id === member.id);
  const col = avatarCol(Math.max(idx, 0));

  const allMK = Object.keys(allStats.byMonth).sort();
  const r8    = allMK.slice(-8);
  const maxM  = Math.max(...r8.map(k => allStats.byMonth[k]?.meals || 0), 1);

  const periodLabel = { "next": "Next month", "1": "This month", "last": "Last month", "3": "Last 3 months", "6": "Last 6 months", "all": "All time" }[period] || "This month";

  const allMealsTotal = meals.reduce((sum, row) => sum + mealRowTotal(row.meals || {}), 0);
  const allBazarTotal = bazar.reduce((sum, row) => sum + Object.values(row.bazar || {}).reduce((a, v) => a + Number(v || 0), 0), 0);
  const mealShare  = allMealsTotal > 0 ? Math.round((s.totalMeals / allMealsTotal) * 100) : 0;
  const bazarShare = allBazarTotal > 0 ? Math.round((s.totalBazar / allBazarTotal) * 100) : 0;

  const settlementCalc = calcMemberSettlement(member, allM, allB, profRentRes, curUtilRec, prevUtilRec, curKey);
  // Outstanding balance from ALL past unpaid settlements (walks the full
  // chain — see calcPrevDueForMember in helpers.js). Previously omitted
  // here entirely, so the What-I-Owe panel on My Profile always showed ৳0
  // prev due regardless of how much a member actually owed from before.
  const prevDueForOwe = calcPrevDueForMember(member, allM, allB, allR, allU || [], curKey);
  // mealNet: positive = member is owed back (bazar+paid > mealCost), negative = member still owes
  const mealNet  = round2(settlementCalc.memberBazar + settlementCalc.mealPaid - settlementCalc.mealCost);
  const myRentEntry = profRentRes?.entries?.find(e => e.name === member.name) || {};
  const myUtilPay   = (curUtilRec?.payments || {})[member.name] || {};
  const rentNet  = round2(Number(myRentEntry.paid || 0) - Number(myRentEntry.rent || 0));
  const utilNet  = getUtilityBalance(member, curUtilRec, prevUtilRec);
  const rc = myRentEntry.status === "paid" ? "badge-green" : myRentEntry.status === "partial" ? "badge-amber" : "badge-red";
  const uc = myUtilPay.status   === "paid" ? "badge-green" : myUtilPay.status   === "partial" ? "badge-amber" : "badge-red";

  const recentMonthsHTML = `
    <div class="card">
      <div class="dk-card-title"><span>Recent months</span></div>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Month</th><th>Meals</th><th>Bazar</th><th>Rent paid</th><th>Util paid</th><th>Net</th></tr></thead>
          <tbody>
            ${allMK.length
              ? allMK.slice(-6).reverse().map(k => {
                  const d      = allStats.byMonth[k] || {};
                  const mIndex = parseInt(k.slice(5), 10) - 1;
                  const y      = k.slice(0, 4);
                  // Per-month net payable — canonical settlement for each historical month
                  const rentByKeyM = {}; allR.forEach(r => { rentByKeyM[r.month_key] = r; });
                  const utilByKeyM = {}; (allU || []).forEach(r => { utilByKeyM[r.month_key] = r; });
                  const prevKM = previousMonthFromKey(k).key;
                  const netCalcM = calcMemberSettlement(member, allM, allB, rentByKeyM[k] || null, utilByKeyM[k] || null, utilByKeyM[prevKM] || null, k);
                  const netCellM = netCalcM.netPayable > 0
                    ? `<b style="color:var(--red)">Pay ${fmtTk(netCalcM.netPayable)}</b>`
                    : netCalcM.netPayable < 0
                      ? `<b style="color:var(--green)">Get ${fmtTk(Math.abs(netCalcM.netPayable))}</b>`
                      : `<b style="color:var(--green)">✓</b>`;
                  return `<tr><td style="white-space:nowrap"><b>${MONTHS[mIndex].slice(0, 3)} ${y}</b></td><td>${round2(d.meals || 0)}</td><td>${fmtTk(d.bazar || 0)}</td><td style="color:var(--green)">${fmtTk(d.rentPaid || 0)}</td><td style="color:var(--green)">${fmtTk(d.utilityPaid || 0)}</td><td>${netCellM}</td></tr>`;
                }).join("")
              : `<tr><td colspan="6" class="empty">No recent data</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>`;

  const whatIOweHTML = buildWhatIOweHTML(member, allM, allB, profRentRes, curUtilRec, prevUtilRec, curM, curY, prevDueForOwe);
  const isMultiPeriod = (period !== "1" && period !== "last");
  const multiPeriodBanner = isMultiPeriod ? `
    <div style="background:var(--accent-bg);border:1px solid rgba(212,168,83,.25);border-radius:var(--radius-sm);padding:9px 13px;margin-bottom:12px;font-size:12px;color:var(--accent);display:flex;align-items:center;gap:8px">
      ℹ️ <span>Stats cover <b>${periodLabel}</b>. 
      Net payable and "What I Owe" are always pinned to the <b>latest settlement month (${monthLabelFromKey(curKey)})</b>.</span>
    </div>` : "";

  // Net payable — the same number as My Dashboard (settlement + carried due)
  const net  = round2(settlementCalc.netPayable + prevDueForOwe);
  const pays = net > 0.01, gets = net < -0.01;
  const chip = (label, v, owedTxt, okTxt) => {
    const due = v < -0.01, credit = v > 0.01;
    return `<span class="pf-chip ${due ? "bad" : "ok"}"><span>${label}</span><b>${due ? `${fmtTk(Math.abs(v))} ${owedTxt}` : credit ? `+${fmtTk(v)} ${okTxt}` : "✓ clear"}</b></span>`;
  };
  const tile = (icon, label, value, sub, bar) => `
    <div class="pf-tile">
      <div class="dk-head"><span class="dk-ico">${icon}</span><span class="dk-label">${label}</span></div>
      <div class="stat-value pf-val">${value}</div>
      <div class="dk-sub">${sub}</div>
      ${bar != null ? `<div class="dk-bar pf-share" title="${bar}% of the mess"><i style="width:${bar}%"></i></div>` : ""}
    </div>`;
  const curHistKey = monthKey(year, month);

  content.innerHTML = `
  ${multiPeriodBanner}
  <div class="card pf-head ${pays ? "mb-pay" : gets ? "mb-get" : ""}">
    <div class="pf-id">
      <div class="avatar pf-av" style="background:${col.bg};color:${col.fg}">${avFace(member.id, member.name)}</div>
      <div class="pf-who">
        <div class="pf-name">${member.name}</div>
        <div class="pf-meta">Room ${member.room || "—"} · @${member.username || "—"} · joined ${member.joined || "—"}</div>
        <div class="pf-chips">
          ${chip("Meals", mealNet, "to pay", "credit")}
          ${chip("Rent", rentNet, "due", "extra")}
          ${chip("Utility", utilNet, "due", "extra")}
        </div>
      </div>
    </div>
    <div class="pf-net">
      <div class="mb-hero-lbl">Net payable · ${monthLabelFromKey(curKey)}</div>
      <div class="pf-net-amt" style="color:${pays ? "var(--red)" : "var(--green)"}">${pays ? "You pay " : gets ? "You get " : "✓ Settled"}${pays || gets ? `<span class="stat-value">${fmtTk(Math.abs(net))}</span>` : ""}</div>
      <div class="pf-net-btns">
        ${pays ? `<button class="btn btn-primary btn-sm" onclick="navigate('give-payment')">💵 Give payment</button>` : ""}
        <button class="btn btn-ghost btn-sm" onclick="navigate('my-receipts')">🧾 Receipts</button>
      </div>
    </div>
  </div>

  <div class="pf-tiles">
    ${tile("🍽️", "Meals · " + periodLabel.toLowerCase(), s.totalMeals, `${s.activeDays} days · ${s.avgMeals}/day`, null)}
    ${tile("🧾", "Meal cost", fmtTk(s.mealCost), `${mealShare}% of mess meals`, mealShare)}
    ${tile("🛒", "Bazar spent", fmtTk(s.totalBazar), `${bazarShare}% of mess bazar`, bazarShare)}
    ${tile("✅", "Paid", fmtTk(round2(s.rentPaid + s.utilityPaid)), `rent ${fmtTk(s.rentPaid)} · utility ${fmtTk(round2(s.utilityPaid))}`, null)}
  </div>

  <div class="pf-grid">
    <div class="pf-col">
      <div class="card">
        <div class="dk-card-title"><span>Meals per month</span><span class="dk-legend">last ${r8.length} month${r8.length === 1 ? "" : "s"}</span></div>
        ${r8.length ? `<div class="an-wd pf-hist" style="grid-template-columns:repeat(${r8.length},minmax(0,1fr))">
          ${r8.map(k => {
            const v = round2(allStats.byMonth[k]?.meals || 0), lbl = MONTHS[parseInt(k.slice(5), 10) - 1].slice(0, 3);
            return `<div class="an-wd-col${k === curHistKey ? " top" : ""}" title="${monthLabelFromKey(k)}: ${v} meals">
              <b>${v}</b><div class="an-wd-bar"><i style="height:${Math.max(3, Math.round((v / maxM) * 100))}%"></i></div><span>${lbl}</span></div>`;
          }).join("")}
        </div>` : `<div class="empty">No history yet</div>`}
      </div>
      ${recentMonthsHTML}
    </div>
    <div class="pf-col">${whatIOweHTML}</div>
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