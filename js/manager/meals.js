/* ═══════════════════════════════════════════════
   MANAGER — Meals: meal entry, save, load, approval
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   MEAL ENTRY
═══════════════════════════════════════════ */
const mealDayVals={}, mealNightVals={};
async function renderMeals(el) {
  // Render the shell with tabs — Entry tab shown by default
  el.innerHTML=`
  <div class="topbar">
    <div><div class="page-title">Meal Entry</div><div class="page-sub">Log meals or view the absence calendar</div></div>
    <div class="topbar-actions">
      <div style="display:flex;gap:0;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden">
        <button id="meal-tab-entry" onclick="switchMealTab('entry')"
          style="padding:6px 16px;font-size:12px;font-weight:600;border:none;cursor:pointer;transition:all .15s;background:var(--accent);color:#0f0f0f;border-radius:0">
          📝 Entry
        </button>
        <button id="meal-tab-calendar" onclick="switchMealTab('calendar')"
          style="padding:6px 16px;font-size:12px;font-weight:600;border:none;cursor:pointer;transition:all .15s;background:transparent;color:var(--text2);border-radius:0">
          📅 Calendar
        </button>
      </div>
    </div>
  </div>
  <div class="content">
    <!-- Entry tab -->
    <div id="meal-pane-entry">
      <div class="card" style="margin-bottom:12px">
        <div class="date-row"><label>Date</label><input type="date" class="input" id="meal-date" value="${today()}" style="width:170px" onchange="loadMealDate()"/><button class="btn btn-ghost btn-sm" onclick="loadMealDate()">Load</button></div>
        <div class="stat-grid" style="margin-bottom:12px">
          <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value" id="mt-total">0</div></div>
          <div class="stat-card"><div class="stat-label">Day</div><div class="stat-value" id="mt-day">0</div></div>
          <div class="stat-card"><div class="stat-label">Night</div><div class="stat-value" id="mt-night">0</div></div>
          <div class="stat-card"><div class="stat-label">Eating</div><div class="stat-value" id="mt-eating">0</div></div>
        </div>
        <div class="meal-grid" id="meal-grid"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
          <button class="btn btn-primary" onclick="saveMeals()">Save meals</button>
          <button class="btn btn-ghost" onclick="setAllMeals('day',1)">Day All → 1</button>
          <button class="btn btn-ghost" onclick="setAllMeals('night',1)">Night All → 1</button>
          <button class="btn btn-ghost" onclick="setAllMeals('both',1)">All → 1</button>
          <button class="btn btn-ghost" onclick="setAllMeals('both',0)">Clear</button>
        </div>
      </div>
      <div class="grid-2" style="align-items:start">
        <div class="card"><div class="card-title">Recent entries</div><div class="tbl-wrap" id="meals-tbl"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
        <div class="card"><div class="card-title">Month history</div><div id="manager-meal-months"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
      </div>
    </div>
    <!-- Calendar tab (lazy-loaded) -->
    <div id="meal-pane-calendar" style="display:none">
      <div id="absence-cal-outer"></div>
    </div>
  </div>`;
  members.forEach(m=>{
    mealDayVals[m.id]   = m.meal_default_day ?? 1;
    mealNightVals[m.id] = 1;
  });
  window._absentDay = {}; window._absentNight = {};
  await loadMealDate(); loadMealsRecent(); loadManagerMealMonths();
}

