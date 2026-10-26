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
    <div><div class="page-title">Meal Entry</div><div class="page-sub">Log everyone's meals for a day, or check attendance</div></div>
    <div class="topbar-actions">
      <div class="an-seg">
        <button id="meal-tab-entry" class="an-seg-btn on" data-on-click="switchMealTab('entry')">📝 Entry</button>
        <button id="meal-tab-calendar" class="an-seg-btn" data-on-click="switchMealTab('calendar')">📅 Attendance</button>
      </div>
    </div>
  </div>
  <div class="content dk">
    <!-- Entry tab -->
    <div id="meal-pane-entry">
      <div class="card ent-card">
        <div class="ent-bar">
          <div class="ent-date">
            <input type="date" class="input" id="meal-date" value="${today()}" data-on-change="loadMealDate()"/>
            ${entDateChips("meal-date", "loadMealDate()")}
          </div>
          <div class="ent-pills">
            <span class="ent-pill">Total <b id="mt-total">0</b></span>
            <span class="ent-pill ent-d">☀ Day <b id="mt-day">0</b></span>
            <span class="ent-pill ent-n">🌙 Night <b id="mt-night">0</b></span>
            <span class="ent-pill">Eating <b id="mt-eating">0</b>/${members.length}</span>
          </div>
        </div>
        <div class="ent-tools">
          <span>Set everyone:</span>
          <button class="ml-chip" data-on-click="setAllMeals('day',1)">Day → 1</button>
          <button class="ml-chip" data-on-click="setAllMeals('night',1)">Night → 1</button>
          <button class="ml-chip" data-on-click="setAllMeals('both',1)">Both → 1</button>
          <button class="ml-chip" data-on-click="setAllMeals('both',0)">Clear</button>
        </div>
        <div class="ent-grid" id="meal-grid"></div>
        <div class="ent-foot">
          <span class="ml-hint" style="margin:0">Absent members are flagged from the attendance board.</span>
          <button class="btn btn-primary" data-on-click="saveMeals()">✓ Save meals</button>
        </div>
      </div>
      <div class="ent-split">
        <div class="card"><div class="dk-card-title"><span>Recent entries</span></div><div class="tbl-wrap" id="meals-tbl"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
        <div class="card"><div class="dk-card-title"><span>Month history</span></div><div id="manager-meal-months"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
      </div>
    </div>
    <!-- Calendar tab (lazy-loaded) -->
    <div id="meal-pane-calendar" style="display:none">
      <div id="absence-cal-outer"></div>
    </div>
  </div>`;
  window._absentDay = {}; window._absentNight = {};
  await loadMealDate(); refreshMealLists();
}

function switchMealTab(tab) {
  const isEntry = tab === 'entry';
  document.getElementById('meal-pane-entry').style.display    = isEntry ? '' : 'none';
  document.getElementById('meal-pane-calendar').style.display = isEntry ? 'none' : '';
  const btnEntry = document.getElementById('meal-tab-entry');
  const btnCal   = document.getElementById('meal-tab-calendar');
  btnEntry?.classList.toggle('on', isEntry);
  btnCal?.classList.toggle('on', !isEntry);
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
            <select class="input" id="cal-month" style="width:130px" data-on-change="loadAbsenceCalendar()">
              ${MONTHS.map((m, i) => `<option value="${i}" ${i===month?"selected":""}>${m}</option>`).join("")}
            </select>
            <select class="input" id="cal-year" style="width:88px" data-on-change="loadAbsenceCalendar()">
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
  const step = (id, val, absent, label) => `
    <div class="ent-row${absent ? " ent-absent" : ""}">
      <span class="ent-lbl">${label}</span>
      <button class="ms-btn ent-btn" data-on-click="stepEntry('${id}',-1)" aria-label="Less">−</button>
      <input type="number" class="meal-num-input" id="${id}" min="0" max="4" step="0.5" value="${val}" data-on-input="updMealSum()"/>
      <button class="ms-btn ent-btn" data-on-click="stepEntry('${id}',1)" aria-label="More">+</button>
    </div>`;
  g.innerHTML=members.map((m,i)=>{
    const dA = abDay[m.id], nA = abNight[m.id], col = avatarCol(i);
    return `
    <div class="ent-cell${dA && nA ? " ent-off" : ""}">
      <div class="ent-who"><span class="dk-av" style="background:${col.bg};color:${col.fg}">${avFace(m.id, m.name)}</span>
        <span class="ent-name">${escapeHtml(m.name)}</span>${dA || nA ? `<span class="badge badge-red">${dA && nA ? "absent" : dA ? "day off" : "night off"}</span>` : ""}</div>
      ${step("md-"+m.id, mealDayVals[m.id]??0, dA, "☀ Day")}
      ${step("mn-"+m.id, mealNightVals[m.id]??0, nA, "🌙 Night")}
    </div>`;
  }).join("");
  updMealSum();
}
/* −/+ on any entry stepper (0–4). */
function stepEntry(id, delta) {
  const el = document.getElementById(id); if (!el) return;
  el.value = Math.min(4, Math.max(0, (parseFloat(el.value) || 0) + delta));
  el.classList.remove("ms-bump"); void el.offsetWidth; el.classList.add("ms-bump");
  updMealSum();
}
/* Yesterday / Today chips for an entry page's date input. */
function entDateChips(inputId, after) {
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const t = new Date(), y = new Date(t.getTime() - 86400000);
  return `<button class="ml-chip" data-on-click="document.getElementById('${inputId}').value='${ymd(y)}';${after}">Yesterday</button>
    <button class="ml-chip" data-on-click="document.getElementById('${inputId}').value='${ymd(t)}';${after}">Today</button>`;
}
function entNiceDate(d) {
  const [y, m, dd] = String(d).split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
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
  // Members with nothing saved for this date start at 0 — unless they set a
  // day off, then the meal they didn't skip gets their default
  const mObj = rec?.meals || {};
  members.forEach(m=>{
    const dA = window._absentDay[m.id], nA = window._absentNight[m.id];
    if ([m.name+"_day", m.name+"_night", m.name].some(k => mObj[k] != null)) {
      // Load existing values — absence badges show but values are not overridden
      mealDayVals[m.id]   = Number(mObj[m.name+"_day"]  ?? mObj[m.name] ?? 0);
      mealNightVals[m.id] = Number(mObj[m.name+"_night"] ?? 0);
    } else if (dA || nA) {
      mealDayVals[m.id]   = dA ? 0 : (m.meal_default_day   ?? 1);
      mealNightVals[m.id] = nA ? 0 : (m.meal_default_night ?? 1);
    } else {
      mealDayVals[m.id] = 0; mealNightVals[m.id] = 0;
    }
  });
  buildMealGrid();
  if(rec) toast("Loaded entry for "+date);
}
async function saveMeals() {
  if (!requireManager('saveMeals')) return;
  const date=document.getElementById("meal-date")?.value; if(!date){ toast("Select a date"); return; }
  const key = date.slice(0,7);
  if (await isMonthLocked(key)) { toast("🔒 " + monthLabelFromKey(key) + " is locked — unlock it first", "error"); return; }
  const meals={};
  members.forEach(m=>{ meals[m.name+"_day"]=mealDayVals[m.id]||0; meals[m.name+"_night"]=mealNightVals[m.id]||0; meals[m.name]=round2((mealDayVals[m.id]||0)+(mealNightVals[m.id]||0)); });
  try { await dbUpsertMeals(date,meals); await logAudit("update","meal",date,`Meals saved for ${date}`); toast("Meals saved","success"); refreshMealLists(); } catch(e){ toast("Save failed: "+e.message,"error"); }
}
/* One fetch for both lists below (and the month pop-ups). */
async function refreshMealLists() {
  try { const all = await historyRows("meals", true); loadMealsRecent(all); loadManagerMealMonths(all); }
  catch (e) { toast("Could not load meals: " + e.message, "error"); }
}
function loadMealsRecent(all) {
  const wrap=document.getElementById("meals-tbl"); if(!wrap) return;
  const recent=[...all].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
  if(!recent.length){ wrap.innerHTML='<div class="empty">No meal entries yet</div>'; return; }
  wrap.innerHTML=`<table class="ent-tbl"><thead><tr><th>Date</th>${members.map(m=>`<th title="${escapeHtml(m.name)}" style="text-align:center">${memberInitials(m.id, m.name)}</th>`).join("")}<th style="text-align:right">Total</th><th></th></tr></thead>
  <tbody>${recent.map(r=>{ let t=0; const cells=members.map(m=>{ const v=mealMemberTotal(r.meals||{},m.name); t+=v; return`<td style="text-align:center" class="${v?"":"ent-zero"}">${v||"·"}</td>`; }).join(""); return`<tr><td class="ent-dt">${entNiceDate(r.date)}</td>${cells}<td style="text-align:right"><b>${round2(t)}</b></td><td style="text-align:right"><button class="btn btn-ghost btn-sm btn-icon" data-on-click="delMeal('${r.id}')" title="Delete this day">✕</button></td></tr>`; }).join("")}</tbody></table>`;
}
function loadManagerMealMonths(all) {
  const wrap=document.getElementById("manager-meal-months"); if(!wrap) return;
  wrap.innerHTML=buildMonthHistory(summarizeMonths(all, mealsByMember),
    { onClick: "openManagerMealMonth", id: "mh-meals", emptyText: "No meal months yet" });
}
async function delMeal(id) {
  if (!requireManager("delMeal")) return;
  const row = (await historyRows("meals")).find(r => r.id === id);
  if (row && !(await ensureMonthOpen(row.date))) return;
  showConfirm({ title: "Delete meal entry?", body: "This day's meal record will be removed.", confirmLabel: "Delete", danger: true, onConfirm: async () => { try{ await dbDelete("meals",id); toast("Deleted"); refreshMealLists(); }catch(e){ toast("Error","error"); } } }); }

/* ═══════════════════════════════════════════
   BAZAR ENTRY
═══════════════════════════════════════════ */
function renderBazar(el) {
  el.innerHTML=`<div class="topbar"><div><div class="page-title">Bazar Entry</div><div class="page-sub">Log what each member spent on bazar for a day</div></div></div>
  <div class="content dk">
    <div class="card ent-card">
      <div class="ent-bar">
        <div class="ent-date">
          <input type="date" class="input" id="bazar-date" value="${today()}" data-on-change="loadBazarDate()"/>
          ${entDateChips("bazar-date", "loadBazarDate()")}
        </div>
        <div class="ent-pills"><span class="ent-pill ent-g">Day total <b id="bazar-tot">৳0</b></span></div>
      </div>
      <div class="ent-grid ent-grid-bz" id="bazar-grid"></div>
      <div class="ent-foot">
        <button class="btn btn-ghost" data-on-click="clearBazar()">Clear</button>
        <button class="btn btn-primary" data-on-click="saveBazar()">✓ Save bazar</button>
      </div>
    </div>
    <div class="ent-split">
      <div class="card"><div class="dk-card-title"><span>Recent entries</span></div><div id="bazar-tbl"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
      <div class="card"><div class="dk-card-title"><span>Month history</span></div><div id="bazar-month-history"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
    </div>
  </div>`;
  buildBazarGrid(); refreshBazarLists();
}
function buildBazarGrid() {
  const g=document.getElementById("bazar-grid"); if(!g) return;
  g.innerHTML=members.map((m,i)=>{ const col=avatarCol(i); return `<div class="ent-cell">
    <div class="ent-who"><span class="dk-av" style="background:${col.bg};color:${col.fg}">${avFace(m.id, m.name)}</span><span class="ent-name">${escapeHtml(m.name)}</span></div>
    <div class="ml-amt ent-amt"><span>৳</span><input type="number" class="input" id="bz-${m.id}" min="0" placeholder="0" data-on-input="updBazarSum()"/></div>
  </div>`; }).join("");
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
  try{ await dbUpsertBazar(date,bazar); await logAudit("update","bazar",date,`Bazar saved for ${date}`); toast("Bazar saved","success"); refreshBazarLists(); }catch(e){ toast("Error: "+e.message,"error"); }
}
async function refreshBazarLists() {
  try { const all = await historyRows("bazar", true); loadBazarRecent(all); loadBazarMonths(all); }
  catch (e) { toast("Could not load bazar: " + e.message, "error"); }
}
function loadBazarRecent(all) {
  const wrap=document.getElementById("bazar-tbl"); if(!wrap) return;
  const recent=[...all].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  if(!recent.length){ wrap.innerHTML='<div class="empty">No bazar entries</div>'; return; }
  wrap.innerHTML=recent.map(r=>{
    const buyers=members.map((m,i)=>({ m, i, v:Number((r.bazar||{})[m.name]||0) })).filter(x=>x.v>0);
    const bt=Object.values(r.bazar||{}).reduce((s,v)=>s+Number(v||0),0);
    return `<div class="ent-bz-row">
      <span class="ent-dt">${entNiceDate(r.date)}</span>
      <span class="ent-buyers">${buyers.length ? buyers.map(x=>{ const col=avatarCol(x.i); return `<span class="ent-buyer"><span class="dk-av" style="background:${col.bg};color:${col.fg}">${avFace(x.m.id, x.m.name)}</span>${escapeHtml(x.m.name.split(" ")[0])} <b>${fmtTk(x.v)}</b></span>`; }).join("") : `<span class="ent-zero">nobody</span>`}</span>
      <b class="ent-bz-total">${fmtTk(round2(bt))}</b>
      <button class="btn btn-ghost btn-sm btn-icon" data-on-click="delBazar('${r.id}')" title="Delete this day">✕</button>
    </div>`;
  }).join("");
}

/* Bazar month-history grid (shared month cards, js/core/helpers.js). Click → calendar modal. */
function loadBazarMonths(all) {
  const wrap = document.getElementById("bazar-month-history");
  if (!wrap) return;
  wrap.innerHTML = buildMonthHistory(summarizeMonths(all, r => r.bazar),
    { onClick: "openBazarMonth", money: true, id: "mh-bazar", emptyText: "No bazar months yet" });
}

async function openBazarMonth(key) {
  const all  = await historyRows("bazar");
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
      <div class="bz-cal-cell" data-on-click="openBazarDayDetail('${key}','${d}')"
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
        data-on-mouseover="${hasBazar?`this.style.transform='scale(1.04)';this.style.boxShadow='0 4px 14px rgba(0,0,0,.25)'`:''}"
        data-on-mouseout="${hasBazar?`this.style.transform='scale(1)';this.style.boxShadow='none'`:''}">
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

    <div class="modal-footer"><button class="btn btn-ghost" data-on-click="closeModal()">Close</button></div>`;
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
      <button class="btn btn-ghost" data-on-click="openBazarMonth('${monthKey}')">← Back to calendar</button>
      <button class="btn btn-ghost" data-on-click="closeModal()">Close</button>
    </div>`;
  document.querySelector(".modal").classList.remove("modal-wide");
  openModal();
}
async function delBazar(id) {
  if (!requireManager("delBazar")) return;
  const row = (await historyRows("bazar")).find(r => r.id === id);
  if (row && !(await ensureMonthOpen(row.date))) return;
  showConfirm({ title: "Delete bazar entry?", body: "This day's bazar record will be removed.", confirmLabel: "Delete", danger: true, onConfirm: async () => { try{ await dbDelete("bazar",id); toast("Deleted"); refreshBazarLists(); }catch(e){ toast("Error","error"); } } }); }
