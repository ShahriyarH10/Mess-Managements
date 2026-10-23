/* ═══════════════════════════════════════════════
   MANAGER — Dashboard: KPIs with sparklines, today, meal calendar, collections, members
   ═══════════════════════════════════════════════ */
async function renderDashboard(el) {
  const { month, year } = thisMonth();
  const key = monthKey(year, month);
  const prevInfo = previousMonth(month, year);
  const [allMeals, allBazar, rentRec, utilRes, prevUtilRes] = await Promise.all([
    dbGetAll("meals"), dbGetAll("bazar"), dbGetMonth("rent", key),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle(),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", prevInfo.key).maybeSingle(),
  ]);
  const utilRec = utilRes.data;

  const mM = allMeals.filter(r => r.date.startsWith(key));
  const mB = allBazar.filter(r => r.date.startsWith(key));
  const prevMM = allMeals.filter(r => r.date.startsWith(prevInfo.key));
  const prevMB = allBazar.filter(r => r.date.startsWith(prevInfo.key));

  let totalMeals = 0, totalBazar = 0;
  mM.forEach(r => {
    const mObj = r.meals || {};
    const keys = Object.keys(mObj);
    const hasSplit = keys.some(k => k.endsWith("_day") || k.endsWith("_night"));
    if (hasSplit) {
      keys.forEach(k => { if (k.endsWith("_day") || k.endsWith("_night")) totalMeals += Number(mObj[k]) || 0; });
    } else {
      Object.values(mObj).forEach(v => { totalMeals += Number(v) || 0; });
    }
  });
  mB.forEach(r => Object.values(r.bazar || {}).forEach(v => { totalBazar += Number(v); }));

  let prevTotalMeals = 0, prevTotalBazar = 0;
  prevMM.forEach(r => {
    const mObj = r.meals || {}, keys = Object.keys(mObj);
    const hasSplit = keys.some(k => k.endsWith("_day") || k.endsWith("_night"));
    if (hasSplit) keys.forEach(k => { if (k.endsWith("_day") || k.endsWith("_night")) prevTotalMeals += Number(mObj[k]) || 0; });
    else Object.values(mObj).forEach(v => { prevTotalMeals += Number(v) || 0; });
  });
  prevMB.forEach(r => Object.values(r.bazar || {}).forEach(v => { prevTotalBazar += Number(v); }));

  const mealRate = totalMeals > 0 ? round2(totalBazar / totalMeals) : 0;
  const prevMealRate = prevTotalMeals > 0 ? round2(prevTotalBazar / prevTotalMeals) : 0;

  const totalRentDue  = rentRec?.entries?.reduce((s, e) => s + Number(e.rent || 0), 0) || 0;
  const totalRentPaid = rentRec?.entries?.reduce((s, e) => s + Number(e.paid || 0), 0) || 0;
  const rentPaidCount = rentRec?.entries?.filter(e => e.status === "paid").length || 0;
  const rentPartCount = rentRec?.entries?.filter(e => e.status === "partial").length || 0;
  const rentDueCount  = rentRec?.entries?.filter(e => !e.status || e.status === "unpaid").length || 0;

  const bills     = utilRec?.bills || {};
  const prevBills = prevUtilRes.data?.bills || {};
  const currentPrepaid   = ["elec", "wifi", "gas"].reduce((s, k) => s + (Number(bills[k])     || 0), 0);
  const previousPostpaid = ["khala", "other"].reduce((s, k) => s + (Number(prevBills[k]) || 0), 0);
  const totalUtil = round2(currentPrepaid + previousPostpaid);
  const totalUtilPaid = Object.values(utilRec?.payments || {}).reduce((s, p) => s + Number(p.paid || 0), 0);
  const utilPaidCount = Object.values(utilRec?.payments || {}).filter(p => p.status === "paid").length;
  const utilPartCount = Object.values(utilRec?.payments || {}).filter(p => p.status === "partial").length;

  // Date logic
  const now = new Date();
  const displayDate = now.getHours() >= 23 ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : now;
  const displayStr = `${displayDate.getFullYear()}-${String(displayDate.getMonth() + 1).padStart(2, "0")}-${String(displayDate.getDate()).padStart(2, "0")}`;
  const isNextDay = now.getHours() >= 23;
  const todayRec = allMeals.find(r => r.date === displayStr);

  // Bazar data
  let memBazar = {};
  mB.forEach(r => Object.entries(r.bazar || {}).forEach(([k, v]) => { memBazar[k] = (memBazar[k] || 0) + Number(v); }));

  // Today's meals
  let todayDayTotal = 0, todayNightTotal = 0;
  if (todayRec) {
    members.forEach(m => {
      const _dp = mealPartsFromObj(todayRec.meals || {}, m.name);
      todayDayTotal   += _dp.day;
      todayNightTotal += _dp.night;
    });
    todayDayTotal = round2(todayDayTotal);
    todayNightTotal = round2(todayNightTotal);
  }

  // Per-member meals this month
  const memMeals = {};
  members.forEach(m => { memMeals[m.name] = 0; });
  mM.forEach(r => { members.forEach(m => { memMeals[m.name] = round2((memMeals[m.name] || 0) + mealMemberTotal(r.meals || {}, m.name)); }); });
  const maxMemMeals = Math.max(...Object.values(memMeals), 1);

  // Daily meal heatmap data (day-of-month → total meals)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayMealMap = {};
  mM.forEach(r => {
    const dd = parseInt(r.date.slice(8), 10);
    const mObj = r.meals || {}, keys = Object.keys(mObj);
    const hasSplit = keys.some(k => k.endsWith("_day") || k.endsWith("_night"));
    let dt = 0;
    if (hasSplit) keys.forEach(k => { if (k.endsWith("_day") || k.endsWith("_night")) dt += Number(mObj[k]) || 0; });
    else Object.values(mObj).forEach(v => { dt += Number(v) || 0; });
    dayMealMap[dd] = (dayMealMap[dd] || 0) + dt;
  });
  const maxDayMeal = Math.max(...Object.values(dayMealMap), 1);
  const todayDay = now.getDate();

  // Onboarding — auto-dismiss when all done; manual dismiss stored in localStorage
  const hasMembersAdded = members.length > 1;
  const hasMealsLogged  = mM.length > 0;
  const hasUtilitySet   = !!utilRec;
  const allDone         = hasMembersAdded && hasMealsLogged && hasUtilitySet;
  const dismissed       = lsGet(`mm_onboard_done_${messId()}`);
  const showOnboarding  = !allDone && !dismissed;
  if (allDone && !dismissed) lsSet(`mm_onboard_done_${messId()}`, '1');

  // ── Per-day series (1..today) for the sparklines ──
  const daysGone   = Math.min(todayDay, daysInMonth);
  const daysLogged = mM.length;
  const dayBazarMap = {};
  mB.forEach(r => {
    const dd = parseInt(r.date.slice(8), 10);
    dayBazarMap[dd] = (dayBazarMap[dd] || 0) + Object.values(r.bazar || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  });
  const mealSeries = [], bazarSeries = [], rateSeries = [];
  let cumM = 0, cumB = 0;
  for (let d = 1; d <= daysGone; d++) {
    cumM += dayMealMap[d] || 0; cumB += dayBazarMap[d] || 0;
    mealSeries.push(dayMealMap[d] || 0);
    bazarSeries.push(cumB);
    rateSeries.push(cumM > 0 ? cumB / cumM : 0);
  }

  /* Trend by per-day pace, so a month in progress isn't always "down". good: "up" | "down" | null (neutral) */
  const prevDays = new Set(prevMM.map(r => r.date)).size;
  function trend(cur, prev, good) {
    if (!prev || !isFinite(prev) || !cur) return `<span class="dk-trend">— no ${MONTHS[prevInfo.month]} data</span>`;
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (pct === 0) return `<span class="dk-trend">→ same as ${MONTHS[prevInfo.month].slice(0, 3)}</span>`;
    const up = pct > 0;
    const cls = !good ? "" : (up === (good === "up")) ? "dk-good" : "dk-bad";
    return `<span class="dk-trend ${cls}">${up ? "↑" : "↓"} ${Math.abs(pct)}% vs ${MONTHS[prevInfo.month].slice(0, 3)}</span>`;
  }

  const pace     = daysLogged > 0 ? round2(totalMeals / daysLogged) : 0;
  const prevPace = prevDays > 0 ? prevTotalMeals / prevDays : 0;
  const bzPace     = daysGone > 0 ? round2(totalBazar / daysGone) : 0;
  const prevDim    = new Date(prevInfo.year, prevInfo.month + 1, 0).getDate();
  const prevBzPace = prevTotalBazar / prevDim;
  const rentPct  = totalRentDue > 0 ? Math.min(100, Math.round((totalRentPaid / totalRentDue) * 100)) : 0;
  const utilPct  = totalUtil    > 0 ? Math.min(100, Math.round((totalUtilPaid / totalUtil) * 100)) : 0;
  const logPct   = daysGone > 0 ? Math.round((daysLogged / daysGone) * 100) : 0;
  const outstanding = round2(Math.max(0, totalRentDue - totalRentPaid) + Math.max(0, totalUtil - totalUtilPaid));
  const utilDueCount = Math.max(0, members.length - utilPaidCount - utilPartCount);

  const kpi = (cls, icon, label, value, sub, graphic) => `
    <div class="dk-card ${cls}">
      <div class="dk-head"><span class="dk-ico">${icon}</span><span class="dk-label">${label}</span></div>
      <div class="stat-value dk-value">${value}</div>
      <div class="dk-sub">${sub}</div>
      ${graphic}
    </div>`;

  const collectRow = (icon, label, paid, due, pct, chips, color) => `
    <div class="dk-coll">
      <div class="dk-coll-top">
        <span class="dk-coll-lbl">${icon} ${label}</span>
        <span class="dk-coll-pct" style="color:${color}">${pct}%</span>
      </div>
      <div class="dk-bar"><i style="width:${pct}%;background:${color}"></i></div>
      <div class="dk-coll-bot">
        <span><b>${fmtTk(round2(paid))}</b> of ${fmtTk(round2(due))}</span>
        <span class="dk-chips">${chips}</span>
      </div>
    </div>`;
  const chip = (n, txt, cls) => n > 0 ? `<span class="dk-chip ${cls}">${n} ${txt}</span>` : "";

  // Calendar starts on Saturday (the Bangladeshi week)
  const lead = (new Date(year, month, 1).getDay() + 1) % 7;
  const rentBy = {}; (rentRec?.entries || []).forEach(e => { rentBy[e.name] = e; });
  const utilBy = utilRec?.payments || {};
  const statusBadge = (st, extra) => {
    const map = { paid: ["badge-green", "Paid"], partial: ["badge-amber", "Partial"] };
    const [c, t] = map[st] || ["badge-red", "Due"];
    return `<span class="badge ${c}">${t}</span>${extra ? `<div class="dk-mini">${extra}</div>` : ""}`;
  };

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Dashboard</div>
      <div class="page-sub">${MONTHS[month]} ${year} · ${members.length} member${members.length === 1 ? "" : "s"} · day ${daysGone} of ${daysInMonth}</div>
    </div>
    <div class="topbar-actions">
      <button class="btn btn-ghost btn-sm" data-on-click="navigate('collect')">💵 Collect</button>
      <button class="btn btn-primary btn-sm" data-on-click="navigate('meals')">+ Meal</button>
    </div>
  </div>
  <div class="content dk">
    ${showOnboarding ? buildOnboardingChecklist(hasMembersAdded, hasMealsLogged, hasUtilitySet) : ""}

    <!-- ── KPIs ── -->
    <div class="stat-grid dk-kpis">
      ${kpi("dk-gold",  "🍽️", "Meals",     round2(totalMeals), `${pace}/day · ${trend(pace, prevPace, null)}`, buildSparkline(mealSeries, "var(--accent)"))}
      ${kpi("dk-blue",  "📊", "Meal rate", fmtTk(mealRate),   trend(mealRate, prevMealRate, "down"),             buildSparkline(rateSeries, "var(--blue)"))}
      ${kpi("dk-green", "🛒", "Bazar",     fmtTk(totalBazar), `${fmtTk(bzPace)}/day · ${trend(bzPace, prevBzPace, null)}`, buildSparkline(bazarSeries, "var(--green)"))}
      ${kpi("dk-gray",  "📅", "Days logged", daysLogged, `of ${daysGone} so far · ${daysInMonth - daysGone} left`,
        `<div class="dk-bar dk-bar-kpi"><i style="width:${logPct}%;background:${logPct >= 100 ? "var(--green)" : "var(--accent)"}"></i></div>`)}
    </div>

    <!-- ── Today + Meal activity ── -->
    <div class="dk-row">
      <div class="card dk-today">
        <div class="dk-card-title">
          <span><span class="dk-live"></span>${isNextDay ? "Tomorrow" : "Today"} · ${new Date(displayStr + "T00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
          <button class="btn btn-ghost btn-sm" data-on-click="navigate('meals')">${todayRec ? "Edit" : "Add"}</button>
        </div>
        ${todayRec ? `
        <div class="dk-today-nums">
          <div><span class="stat-value" style="color:var(--blue)">${todayDayTotal}</span><small>Day</small></div>
          <div><span class="stat-value" style="color:var(--accent)">${todayNightTotal}</span><small>Night</small></div>
          <div><span class="stat-value">${round2(todayDayTotal + todayNightTotal)}</span><small>Total</small></div>
        </div>
        <div class="dk-eaters">
          ${members.map((m, i) => {
            const pt = mealPartsFromObj(todayRec.meals || {}, m.name), col = avatarCol(i), off = pt.day + pt.night === 0;
            return `<div class="dk-eater${off ? " dk-off" : ""}" title="${escapeHtml(m.name)}: day ${pt.day}, night ${pt.night}">
              <span class="dk-av" style="background:${col.bg};color:${col.fg}">${avFace(m.id, m.name)}</span>
              <span class="dk-eater-name">${escapeHtml(m.name)}</span>
              <span class="dk-dn">${off ? `<i class="dk-absent">Off</i>` : `<i class="${pt.day ? "on-d" : ""}">D${pt.day > 1 ? pt.day : ""}</i><i class="${pt.night ? "on-n" : ""}">N${pt.night > 1 ? pt.night : ""}</i>`}</span>
            </div>`;
          }).join("")}
        </div>` : `
        <div class="empty" style="padding:22px 10px">
          <div>No meals entered for ${isNextDay ? "tomorrow" : "today"} yet</div>
          <button class="btn btn-primary btn-sm" style="margin-top:10px" data-on-click="navigate('meals')">+ Add meals</button>
        </div>`}
      </div>

      <div class="card dk-activity">
        <div class="dk-card-title"><span>Meal activity · ${MONTHS[month]}</span><span class="dk-legend">less <i style="opacity:.25"></i><i style="opacity:.55"></i><i style="opacity:1"></i> more</span></div>
        <div class="dk-cal">
          ${["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"].map(d => `<span class="dk-wd">${d}</span>`).join("")}
          ${Array.from({ length: lead }, () => `<span></span>`).join("")}
          ${Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1, v = round2(dayMealMap[d] || 0), future = d > daysGone;
            const a = v ? (0.22 + (v / maxDayMeal) * 0.78).toFixed(2) : 0;
            return `<div class="dk-day${d === todayDay ? " dk-today-cell" : ""}${future ? " dk-future" : ""}" title="${MONTHS[month]} ${d}: ${v} meals"
              ${v ? `style="--a:${a}"` : ""}><span>${d}</span>${v ? `<b>${v}</b>` : ""}</div>`;
          }).join("")}
        </div>
      </div>
    </div>

    <!-- ── Collections ── -->
    <div class="card dk-collections">
      <div class="dk-card-title">
        <span>Collections · ${MONTHS[month]}</span>
        <span class="dk-outstanding">${outstanding > 0 ? `Outstanding <b>${fmtTk(outstanding)}</b>` : `<b style="color:var(--green)">✓ All collected</b>`}</span>
      </div>
      <div class="dk-coll-grid">
        ${rentRec?.entries?.length
          ? collectRow("🏠", "Room rent", totalRentPaid, totalRentDue, rentPct,
              chip(rentPaidCount, "paid", "ok") + chip(rentPartCount, "partial", "mid") + chip(rentDueCount, "due", "bad"), "var(--accent)")
          : `<div class="dk-coll dk-coll-empty">🏠 No rent set for ${MONTHS[month]} <button class="btn btn-ghost btn-sm" data-on-click="navigate('rent')">Set rent</button></div>`}
        ${totalUtil > 0
          ? collectRow("⚡", "Utility", totalUtilPaid, totalUtil, utilPct,
              chip(utilPaidCount, "paid", "ok") + chip(utilPartCount, "partial", "mid") + chip(utilDueCount, "due", "bad"), "var(--purple)")
          : `<div class="dk-coll dk-coll-empty">⚡ No utility bills for ${MONTHS[month]} <button class="btn btn-ghost btn-sm" data-on-click="navigate('utility')">Add bills</button></div>`}
      </div>
    </div>

    <!-- ── Members ── -->
    ${members.length ? `
    <div class="card">
      <div class="dk-card-title"><span>Members · ${MONTHS[month]}</span><button class="btn btn-ghost btn-sm" data-on-click="navigate('profiles')">Profiles →</button></div>
      <div class="tbl-wrap">
        <table class="dk-members">
          <thead><tr><th>Member</th><th>Meals</th><th style="text-align:right">Bazar</th><th>Rent</th><th>Utility</th></tr></thead>
          <tbody>
          ${members.map((m, i) => {
            const v = memMeals[m.name] || 0, col = avatarCol(i), bz = memBazar[m.name] || 0;
            const re = rentBy[m.name], up = utilBy[m.name];
            return `<tr>
              <td><div class="dk-who"><span class="dk-av" style="background:${col.bg};color:${col.fg}">${avFace(m.id, m.name)}</span>${escapeHtml(m.name)}</div></td>
              <td><div class="dk-meals"><div class="dk-bar"><i style="width:${Math.round((v / maxMemMeals) * 100)}%;background:${col.fg}"></i></div><b>${v}</b></div></td>
              <td style="text-align:right;color:${bz > 0 ? "var(--green)" : "var(--text3)"};font-weight:600">${bz > 0 ? fmtTk(bz) : "—"}</td>
              <td>${re ? statusBadge(re.status, `${fmtTk(Number(re.paid || 0))}/${fmtTk(Number(re.rent || 0))}`) : `<span style="color:var(--text3)">—</span>`}</td>
              <td>${totalUtil > 0 ? statusBadge(up?.status, up?.paid ? fmtTk(Number(up.paid)) : "") : `<span style="color:var(--text3)">—</span>`}</td>
            </tr>`;
          }).join("")}
          </tbody>
        </table>
      </div>
    </div>` : ""}
  </div>`;
}
