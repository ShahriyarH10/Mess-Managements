/* ═══════════════════════════════════════════════
   MANAGER — Meals: meal entry, save, load, approval
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   MEAL ENTRY
═══════════════════════════════════════════ */
const mealDayVals={}, mealNightVals={};
function renderMeals(el) {
  el.innerHTML=`
  <div class="topbar"><div><div class="page-title">Meal Entry</div><div class="page-sub">Log day & night meals per member</div></div></div>
  <div class="content">
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
    <div class="card"><div class="card-title">Recent entries</div><div class="tbl-wrap" id="meals-tbl"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
  </div>`;
  members.forEach(m=>{ mealDayVals[m.id]=0; mealNightVals[m.id]=0; });
  buildMealGrid(); loadMealDate(); loadMealsRecent();
}
function buildMealGrid() {
  const g=document.getElementById("meal-grid"); if(!g) return;
  g.innerHTML=members.map(m=>`
    <div class="meal-cell">
      <div class="meal-cell-name">${m.name}</div>
      <div class="meal-cell-row"><span class="meal-cell-label">Day</span><input type="number" class="meal-num-input" id="md-${m.id}" min="0" max="4" step="0.5" value="${mealDayVals[m.id]??0}" oninput="updMealSum()"/></div>
      <div class="meal-cell-row"><span class="meal-cell-label">Night</span><input type="number" class="meal-num-input" id="mn-${m.id}" min="0" max="4" step="0.5" value="${mealNightVals[m.id]??0}" oninput="updMealSum()"/></div>
    </div>`).join("");
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
  const {data:rec}=await sb.from("meals").select("*").eq("mess_id",messId()).eq("date",date).maybeSingle();
  if(rec){ members.forEach(m=>{ mealDayVals[m.id]=Number(rec.meals[m.name+"_day"]??rec.meals[m.name]??0); mealNightVals[m.id]=Number(rec.meals[m.name+"_night"]??0); }); buildMealGrid(); toast("Loaded entry for "+date); }
  else { members.forEach(m=>{ mealDayVals[m.id]=0; mealNightVals[m.id]=0; }); buildMealGrid(); }
}
async function saveMeals() {
  const date=document.getElementById("meal-date")?.value; if(!date){ toast("Select a date"); return; }
  const meals={};
  members.forEach(m=>{ meals[m.name+"_day"]=mealDayVals[m.id]||0; meals[m.name+"_night"]=mealNightVals[m.id]||0; meals[m.name]=round2((mealDayVals[m.id]||0)+(mealNightVals[m.id]||0)); });
  try { await dbUpsertMeals(date,meals); toast("Meals saved","success"); loadMealsRecent(); } catch(e){ toast("Save failed: "+e.message,"error"); }
}
async function loadMealsRecent() {
  const wrap=document.getElementById("meals-tbl"); if(!wrap) return;
  const all=await dbGetAll("meals");
  const recent=all.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
  if(!recent.length){ wrap.innerHTML='<div class="empty">No meal entries yet</div>'; return; }
  wrap.innerHTML=`<table><thead><tr><th>Date</th>${members.map(m=>`<th>${m.name}</th>`).join("")}<th>Total</th><th></th></tr></thead>
  <tbody>${recent.map(r=>{ let t=0; const cells=members.map(m=>{ const d=Number(r.meals[m.name+"_day"]??0),n=Number(r.meals[m.name+"_night"]??0),v=round2(d+n)||Number(r.meals[m.name]??0); t+=v; return`<td>${v}</td>`; }).join(""); return`<tr><td>${r.date}</td>${cells}<td><b>${round2(t)}</b></td><td><button class="btn btn-ghost btn-sm btn-icon" onclick="delMeal('${r.id}')">✕</button></td></tr>`; }).join("")}</tbody></table>`;
}
async function delMeal(id) { if(!confirm("Delete?")) return; try{ await dbDelete("meals",id); toast("Deleted"); loadMealsRecent(); }catch(e){ toast("Error","error"); } }

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
    <div class="card"><div class="card-title">Recent entries</div><div class="tbl-wrap" id="bazar-tbl"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
  </div>`;
  buildBazarGrid(); loadBazarRecent();
}
function buildBazarGrid() {
  const g=document.getElementById("bazar-grid"); if(!g) return;
  g.innerHTML=members.map(m=>`<div class="meal-cell"><div class="meal-cell-name">${m.name}</div><div class="meal-cell-row"><span class="meal-cell-label">৳</span><input type="number" class="meal-num-input" id="bz-${m.id}" min="0" placeholder="0" oninput="updBazarSum()"/></div></div>`).join("");
}
function updBazarSum() { let b=0; members.forEach(m=>{ b+=parseFloat(document.getElementById("bz-"+m.id)?.value||0); }); const bt=document.getElementById("bazar-tot"); if(bt) bt.textContent=fmtTk(b); }
async function loadBazarDate() {
  const date=document.getElementById("bazar-date")?.value; if(!date) return;
  const {data:rec}=await sb.from("bazar").select("*").eq("mess_id",messId()).eq("date",date).maybeSingle();
  if(rec){ members.forEach(m=>{ const e=document.getElementById("bz-"+m.id); if(e) e.value=rec.bazar[m.name]??0; }); updBazarSum(); toast("Loaded"); }
}
function clearBazar() { members.forEach(m=>{ const e=document.getElementById("bz-"+m.id); if(e) e.value=""; }); updBazarSum(); }
async function saveBazar() {
  const date=document.getElementById("bazar-date")?.value; if(!date){ toast("Select a date"); return; }
  const bazar={}; members.forEach(m=>{ bazar[m.name]=parseFloat(document.getElementById("bz-"+m.id)?.value||0); });
  try{ await dbUpsertBazar(date,bazar); toast("Bazar saved","success"); loadBazarRecent(); }catch(e){ toast("Error: "+e.message,"error"); }
}
async function loadBazarRecent() {
  const wrap=document.getElementById("bazar-tbl"); if(!wrap) return;
  const all=await dbGetAll("bazar"); const recent=all.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  if(!recent.length){ wrap.innerHTML='<div class="empty">No bazar entries</div>'; return; }
  wrap.innerHTML=`<table><thead><tr><th>Date</th>${members.map(m=>`<th>${m.name}</th>`).join("")}<th>Total</th><th></th></tr></thead><tbody>${recent.map(r=>{ const bt=Object.values(r.bazar||{}).reduce((s,v)=>s+Number(v),0); return`<tr><td>${r.date}</td>${members.map(m=>`<td>${r.bazar[m.name]!=null?fmtTk(r.bazar[m.name]):"—"}</td>`).join("")}<td><b>${fmtTk(bt)}</b></td><td><button class="btn btn-ghost btn-sm btn-icon" onclick="delBazar('${r.id}')">✕</button></td></tr>`; }).join("")}</tbody></table>`;
}
async function delBazar(id) { if(!confirm("Delete?")) return; try{ await dbDelete("bazar",id); toast("Deleted"); loadBazarRecent(); }catch(e){ toast("Error","error"); } }
