/* ═══════════════════════════════════════════════
   MANAGER — Dashboard: overview stats, today's meals, bazar leaders
   ═══════════════════════════════════════════════ */
async function renderDashboard(el) {
  const { month, year } = thisMonth();
  const key = monthKey(year, month);
  const [allMeals, allBazar, rentRec, utilRes] = await Promise.all([
    dbGetAll("meals"), dbGetAll("bazar"), dbGetMonth("rent", key),
    sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle(),
  ]);
  const utilRec = utilRes.data;
  const mM = allMeals.filter(r => r.date.startsWith(key));
  const mB = allBazar.filter(r => r.date.startsWith(key));
  let totalMeals=0, totalBazar=0;
  mM.forEach(r => {
    const mObj = r.meals || {};
    const keys = Object.keys(mObj);
    const hasSplit = keys.some(k => k.endsWith("_day") || k.endsWith("_night"));
    if (hasSplit) {
      // Sum only _day and _night keys to avoid double-counting the legacy plain-name key
      keys.forEach(k => { if (k.endsWith("_day") || k.endsWith("_night")) totalMeals += Number(mObj[k]) || 0; });
    } else {
      // Legacy format: plain name keys only
      Object.values(mObj).forEach(v => { totalMeals += Number(v) || 0; });
    }
  });
  mB.forEach(r => Object.values(r.bazar||{}).forEach(v => totalBazar+=Number(v)));
  const mealRate = totalMeals > 0 ? round2(totalBazar/totalMeals) : 0;
  const totalRentDue  = rentRec?.entries?.reduce((s,e)=>s+Number(e.rent||0),0)||0;
  const totalRentPaid = rentRec?.entries?.reduce((s,e)=>s+Number(e.paid||0),0)||0;
  const bills = utilRec?.bills||{};
  const totalUtil = ["elec","wifi","gas","khala","other"].reduce((s,k)=>s+(Number(bills[k])||0),0);
  const totalUtilPaid = Object.values(utilRec?.payments||{}).reduce((s,p)=>s+Number(p.paid||0),0);
  // After 11 pm, show next day's meal entry so managers can plan ahead
  const now = new Date();
  const displayDate = now.getHours() >= 23
    ? new Date(now.getTime() + 24*60*60*1000)
    : now;
  const displayStr = `${displayDate.getFullYear()}-${String(displayDate.getMonth()+1).padStart(2,"0")}-${String(displayDate.getDate()).padStart(2,"0")}`;
  const isNextDay = now.getHours() >= 23;
  const todayStr = today();
  const todayRec = allMeals.find(r => r.date===displayStr);
  let memBazar={};
  mB.forEach(r => Object.entries(r.bazar||{}).forEach(([k,v])=>{ memBazar[k]=(memBazar[k]||0)+Number(v); }));
  const topBazar = Object.entries(memBazar).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxB = topBazar[0]?.[1]||1;
  let todayDayTotal=0, todayNightTotal=0;
  if (todayRec) {
    members.forEach(m => {
      const _dp = mealPartsFromObj(todayRec.meals||{}, m.name);
      todayDayTotal   += _dp.day;
      todayNightTotal += _dp.night;
    });
    todayDayTotal=round2(todayDayTotal); todayNightTotal=round2(todayNightTotal);
  }
  // Onboarding checklist for new messes
  const hasMembersAdded = members.length > 1; // more than just the manager
  const hasMealsLogged  = mM.length > 0;
  const hasUtilitySet   = !!utilRec;
  const showOnboarding  = !hasMembersAdded || !hasMealsLogged || !hasUtilitySet;

  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">Dashboard</div><div class="page-sub">${MONTHS[month]} ${year} — ${members.length} members</div></div>
    <div class="topbar-actions">
      <button class="btn btn-ghost btn-sm" onclick="navigate('announce')">📢 Post notice</button>
      <button class="btn btn-primary btn-sm" onclick="navigate('meals')">+ Meal</button>
    </div>
  </div>
  <div class="content">
    ${showOnboarding ? buildOnboardingChecklist(hasMembersAdded, hasMealsLogged, hasUtilitySet) : ""}
    <div class="stat-grid">
      <div class="stat-card" style="border-top:3px solid var(--accent);padding:16px 14px">
        <div class="stat-label" style="display:flex;align-items:center;gap:5px">🍽️ Total meals</div>
        <div class="stat-value" style="font-size:22px;margin-top:6px;color:var(--accent)">${round2(totalMeals)}</div>
      </div>
      <div class="stat-card" style="border-top:3px solid var(--blue);padding:16px 14px">
        <div class="stat-label" style="display:flex;align-items:center;gap:5px">📊 Meal rate</div>
        <div class="stat-value" style="font-size:20px;margin-top:6px;color:var(--blue)">${fmtTk(mealRate)}</div>
      </div>
      <div class="stat-card" style="border-top:3px solid var(--green);padding:16px 14px">
        <div class="stat-label" style="display:flex;align-items:center;gap:5px">🛒 Total bazar</div>
        <div class="stat-value" style="font-size:20px;margin-top:6px;color:var(--green)">${fmtTk(totalBazar)}</div>
      </div>
      <div class="stat-card" style="border-top:3px solid #a78bfa;padding:16px 14px">
        <div class="stat-label" style="display:flex;align-items:center;gap:5px">⚡ Utility</div>
        <div class="stat-value" style="font-size:18px;margin-top:6px;color:var(--purple);word-break:break-word">${fmtTk(round2(totalUtilPaid))}<span style="font-size:12px;color:var(--text3);font-weight:400">/${fmtTk(round2(totalUtil))}</span></div>
      </div>
      <div class="stat-card" style="border-top:3px solid var(--amber);padding:16px 14px">
        <div class="stat-label" style="display:flex;align-items:center;gap:5px">🏠 Rent</div>
        <div class="stat-value" style="font-size:18px;margin-top:6px;color:var(--amber);word-break:break-word">${fmtTk(totalRentPaid)}<span style="font-size:12px;color:var(--text3);font-weight:400">/${fmtTk(totalRentDue)}</span></div>
      </div>
      <div class="stat-card" style="border-top:3px solid var(--text3);padding:16px 14px">
        <div class="stat-label" style="display:flex;align-items:center;gap:5px">📅 Days logged</div>
        <div class="stat-value" style="font-size:22px;margin-top:6px;color:var(--text)">${mM.length}</div>
      </div>
    </div>
    ${todayRec ? `
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">${isNextDay ? "Tomorrow's meals" : "Today's meals"} — ${displayStr}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:12px">
        <div class="stat-card badge-blue"><div class="stat-label" style="color:var(--blue)">Day meals</div><div class="stat-value" style="color:var(--blue)">${todayDayTotal}</div></div>
        <div class="stat-card badge-amber"><div class="stat-label" style="color:var(--amber)">Night meals</div><div class="stat-value" style="color:var(--amber)">${todayNightTotal}</div></div>
        <div class="stat-card"><div class="stat-label">Total today</div><div class="stat-value">${round2(todayDayTotal+todayNightTotal)}</div></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${members.map(m => {
          const t=mealMemberTotal(todayRec.meals||{}, m.name);
          const _parts=mealPartsFromObj(todayRec.meals||{}, m.name);
          const d=_parts.day, n=_parts.night;
          return `<div style="display:flex;align-items:center;gap:8px;background:var(--bg3);padding:7px 12px;border-radius:var(--radius-sm);border:1px solid var(--border)">
            <span style="font-size:13px;font-weight:500;color:${t>0?"var(--text)":"var(--text3)"}">${m.name}</span>
            ${d>0?`<span class="badge badge-blue">Day ${d}</span>`:""}
            ${n>0?`<span class="badge badge-amber">Night ${n}</span>`:""}
            ${t===0?`<span class="badge badge-red">Absent</span>`:""}
          </div>`;
        }).join("")}
      </div>
    </div>` : `
    <div class="card" style="margin-bottom:14px;text-align:center;padding:24px">
      <div style="color:var(--text3);font-size:13px">No meal entry for ${isNextDay ? "tomorrow" : "today"} yet</div>
      <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="navigate('meals')">+ Add today's meals</button>
    </div>`}
    <div class="grid-2" style="gap:12px">
      <div class="card">
        <div class="card-title">Bazar leaders — ${MONTHS[month]}</div>
        ${topBazar.length ? topBazar.map(([name,amt])=>`<div class="mini-bar"><div class="mini-bar-label">${name}</div><div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.round((amt/maxB)*100)}%"></div></div><div class="mini-bar-val">${fmtTk(amt)}</div></div>`).join("") : '<div class="empty">No bazar data</div>'}
      </div>
      <div class="card">
        <div class="card-title">Rent status — ${MONTHS[month]}</div>
        ${rentRec?.entries?.length ? rentRec.entries.map(e=>{
          const cls=e.status==="paid"?"badge-green":e.status==="partial"?"badge-amber":"badge-red";
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border);margin-bottom:5px">
            <span style="font-size:13px;font-weight:500">${e.name}</span>
            <div style="display:flex;gap:7px;align-items:center">
              <span class="badge ${cls}">${e.status==="paid"?"Paid":e.status==="partial"?"Part":"Due"}</span>
              <span style="font-size:12px;color:var(--text2)">${fmtTk(e.paid)}/${fmtTk(e.rent)}</span>
            </div>
          </div>`;
        }).join("") : '<div class="empty">No rent data this month</div>'}
      </div>
    </div>
  </div>`;
}