function switchMealTab(tab) {
  const isEntry = tab === 'entry';
  document.getElementById('meal-pane-entry').style.display    = isEntry ? '' : 'none';
  document.getElementById('meal-pane-calendar').style.display = isEntry ? 'none' : '';
  const btnEntry = document.getElementById('meal-tab-entry');
  const btnCal   = document.getElementById('meal-tab-calendar');
  if (btnEntry) { btnEntry.style.background = isEntry ? 'var(--accent)' : 'transparent'; btnEntry.style.color = isEntry ? '#0f0f0f' : 'var(--text2)'; }
  if (btnCal)   { btnCal.style.background   = isEntry ? 'transparent' : 'var(--accent)'; btnCal.style.color   = isEntry ? 'var(--text2)' : '#0f0f0f'; }
  if (!isEntry) {
    const outer = document.getElementById('absence-cal-outer');
    if (outer && !outer._loaded) {
      outer._loaded = true;
      // Inject the calendar controls + mount point and load
      const now = new Date();
      const { month, year } = thisMonth();
      outer.innerHTML = `
        <div class="topbar" style="padding:0 0 18px 0">
          <div></div>
          <div class="topbar-actions">
            <select class="input" id="cal-month" style="width:130px" onchange="loadAbsenceCalendar()">
              ${MONTHS.map((m, i) => `<option value="${i}" ${i===month?"selected":""}>${m}</option>`).join("")}
            </select>
            <select class="input" id="cal-year" style="width:88px" onchange="loadAbsenceCalendar()">
              ${Array.from({length:6},(_,i)=>new Date().getFullYear()-2+i).map(y=>`<option value="${y}" ${y===year?"selected":""}>${y}</option>`).join("")}
            </select>
          </div>
        </div>
        <div id="absence-cal-wrap"><div class="empty" style="padding:32px;text-align:center"><div class="spinner"></div></div></div>`;
      loadAbsenceCalendar();
    }
  }
}
function buildMealGrid() {
  const g=document.getElementById("meal-grid"); if(!g) return;
  const abDay   = window._absentDay   || {};
  const abNight = window._absentNight || {};
  g.innerHTML=members.map(m=>{
    const dayAbsent   = abDay[m.id];
    const nightAbsent = abNight[m.id];
    return `
    <div class="meal-cell" style="${(dayAbsent && nightAbsent) ? "opacity:.6;" : ""}">
      <div class="meal-cell-name">${escapeHtml(m.name)}${(dayAbsent||nightAbsent) ? `<span style="font-size:9px;color:var(--red);margin-left:5px;background:var(--red-bg);padding:1px 5px;border-radius:99px">absent</span>` : ""}</div>
      <div class="meal-cell-row"><span class="meal-cell-label">Day</span><input type="number" class="meal-num-input" id="md-${m.id}" min="0" max="4" step="0.5" value="${mealDayVals[m.id]??0}" ${dayAbsent?"style='border-color:var(--red-bg);background:var(--red-bg)'"  :""} oninput="updMealSum()"/></div>
      <div class="meal-cell-row"><span class="meal-cell-label">Night</span><input type="number" class="meal-num-input" id="mn-${m.id}" min="0" max="4" step="0.5" value="${mealNightVals[m.id]??0}" ${nightAbsent?"style='border-color:var(--red-bg);background:var(--red-bg)'" :""} oninput="updMealSum()"/></div>
    </div>`;
  }).join("");
  updMealSum();
}
function updMealSum() {
  let d=0,n=0,e=0;
  members.forEach(m=>{ const dv=parseFloat(document.getElementById("md-"+m.id)?.value||0), nv=parseFloat(document.getElementById("mn-"+m.id)?.value||0); mealDayVals[m.id]=dv; mealNightVals[m.id]=nv; d+=dv; n+=nv; if(dv>0||nv>0) e++; });
  const te=document.getElementById("mt-total"),td=document.getElementById("mt-day"),tn=document.getElementById("mt-night"),ce=document.getElementById("mt-eating");
  if(te) te.textContent=round2(d+n); if(td) td.textContent=round2(d); if(tn) tn.textContent=round2(n); if(ce) ce.textContent=e;
}
function setAllMeals(target,v) {
  members.forEach(m=>{ if(target==="day"||target==="both"){ const de=document.getElementById("md-"+m.id); if(de) de.value=v; mealDayVals[m.id]=v; } if(target==="night"||target==="both"){ const ne=document.getElementById("mn-"+m.id); if(ne) ne.value=v; mealNightVals[m.id]=v; } });
  updMealSum();
}
async function loadMealDate() {
  const date=document.getElementById("meal-date")?.value; if(!date) return;

  // Always clear absent flags first — prevents stale flags from previous date
  window._absentDay   = {};
  window._absentNight = {};

  // Always fetch attendance for this date to show absent badges
  try {
    const attRows = await dbGetAttendance(date);
    attRows.forEach(a => {
      const m = members.find(x => x.id === a.member_id);
      if (!m) return;
      if (!a.day_meal)   window._absentDay[m.id]   = true;
      if (!a.night_meal) window._absentNight[m.id] = true;
    });
  } catch(_) {}

  const {data:rec}=await getClient().from("meals").select("*").eq("mess_id",messId()).eq("date",date).maybeSingle();
  if(rec){
    // Load existing values — absence badges show but values are not overridden
    members.forEach(m=>{
      mealDayVals[m.id]   = Number(rec.meals[m.name+"_day"]  ?? rec.meals[m.name] ?? 0);
      mealNightVals[m.id] = Number(rec.meals[m.name+"_night"] ?? 0);
    });
    buildMealGrid();
    toast("Loaded entry for "+date);
  } else {
    // New date — pre-fill absent members with 0
    members.forEach(m=>{
      mealDayVals[m.id]   = window._absentDay[m.id]   ? 0 : (mealDayVals[m.id]   ?? 0);
      mealNightVals[m.id] = window._absentNight[m.id] ? 0 : (mealNightVals[m.id] ?? 0);
    });
    buildMealGrid();
  }
}
async function saveMeals() {
  if (!requireManager('saveMeals')) return;
  const date=document.getElementById("meal-date")?.value; if(!date){ toast("Select a date"); return; }
  const key = date.slice(0,7);
  if (await isMonthLocked(key)) { toast("🔒 " + monthLabelFromKey(key) + " is locked — unlock it first", "error"); return; }
  const meals={};
  members.forEach(m=>{ meals[m.name+"_day"]=mealDayVals[m.id]||0; meals[m.name+"_night"]=mealNightVals[m.id]||0; meals[m.name]=round2((mealDayVals[m.id]||0)+(mealNightVals[m.id]||0)); });
  try { await dbUpsertMeals(date,meals); await logAudit("update","meal",date,`Meals saved for ${date}`); toast("Meals saved","success"); loadMealsRecent(); loadManagerMealMonths(); } catch(e){ toast("Save failed: "+e.message,"error"); }
}
async function loadMealsRecent() {
  const wrap=document.getElementById("meals-tbl"); if(!wrap) return;
  const all=await dbGetAll("meals");
  const recent=all.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
  if(!recent.length){ wrap.innerHTML='<div class="empty">No meal entries yet</div>'; return; }
  wrap.innerHTML=`<table><thead><tr><th>Date</th>${members.map(m=>`<th>${escapeHtml(m.name)}</th>`).join("")}<th>Total</th><th></th></tr></thead>
  <tbody>${recent.map(r=>{ let t=0; const cells=members.map(m=>{ const v=mealMemberTotal(r.meals||{},m.name); t+=v; return`<td>${v||"—"}</td>`; }).join(""); return`<tr><td>${r.date}</td>${cells}<td><b>${round2(t)}</b></td><td><button class="btn btn-ghost btn-sm btn-icon" onclick="delMeal('${r.id}')">✕</button></td></tr>`; }).join("")}</tbody></table>`;
}
async function loadManagerMealMonths() {
  const wrap=document.getElementById("manager-meal-months"); if(!wrap) return;
  const all=await dbGetAll("meals");
  const keys=getMealMonthKeys(all);
  wrap.innerHTML=buildMealMonthButtons(keys,"openManagerMealMonth",all);
}
async function delMeal(id) { showConfirm({ title: "Delete meal entry?", body: "This day's meal record will be removed.", confirmLabel: "Delete", danger: true, onConfirm: async () => { try{ await dbDelete("meals",id); toast("Deleted"); loadMealsRecent(); loadManagerMealMonths(); }catch(e){ toast("Error","error"); } } }); }

