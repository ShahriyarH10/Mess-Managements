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
    <div class="grid-2" style="align-items:start">
      <div class="card"><div class="card-title">Recent entries</div><div class="tbl-wrap" id="meals-tbl"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
      <div class="card"><div class="card-title">Month history</div><div id="manager-meal-months"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
    </div>
  </div>`;
  members.forEach(m=>{ mealDayVals[m.id]=0; mealNightVals[m.id]=0; });
  buildMealGrid(); loadMealDate(); loadMealsRecent(); loadManagerMealMonths();
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
  const {data:rec}=await getClient().from("meals").select("*").eq("mess_id",messId()).eq("date",date).maybeSingle();
  if(rec){ members.forEach(m=>{ mealDayVals[m.id]=Number(rec.meals[m.name+"_day"]??rec.meals[m.name]??0); mealNightVals[m.id]=Number(rec.meals[m.name+"_night"]??0); }); buildMealGrid(); toast("Loaded entry for "+date); }
  else { members.forEach(m=>{ mealDayVals[m.id]=0; mealNightVals[m.id]=0; }); buildMealGrid(); }
}
async function saveMeals() {
  if (!requireManager('saveMeals')) return;
  const date=document.getElementById("meal-date")?.value; if(!date){ toast("Select a date"); return; }
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
          </button>`;
      }).join("")}
    </div>`;
}

async function openBazarMonth(key) {
  const all = await dbGetAll("bazar");
  const rows = all.filter(r => String(r.date || "").startsWith(key)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const totals = {}; members.forEach(m => totals[m.name] = 0);
  rows.forEach(r => Object.entries(r.bazar || {}).forEach(([n, v]) => { totals[n] = (totals[n] || 0) + Number(v || 0); }));
  const grand = Object.values(totals).reduce((s, v) => s + v, 0);
  const max = Math.max(1, ...Object.values(totals));

  const modal = document.getElementById("modal-content");
  modal.innerHTML = `
    <div class="modal-title">${monthLabelFromKey(key)} — Bazar history</div>
    <div class="modal-sub" style="margin-bottom:14px">${rows.length} active day${rows.length===1?"":"s"} · grand total ${fmtTk(grand)}</div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:14px">
      ${members.map(m => `
        <div class="stat-card" style="padding:10px">
          <div style="font-size:11px;color:var(--text3)">${m.name}</div>
          <div style="font-size:15px;font-weight:700;color:var(--green);margin:2px 0 4px">${fmtTk(round2(totals[m.name] || 0))}</div>
          <div style="height:5px;background:var(--bg3);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${Math.round(((totals[m.name]||0)/max)*100)}%;background:var(--green);transition:width .4s"></div>
          </div>
        </div>`).join("")}
    </div>

    <div class="tbl-wrap"><table>
      <thead><tr><th>Date</th>${members.map(m => `<th>${m.name}</th>`).join("")}<th>Total</th></tr></thead>
      <tbody>${rows.length
        ? rows.map(r => {
            const t = members.reduce((s, m) => s + Number((r.bazar || {})[m.name] || 0), 0);
            return `<tr><td><b>${r.date}</b></td>${members.map(m => {
              const v = Number((r.bazar || {})[m.name] || 0);
              return `<td class="${v>0?'net-pos':''}">${v>0?fmtTk(v):'—'}</td>`;
            }).join("")}<td><b>${fmtTk(round2(t))}</b></td></tr>`;
          }).join("")
        : `<tr><td colspan="${members.length + 2}" class="empty">No bazar entries</td></tr>`}
      </tbody>
    </table></div>

    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`;
  document.querySelector(".modal").classList.add("modal-wide");
  openModal();
}
async function delBazar(id) { showConfirm({ title: "Delete bazar entry?", body: "This day's bazar record will be removed.", confirmLabel: "Delete", danger: true, onConfirm: async () => { try{ await dbDelete("bazar",id); toast("Deleted"); loadBazarRecent(); loadBazarMonths(); }catch(e){ toast("Error","error"); } } }); }
