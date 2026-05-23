/* ═══════════════════════════════════════════════
   MANAGER — Dashboard: overview stats, today's meals, bazar leaders
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

  const bills = utilRec?.bills || {};
  const totalUtil = ["elec", "wifi", "gas", "khala", "other"].reduce((s, k) => s + (Number(bills[k]) || 0), 0);
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
  const topBazar = Object.entries(memBazar).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxB = topBazar[0]?.[1] || 1;

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

  // Onboarding
  const hasMembersAdded = members.length > 1;
  const hasMealsLogged  = mM.length > 0;
  const hasUtilitySet   = !!utilRec;
  const showOnboarding  = !hasMembersAdded || !hasMealsLogged || !hasUtilitySet;

  // ── SVG ring helper ──
  function ringChart(pct, color, size = 52, stroke = 5) {
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const fill = circ * Math.min(pct / 100, 1);
    const cx = size / 2, cy = size / 2;
    const fontSize = size < 48 ? 9 : 11;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg4)" stroke-width="${stroke}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
        stroke-dasharray="${fill} ${circ}" stroke-linecap="round"
        transform="rotate(-90 ${cx} ${cy})"
        style="transition:stroke-dasharray .8s var(--ease-spring)"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
        font-size="${fontSize}" font-weight="700" fill="${color}" font-family="var(--font)">${pct}%</text>
    </svg>`;
  }

  // ── Trend arrow ──
  function trendBadge(cur, prev) {
    if (!prev || prev === 0) return "";
    const diff = round2(cur - prev);
    const pct  = Math.abs(Math.round((diff / prev) * 100));
    if (diff === 0) return `<span style="font-size:10px;color:var(--text3)">→ same as last month</span>`;
    const up = diff > 0;
    return `<span style="font-size:10px;color:${up ? "var(--green)" : "var(--red)"}">${up ? "▲" : "▼"} ${pct}% vs last month</span>`;
  }

  const rentPct  = totalRentDue  > 0 ? Math.round((totalRentPaid / totalRentDue) * 100) : 0;
  const utilPct  = totalUtil     > 0 ? Math.round((totalUtilPaid / totalUtil) * 100) : 0;
  const daysLogged = mM.length;
  const daysGone   = Math.min(todayDay, daysInMonth);
  const logPct     = daysGone > 0 ? Math.round((daysLogged / daysGone) * 100) : 0;

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Dashboard</div>
      <div class="page-sub">${MONTHS[month]} ${year} — ${members.length} member${members.length === 1 ? "" : "s"}</div>
    </div>
    <div class="topbar-actions">
      <button class="btn btn-primary btn-sm" onclick="navigate('meals')">+ Meal</button>
    </div>
  </div>
  <div class="content">
    ${showOnboarding ? buildOnboardingChecklist(hasMembersAdded, hasMealsLogged, hasUtilitySet) : ""}

    <!-- ── Hero stat row ── -->
    <div class="dash-hero-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:14px">

      <!-- Total meals -->
      <div class="stat-card dash-stat" style="border-top:3px solid var(--accent);padding:15px 14px">
        <div class="stat-label">🍽️ Total meals</div>
        <div class="stat-value" style="font-size:26px;color:var(--accent);margin-top:6px;line-height:1">${round2(totalMeals)}</div>
        <div style="margin-top:6px">${trendBadge(totalMeals, prevTotalMeals)}</div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:6px">
          <div style="flex:1;height:4px;background:var(--bg4);border-radius:99px;overflow:hidden">
            <div style="width:${Math.min(100, Math.round((totalMeals / Math.max(prevTotalMeals || totalMeals, 1)) * 100))}%;height:100%;background:var(--accent);border-radius:99px;transition:width .8s var(--ease-spring)"></div>
          </div>
          <span style="font-size:10px;color:var(--text3);white-space:nowrap">${mM.length}d logged</span>
        </div>
      </div>

      <!-- Meal rate -->
      <div class="stat-card dash-stat" style="border-top:3px solid var(--blue);padding:15px 14px">
        <div class="stat-label">📊 Meal rate</div>
        <div class="stat-value" style="font-size:22px;color:var(--blue);margin-top:6px;line-height:1">${fmtTk(mealRate)}</div>
        <div style="margin-top:6px">${trendBadge(mealRate, prevMealRate)}</div>
        <div style="margin-top:8px;font-size:10px;color:var(--text3)">${fmtTk(totalBazar)} ÷ ${round2(totalMeals)} meals</div>
      </div>

      <!-- Total bazar -->
      <div class="stat-card dash-stat" style="border-top:3px solid var(--green);padding:15px 14px">
        <div class="stat-label">🛒 Total bazar</div>
        <div class="stat-value" style="font-size:22px;color:var(--green);margin-top:6px;line-height:1">${fmtTk(totalBazar)}</div>
        <div style="margin-top:6px">${trendBadge(totalBazar, prevTotalBazar)}</div>
        <div style="margin-top:8px;font-size:10px;color:var(--text3)">${topBazar.length} contributor${topBazar.length === 1 ? "" : "s"}</div>
      </div>

      <!-- Rent with ring -->
      <div class="stat-card dash-stat" style="border-top:3px solid var(--amber);padding:15px 14px">
        <div class="stat-label">🏠 Rent collected</div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
          <div style="position:relative;flex-shrink:0">
            ${ringChart(rentPct, "var(--amber)")}
          </div>
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--amber)">${fmtTk(totalRentPaid)}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">of ${fmtTk(totalRentDue)}</div>
            <div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap">
              ${rentPaidCount > 0 ? `<span style="font-size:10px;background:var(--green-bg);color:var(--green);padding:1px 6px;border-radius:99px">✓ ${rentPaidCount}</span>` : ""}
              ${rentPartCount > 0 ? `<span style="font-size:10px;background:var(--accent-bg);color:var(--accent);padding:1px 6px;border-radius:99px">~ ${rentPartCount}</span>` : ""}
              ${rentDueCount  > 0 ? `<span style="font-size:10px;background:var(--red-bg);color:var(--red);padding:1px 6px;border-radius:99px">! ${rentDueCount}</span>` : ""}
            </div>
          </div>
        </div>
      </div>

      <!-- Utility with ring -->
      <div class="stat-card dash-stat" style="border-top:3px solid var(--purple);padding:15px 14px">
        <div class="stat-label">⚡ Utility collected</div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
          <div style="position:relative;flex-shrink:0">
            ${ringChart(utilPct, "var(--purple)")}
          </div>
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--purple)">${fmtTk(round2(totalUtilPaid))}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">of ${fmtTk(round2(totalUtil))}</div>
            <div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap">
              ${utilPaidCount > 0 ? `<span style="font-size:10px;background:var(--green-bg);color:var(--green);padding:1px 6px;border-radius:99px">✓ ${utilPaidCount}</span>` : ""}
              ${utilPartCount > 0 ? `<span style="font-size:10px;background:var(--accent-bg);color:var(--accent);padding:1px 6px;border-radius:99px">~ ${utilPartCount}</span>` : ""}
            </div>
          </div>
        </div>
      </div>

      <!-- Days logged with ring -->
      <div class="stat-card dash-stat" style="border-top:3px solid var(--text3);padding:15px 14px">
        <div class="stat-label">📅 Days logged</div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
          <div style="position:relative;flex-shrink:0">
            ${ringChart(logPct, "var(--text2)", 52, 5)}
          </div>
          <div>
            <div style="font-size:20px;font-weight:700;color:var(--text)">${daysLogged}<span style="font-size:12px;color:var(--text3);font-weight:400"> / ${daysGone}d</span></div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">${daysInMonth - daysGone} days left</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Meal heatmap ── -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-title" style="margin-bottom:10px">📆 Meal activity — ${MONTHS[month]} ${year}</div>
      <div style="display:grid;grid-template-columns:repeat(${Math.min(daysInMonth, 16)},1fr);gap:4px;margin-bottom:6px" id="dash-heatmap">
        ${Array.from({length: daysInMonth}, (_, i) => {
          const d = i + 1;
          const v = dayMealMap[d] || 0;
          const isToday = d === todayDay;
          const pct = v / maxDayMeal;
          const opacity = v === 0 ? 0.12 : 0.2 + pct * 0.8;
          const bg = v === 0
            ? "var(--bg4)"
            : `rgba(212,168,83,${opacity.toFixed(2)})`;
          const border = isToday ? "2px solid var(--accent)" : "1px solid transparent";
          return `<div title="Day ${d}: ${v} meals" style="height:22px;border-radius:4px;background:${bg};border:${border};cursor:default;position:relative;display:flex;align-items:center;justify-content:center">
            <span style="font-size:8px;color:${v > 0 ? "var(--text)" : "var(--text3)"};opacity:0.7">${d}</span>
          </div>`;
        }).join("")}
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
        <span style="font-size:10px;color:var(--text3)">No meals</span>
        ${[0.12, 0.35, 0.6, 0.85, 1].map(o => `<div style="width:14px;height:10px;border-radius:2px;background:rgba(212,168,83,${o})"></div>`).join("")}
        <span style="font-size:10px;color:var(--text3)">High</span>
        <span style="margin-left:auto;font-size:10px;color:var(--text3)">Today = outlined box</span>
      </div>
    </div>

    <!-- ── Today's meals ── -->
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
          const _parts = mealPartsFromObj(todayRec.meals || {}, m.name);
          const d = _parts.day, n = _parts.night;
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
      <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="navigate('meals')">+ Add today's meals</button>
    </div>`}

    <!-- ── Bottom 2-col grid ── -->
    <div class="grid-2" style="gap:12px;margin-bottom:14px">

      <!-- Bazar leaders -->
      <div class="card">
        <div class="card-title">🛒 Bazar leaders — ${MONTHS[month]}</div>
        ${topBazar.length ? topBazar.map(([name, amt], i) => {
          const pct = Math.round((amt / maxB) * 100);
          const col = avatarCol(i);
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:9px">
            <div style="width:26px;height:26px;border-radius:50%;background:${col.bg};color:${col.fg};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0">${initials(name)}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">
                <span style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px">${escapeHtml(name)}</span>
                <span style="font-size:12px;font-weight:600;color:var(--green);flex-shrink:0;margin-left:6px">${fmtTk(amt)}</span>
              </div>
              <div style="height:5px;background:var(--bg4);border-radius:99px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:var(--green);border-radius:99px;transition:width .8s var(--ease-spring)"></div>
              </div>
            </div>
          </div>`;
        }).join("") : '<div class="empty">No bazar data</div>'}
      </div>

      <!-- Rent status -->
      <div class="card">
        <div class="card-title">🏠 Rent status — ${MONTHS[month]}</div>
        ${rentRec?.entries?.length ? `
          <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:70px;background:var(--green-bg);border:1px solid rgba(76,175,130,.2);border-radius:var(--radius-sm);padding:8px;text-align:center">
              <div style="font-size:20px;font-weight:700;color:var(--green)">${rentPaidCount}</div>
              <div style="font-size:10px;color:var(--green);margin-top:1px">Paid</div>
            </div>
            <div style="flex:1;min-width:70px;background:var(--accent-bg);border:1px solid rgba(212,168,83,.2);border-radius:var(--radius-sm);padding:8px;text-align:center">
              <div style="font-size:20px;font-weight:700;color:var(--amber)">${rentPartCount}</div>
              <div style="font-size:10px;color:var(--amber);margin-top:1px">Partial</div>
            </div>
            <div style="flex:1;min-width:70px;background:var(--red-bg);border:1px solid rgba(224,82,82,.2);border-radius:var(--radius-sm);padding:8px;text-align:center">
              <div style="font-size:20px;font-weight:700;color:var(--red)">${rentDueCount}</div>
              <div style="font-size:10px;color:var(--red);margin-top:1px">Due</div>
            </div>
          </div>
          ${rentRec.entries.map(e => {
            const paid = Number(e.paid || 0), due = Number(e.rent || 0);
            const pct2 = due > 0 ? Math.round((paid / due) * 100) : 0;
            const color = e.status === "paid" ? "var(--green)" : e.status === "partial" ? "var(--amber)" : "var(--red)";
            const statusLabel = e.status === "paid" ? "✓ Paid" : e.status === "partial" ? "Partial" : "Due";
            return `<div style="margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span style="font-size:12px;font-weight:500">${escapeHtml(e.name)}</span>
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-size:10px;color:${color};font-weight:600">${statusLabel}</span>
                  <span style="font-size:11px;color:var(--text2)">${fmtTk(paid)}/${fmtTk(due)}</span>
                </div>
              </div>
              <div style="height:5px;background:var(--bg4);border-radius:99px;overflow:hidden">
                <div style="width:${pct2}%;height:100%;background:${color};border-radius:99px;transition:width .8s var(--ease-spring)"></div>
              </div>
            </div>`;
          }).join("")}
        ` : '<div class="empty">No rent data this month</div>'}
      </div>
    </div>

    <!-- ── Member meal comparison ── -->
    ${members.length > 0 && hasMealsLogged ? `
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">👥 Member meal share — ${MONTHS[month]}</div>
      <div style="display:grid;gap:7px">
        ${members.map((m, i) => {
          const v = memMeals[m.name] || 0;
          const pct = Math.round((v / maxMemMeals) * 100);
          const col = avatarCol(i);
          const bazAmt = memBazar[m.name] || 0;
          return `<div style="display:flex;align-items:center;gap:8px">
            <div style="width:26px;height:26px;border-radius:50%;background:${col.bg};color:${col.fg};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0">${initials(m.name)}</div>
            <div style="width:80px;font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0">${escapeHtml(m.name)}</div>
            <div style="flex:1;height:7px;background:var(--bg4);border-radius:99px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:${col.fg};border-radius:99px;opacity:0.85;transition:width .8s var(--ease-spring)"></div>
            </div>
            <span style="font-size:12px;font-weight:600;color:var(--text);width:28px;text-align:right;flex-shrink:0">${v}</span>
            ${bazAmt > 0 ? `<span style="font-size:10px;color:var(--green);background:var(--green-bg);padding:1px 6px;border-radius:99px;flex-shrink:0">${fmtTk(bazAmt)}</span>` : `<span style="width:48px;flex-shrink:0"></span>`}
          </div>`;
        }).join("")}
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:14px;font-size:11px;color:var(--text3)">
        <span>Bar = meals eaten</span>
        <span style="color:var(--green)">Green pill = bazar contributed</span>
      </div>
    </div>` : ""}

  </div>`;
}