/* ═══════════════════════════════════════════
   BAZAR ENTRY
═══════════════════════════════════════════ */
function renderBazar(el) {
  el.innerHTML=`<div class="topbar"><div><div class="page-title">Bazar Entry</div><div class="page-sub">Log grocery spending per member</div></div></div>
  <div class="content">
    <div class="card" style="margin-bottom:12px">
      <div class="date-row"><label>Date</label><input type="date" class="input" id="bazar-date" value="${today()}" style="width:170px" onchange="loadBazarDate()"/><button class="btn btn-ghost btn-sm" onclick="loadBazarDate()">Load</button></div>
      <div class="meal-grid" id="bazar-grid"></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary" onclick="saveBazar()">Save bazar</button>
        <button class="btn btn-ghost" onclick="clearBazar()">Clear</button>
        <span style="font-size:13px;color:var(--text2)">Total: <b id="bazar-tot">৳0</b></span>
      </div>
    </div>
    <div class="grid-2" style="align-items:start">
      <div class="card"><div class="card-title">Recent entries</div><div class="tbl-wrap" id="bazar-tbl"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
      <div class="card"><div class="card-title">Month history</div><div id="bazar-month-history"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
    </div>
  </div>`;
  buildBazarGrid(); loadBazarRecent(); loadBazarMonths();
}
function buildBazarGrid() {
  const g=document.getElementById("bazar-grid"); if(!g) return;
  g.innerHTML=members.map(m=>`<div class="meal-cell"><div class="meal-cell-name">${escapeHtml(m.name)}</div><div class="meal-cell-row"><span class="meal-cell-label">৳</span><input type="number" class="meal-num-input" id="bz-${m.id}" min="0" placeholder="0" oninput="updBazarSum()"/></div></div>`).join("");
}
function updBazarSum() { let b=0; members.forEach(m=>{ b+=parseFloat(document.getElementById("bz-"+m.id)?.value||0); }); const bt=document.getElementById("bazar-tot"); if(bt) bt.textContent=fmtTk(b); }
async function loadBazarDate() {
  const date=document.getElementById("bazar-date")?.value; if(!date) return;
  const {data:rec}=await getClient().from("bazar").select("*").eq("mess_id",messId()).eq("date",date).maybeSingle();
  if(rec){ members.forEach(m=>{ const e=document.getElementById("bz-"+m.id); if(e) e.value=rec.bazar[m.name]??0; }); updBazarSum(); toast("Loaded"); }
}
function clearBazar() { members.forEach(m=>{ const e=document.getElementById("bz-"+m.id); if(e) e.value=""; }); updBazarSum(); }
async function saveBazar() {
  if (!requireManager('saveBazar')) return;
  const date=document.getElementById("bazar-date")?.value; if(!date){ toast("Select a date"); return; }
  const key = date.slice(0,7);
  if (await isMonthLocked(key)) { toast("🔒 " + monthLabelFromKey(key) + " is locked — unlock it first", "error"); return; }
  const bazar={}; members.forEach(m=>{ bazar[m.name]=parseFloat(document.getElementById("bz-"+m.id)?.value||0); });
  try{ await dbUpsertBazar(date,bazar); await logAudit("update","bazar",date,`Bazar saved for ${date}`); toast("Bazar saved","success"); loadBazarRecent(); loadBazarMonths(); }catch(e){ toast("Error: "+e.message,"error"); }
}
async function loadBazarRecent() {
  const wrap=document.getElementById("bazar-tbl"); if(!wrap) return;
  const all=await dbGetAll("bazar"); const recent=all.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  if(!recent.length){ wrap.innerHTML='<div class="empty">No bazar entries</div>'; return; }
  wrap.innerHTML=`<table><thead><tr><th>Date</th>${members.map(m=>`<th>${escapeHtml(m.name)}</th>`).join("")}<th>Total</th><th></th></tr></thead><tbody>${recent.map(r=>{ const bt=Object.values(r.bazar||{}).reduce((s,v)=>s+Number(v),0); return`<tr><td>${r.date}</td>${members.map(m=>`<td>${r.bazar[m.name]!=null?fmtTk(r.bazar[m.name]):"—"}</td>`).join("")}<td><b>${fmtTk(bt)}</b></td><td><button class="btn btn-ghost btn-sm btn-icon" onclick="delBazar('${r.id}')">✕</button></td></tr>`; }).join("")}</tbody></table>`;
}

/* Bazar month-history grid: one card per month with totals, top contributor,
   active days, average per day. Click → opens detailed modal for that month. */
async function loadBazarMonths() {
  const wrap = document.getElementById("bazar-month-history");
  if (!wrap) return;
  const all = await dbGetAll("bazar");
  if (!all?.length) { wrap.innerHTML = '<div class="empty" style="padding:18px">No bazar months yet</div>'; return; }

  const byKey = {};
  all.forEach(r => {
    const k = String(r.date || "").slice(0, 7);
    if (!k) return;
    if (!byKey[k]) byKey[k] = { rows: [], total: 0, perMember: {} };
    let dayT = 0;
    Object.entries(r.bazar || {}).forEach(([name, v]) => {
      const n = Number(v || 0);
      byKey[k].perMember[name] = (byKey[k].perMember[name] || 0) + n;
      byKey[k].total += n;
      dayT += n;
    });
    if (dayT > 0) byKey[k].rows.push(r);
  });

  const keys = Object.keys(byKey).sort().reverse().slice(0, 12);
  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
      ${keys.map(k => {
        const info = byKey[k];
        const days = info.rows.length;
        const avg  = days > 0 ? round2(info.total / days) : 0;
        const top  = Object.entries(info.perMember).sort((a, b) => b[1] - a[1])[0];
        const isTop = top && top[1] > 0;

        return `
          <button onclick="openBazarMonth('${k}')" class="profile-card" style="
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
              <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">${days} day${days===1?"":"s"}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <div style="background:var(--bg3);border-radius:5px;padding:6px 8px">
                <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">🛒 Total</div>
                <div style="font-size:14px;font-weight:700;margin-top:1px;color:var(--green)">${fmtTk(info.total)}</div>
              </div>
              <div style="background:var(--bg3);border-radius:5px;padding:6px 8px">
                <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Avg/day</div>
                <div style="font-size:14px;font-weight:700;margin-top:1px">${fmtTk(avg)}</div>
              </div>
            </div>
            ${isTop ? `
              <div style="font-size:11px;color:var(--text2);line-height:1.3">
                🥇 Top spender:&nbsp;<b style="color:var(--accent)">${top[0]}</b>
                <span style="color:var(--text3)">· ${fmtTk(round2(top[1]))}</span>
              </div>
            ` : `<div style="font-size:11px;color:var(--text3)">No bazar data yet</div>`}
            <div style="font-size:10px;color:var(--text3);text-align:right;margin-top:2px">📅 View calendar →</div>
          </button>`;
      }).join("")}
    </div>`;
}

async function openBazarMonth(key) {
  const all  = await dbGetAll("bazar");
  const year  = parseInt(key.split("-")[0]);
  const monthIdx = parseInt(key.split("-")[1]) - 1;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

  const rows = all.filter(r => String(r.date || "").startsWith(key)).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // Build date-keyed map: { "15": { MemberA: 120, MemberB: 0, ... } }
  const byDay = {};
  for (let d = 1; d <= daysInMonth; d++) {
    byDay[String(d).padStart(2, "0")] = {};
  }
  rows.forEach(r => {
    const dayStr = String(r.date || "").slice(8, 10);
    if (!byDay[dayStr]) return;
    members.forEach(m => {
      byDay[dayStr][m.name] = Number((r.bazar || {})[m.name] || 0);
    });
  });

  // Member totals
  const totals = {}; members.forEach(m => { totals[m.name] = 0; });
  rows.forEach(r => Object.entries(r.bazar || {}).forEach(([n, v]) => { totals[n] = (totals[n] || 0) + Number(v || 0); }));
  const grand = round2(Object.values(totals).reduce((s, v) => s + v, 0));
  const maxMember = Math.max(1, ...Object.values(totals));

  // Day totals for colour intensity
  const dayTotals = {};
  Object.entries(byDay).forEach(([d, mmap]) => {
    dayTotals[d] = Object.values(mmap).reduce((s, v) => s + v, 0);
  });
  const maxDay = Math.max(1, ...Object.values(dayTotals));

  // Weekday of first day (Sun=0)
  const firstDow = new Date(year, monthIdx, 1).getDay();

  // Member colour palette (cycles)
  const MEMBER_COLOURS = ["#d4a853","#5b9bd5","#27ae60","#e67e22","#9b59b6","#e74c3c","#1abc9c","#e91e63"];
  const memberColour = {};
  members.forEach((m, i) => { memberColour[m.name] = MEMBER_COLOURS[i % MEMBER_COLOURS.length]; });

  // Build calendar cell HTML
  function buildCalCell(dayNum) {
    const d = String(dayNum).padStart(2, "0");
    const dayMap  = byDay[d] || {};
    const dayTotal = dayTotals[d] || 0;
    const hasBazar = dayTotal > 0;
    // Intensity drives how deep the green fill goes (0.18 min so low days still look distinct)
    const intensity = hasBazar ? Math.max(0.18, dayTotal / maxDay) : 0;
    // Solid green-tinted background; text must always be the app's normal text, NOT green
    const bg     = hasBazar ? `rgba(39,174,96,${intensity.toFixed(2)})` : "var(--bg3)";
    // High intensity (>0.55) → background is bright enough to need dark text; otherwise keep light text
    const numColor   = hasBazar
      ? (intensity > 0.55 ? "#0f1a14" : "var(--text)")
      : "var(--text3)";
    // Amount: white/near-white on green bg — never green-on-green
    const amtColor   = hasBazar
      ? (intensity > 0.55 ? "#0f1a14" : "#e0f7ef")
      : "var(--text3)";
    // Border: slightly brighter than the fill so the cell edge is always visible
    const borderCol  = hasBazar ? "rgba(39,174,96,0.55)" : "var(--border)";

    // Stacked pips per member
    const pips = hasBazar ? members
      .filter(m => (dayMap[m.name] || 0) > 0)
      .map(m => `<div title="${m.name}: ${fmtTk(dayMap[m.name])}" style="
        height:4px;border-radius:2px;
        background:${memberColour[m.name]};
        flex:${dayMap[m.name]};
        min-width:4px;
        opacity:0.9;
      "></div>`).join("") : "";

    return `
      <div class="bz-cal-cell" onclick="openBazarDayDetail('${key}','${d}')"
        title="${hasBazar ? 'Day total: '+fmtTk(dayTotal) : 'No bazar'}"
        style="
          background:${bg};
          border-radius:8px;
          padding:6px 5px 5px;
          cursor:${hasBazar?'pointer':'default'};
          min-height:58px;
          display:flex;flex-direction:column;gap:3px;
          border:1px solid ${borderCol};
          transition:transform .1s,box-shadow .1s;
          position:relative;
        "
        onmouseover="${hasBazar?`this.style.transform='scale(1.04)';this.style.boxShadow='0 4px 14px rgba(0,0,0,.25)'`:''}"
        onmouseout="${hasBazar?`this.style.transform='scale(1)';this.style.boxShadow='none'`:''}">
        <div style="font-size:11px;font-weight:700;color:${numColor};line-height:1">${dayNum}</div>
        ${hasBazar
          ? `<div style="font-size:10px;font-weight:700;color:${amtColor};margin-top:1px;line-height:1">${fmtTk(dayTotal)}</div>
             <div style="display:flex;gap:2px;margin-top:auto;flex-wrap:wrap">${pips}</div>`
          : `<div style="font-size:9px;color:var(--text3);margin-top:auto">—</div>`}
      </div>`;
  }

  // Empty leading cells
  const leadingEmpties = Array.from({ length: firstDow }, () =>
    `<div style="min-height:58px"></div>`).join("");

  const calCells = Array.from({ length: daysInMonth }, (_, i) => buildCalCell(i + 1)).join("");

  // Store rows on window for day-detail modal
  window._bazarMonthRows = byDay;
  window._bazarMonthKey  = key;

  const modal = document.getElementById("modal-content");
  modal.innerHTML = `
    <div class="modal-title">🛒 ${monthLabelFromKey(key)} — Bazar Calendar</div>
    <div class="modal-sub" style="margin-bottom:14px">${rows.length} active day${rows.length===1?"":"s"} · grand total <b style="color:var(--green)">${fmtTk(grand)}</b> · click any highlighted day for details</div>

    <!-- Member contribution bars -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:16px">
      ${members.map(m => {
        const pct = Math.round(((totals[m.name]||0) / maxMember) * 100);
        return `
          <div style="background:var(--bg3);border-radius:8px;padding:9px 11px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <div style="font-size:11px;font-weight:600;color:var(--text2)">${escapeHtml(m.name)}</div>
              <div style="width:8px;height:8px;border-radius:50%;background:${memberColour[m.name]}"></div>
            </div>
            <div style="font-size:14px;font-weight:700;color:var(--green);margin-bottom:4px">${fmtTk(round2(totals[m.name]||0))}</div>
            <div style="height:4px;background:var(--bg2);border-radius:99px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${memberColour[m.name]};transition:width .5s"></div>
            </div>
          </div>`;
      }).join("")}
    </div>

    <!-- Calendar grid -->
    <div class="bz-cal-scroll">
      <div class="bz-cal-grid" style="
        display:grid;
        grid-template-columns:repeat(7,1fr);
        gap:5px;
        margin-bottom:10px;
      ">
        ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d =>
          `<div style="text-align:center;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;padding:4px 0">${d}</div>`
        ).join("")}
        ${leadingEmpties}
        ${calCells}
      </div>
    </div>

    <!-- Legend -->
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--text3);padding:8px 0 4px;border-top:1px solid var(--border)">
      <span>Colour intensity = spending amount.</span>
      <span>Coloured pips = member split.</span>
      ${members.map(m => `<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${memberColour[m.name]}"></span>${escapeHtml(m.name)}</span>`).join("")}
    </div>

    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`;
  document.querySelector(".modal").classList.add("modal-wide");
  openModal();
}

/* Day detail popup from calendar click */
async function openBazarDayDetail(monthKey, dayStr) {
  const dayMap = (window._bazarMonthRows || {})[dayStr] || {};
  const dayTotal = Object.values(dayMap).reduce((s, v) => s + v, 0);
  if (!dayTotal) return;

  const year = parseInt(monthKey.split("-")[0]);
  const monthIdx = parseInt(monthKey.split("-")[1]) - 1;
  const dateLabel = `${parseInt(dayStr)} ${MONTHS[monthIdx]} ${year}`;

  const MEMBER_COLOURS = ["#d4a853","#5b9bd5","#27ae60","#e67e22","#9b59b6","#e74c3c","#1abc9c","#e91e63"];
  const memberColour = {};
  members.forEach((m, i) => { memberColour[m.name] = MEMBER_COLOURS[i % MEMBER_COLOURS.length]; });

  const modal = document.getElementById("modal-content");
  modal.innerHTML = `
    <div class="modal-title">🛒 Bazar — ${escapeHtml(dateLabel)}</div>
    <div class="modal-sub" style="margin-bottom:14px">Day total: <b style="color:var(--green)">${fmtTk(round2(dayTotal))}</b></div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${members.map(m => {
        const v = Number(dayMap[m.name] || 0);
        const pct = dayTotal > 0 ? Math.round((v / dayTotal) * 100) : 0;
        return `
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:90px;font-size:12px;font-weight:600;color:var(--text2);flex-shrink:0">${escapeHtml(m.name)}</div>
            <div style="flex:1;height:8px;background:var(--bg3);border-radius:99px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${memberColour[m.name]};transition:width .4s"></div>
            </div>
            <div style="width:70px;text-align:right;font-size:13px;font-weight:700;color:${v>0?'var(--green)':'var(--text3)'}">${v>0?fmtTk(v):'—'}</div>
          </div>`;
      }).join("")}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="openBazarMonth('${monthKey}')">← Back to calendar</button>
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    </div>`;
  document.querySelector(".modal").classList.remove("modal-wide");
  openModal();
}
async function delBazar(id) { showConfirm({ title: "Delete bazar entry?", body: "This day's bazar record will be removed.", confirmLabel: "Delete", danger: true, onConfirm: async () => { try{ await dbDelete("bazar",id); toast("Deleted"); loadBazarRecent(); loadBazarMonths(); }catch(e){ toast("Error","error"); } } }); }
