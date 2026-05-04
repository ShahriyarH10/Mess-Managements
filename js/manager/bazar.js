/* ═══════════════════════════════════════════════
   MANAGER — Bazar: grocery entry, save, load
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   UTILITY ENTRY
═══════════════════════════════════════════ */
async function renderUtility(el) {
  const n=new Date();
  el.innerHTML=`<div class="topbar"><div><div class="page-title">Utility Entry</div><div class="page-sub">Track bills & payments</div></div></div>
  <div class="content">
    <div class="month-sel"><label>Month</label><select class="input" id="ut-month" style="width:180px">${MONTHS.map((m,i)=>`<option value="${i}"${i===n.getMonth()?" selected":""}>${m}</option>`).join("")}</select><label>Year</label><select class="input" id="ut-year" style="width:90px">${Array.from({length:5},(_,i)=>2023+i).map(y=>`<option${y===n.getFullYear()?" selected":""}>${y}</option>`).join("")}</select><button class="btn btn-ghost" onclick="loadUtilMonth()">Load</button></div>
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">Prepaid bills</div>
      <div class="util-fields">
        ${["elec","wifi","gas"].map(k=>`<div class="field" style="margin:0"><label>${{elec:"Electricity",wifi:"WiFi",gas:"Gas"}[k]} (৳)</label><input type="number" class="input" id="ut-${k}" min="0" placeholder="0" oninput="updUtilSum()"/></div>`).join("")}
      </div>
      <div class="card-title" style="margin-top:14px">Postpaid (Khala & Other)</div>
      <div class="util-fields">
        <div class="field" style="margin:0"><label>Khala salary (৳)</label><input type="number" class="input" id="ut-khala" min="0" placeholder="0" oninput="updUtilSum()"/></div>
        <div class="field" style="margin:0"><label>Other (৳)</label><input type="number" class="input" id="ut-other" min="0" placeholder="0" oninput="updUtilSum()"/></div>
      </div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">Member payments</div>
      <div class="tbl-wrap"><table><thead><tr><th>Member</th><th>Share</th><th>Paid (৳)</th><th>Status</th><th>Notes</th></tr></thead><tbody id="ut-tbody"></tbody></table></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-primary" onclick="saveUtility()">Save</button>
        <button class="btn btn-ghost" onclick="markAllUtilPaid()">Mark all paid</button>
        <button class="btn btn-ghost" onclick="clearUtil()">Clear bills</button>
      </div>
    </div>
    <div class="card"><div class="card-title">History</div><div class="tbl-wrap" id="ut-history"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
  </div>`;
  loadUtilMonth(); loadUtilHistory();
}
function getUtilTotal() { return ["elec","wifi","gas","khala","other"].reduce((s,k)=>s+parseFloat(document.getElementById("ut-"+k)?.value||0),0); }
function updUtilSum() {
  const total=getUtilTotal(), perHead=members.length>0?round2(total/members.length):0;
  buildUtilRows(perHead); updUtilCollected();
}
function buildUtilRows(perHead) {
  const tbody=document.getElementById("ut-tbody"); if(!tbody||tbody.hasChildNodes()) return;
  tbody.innerHTML=members.map(m=>`<tr><td><b>${m.name}</b></td><td id="us-${m.id}">${fmtTk(perHead)}</td><td><input type="number" class="input input-sm" id="up-${m.id}" value="0" style="width:90px" oninput="updUtilCollected()"/></td><td><select class="input input-sm" id="ust-${m.id}" style="width:100px"><option value="unpaid">Not paid</option><option value="paid">Paid</option><option value="partial">Partial</option></select></td><td><input type="text" class="input input-sm" id="un-${m.id}" placeholder="—" style="width:100px"/></td></tr>`).join("");
}
function updUtilCollected() {
  let collected=0; members.forEach(m=>{ collected+=parseFloat(document.getElementById("up-"+m.id)?.value||0); });
  const total=getUtilTotal(), perHead=members.length>0?round2(total/members.length):0;
  const tbody=document.getElementById("ut-tbody");
  if(tbody) members.forEach(m=>{ const sc=document.getElementById("us-"+m.id); if(sc) sc.textContent=fmtTk(perHead); });
}
function markAllUtilPaid() {
  const perHead=members.length>0?round2(getUtilTotal()/members.length):0;
  members.forEach(m=>{ const pp=document.getElementById("up-"+m.id),ps=document.getElementById("ust-"+m.id); if(pp) pp.value=perHead; if(ps) ps.value="paid"; });
  updUtilCollected();
}
function clearUtil() { ["elec","wifi","gas","khala","other"].forEach(k=>{ const e=document.getElementById("ut-"+k); if(e) e.value=""; }); updUtilSum(); }
async function loadUtilMonth() {
  const month=parseInt(document.getElementById("ut-month")?.value||0), year=parseInt(document.getElementById("ut-year")?.value||new Date().getFullYear()), key=monthKey(year,month);
  const {data:rec}=await sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",key).maybeSingle();
  if(rec){
    const u=rec.bills||{};
    ["elec","wifi","gas","khala","other"].forEach(k=>{ const e=document.getElementById("ut-"+k); if(e) e.value=u[k]||0; });
    const total=["elec","wifi","gas","khala","other"].reduce((s,k)=>s+(u[k]||0),0), perHead=members.length>0?round2(total/members.length):0;
    const tbody=document.getElementById("ut-tbody");
    if(tbody&&!tbody.hasChildNodes()) buildUtilRows(perHead);
    const payments=rec.payments||{};
    members.forEach(m=>{ const p=payments[m.name]||{}; const pp=document.getElementById("up-"+m.id),ps=document.getElementById("ust-"+m.id),pn=document.getElementById("un-"+m.id),sc=document.getElementById("us-"+m.id); if(pp) pp.value=p.paid??0; if(ps) ps.value=p.status||"unpaid"; if(pn) pn.value=p.notes||""; if(sc) sc.textContent=fmtTk(perHead); });
    updUtilCollected();
  } else updUtilSum();
}
async function saveUtility() {
  const month=parseInt(document.getElementById("ut-month")?.value||0), year=parseInt(document.getElementById("ut-year")?.value||new Date().getFullYear()), key=monthKey(year,month);
  const bills={ elec:parseFloat(document.getElementById("ut-elec")?.value||0), wifi:parseFloat(document.getElementById("ut-wifi")?.value||0), gas:parseFloat(document.getElementById("ut-gas")?.value||0), khala:parseFloat(document.getElementById("ut-khala")?.value||0), other:parseFloat(document.getElementById("ut-other")?.value||0) };
  const payments={};
  members.forEach(m=>{ payments[m.name]={ paid:parseFloat(document.getElementById("up-"+m.id)?.value||0), status:document.getElementById("ust-"+m.id)?.value||"unpaid", notes:document.getElementById("un-"+m.id)?.value||"" }; });
  try{ await dbUpsertUtility(month,year,key,bills,payments); toast("Saved","success"); loadUtilHistory(); }catch(e){ toast("Error: "+e.message,"error"); }
}
async function loadUtilHistory() {
  const wrap=document.getElementById("ut-history"); if(!wrap) return;
  const {data:all}=await sb.from("utility_payments").select("*").eq("mess_id",messId()).order("month_key",{ascending:false});
  if(!all?.length){ wrap.innerHTML='<div class="empty">No utility records</div>'; return; }
  wrap.innerHTML=`<table><thead><tr><th>Month</th><th>Total</th><th>Per member</th>${members.map(m=>`<th>${m.name}</th>`).join("")}<th>Collected</th></tr></thead><tbody>${all.slice(0,12).map(r=>{ const bills=r.bills||{},total=["elec","wifi","gas","khala","other"].reduce((s,k)=>s+(bills[k]||0),0),perHead=members.length>0?round2(total/members.length):0,payments=r.payments||{}; let collected=0; const mc=members.map(m=>{ const p=payments[m.name]||{}; collected+=Number(p.paid||0); const cls=p.status==="paid"?"badge-green":p.status==="partial"?"badge-amber":"badge-red"; return`<td><span class="badge ${cls}">${p.status==="paid"?"Paid":p.status==="partial"?"Part":"Due"}</span></td>`; }).join(""); return`<tr><td><b>${r.month_name} ${r.year}</b></td><td>${fmtTk(total)}</td><td>${fmtTk(perHead)}</td>${mc}<td style="color:var(--green)"><b>${fmtTk(round2(collected))}</b></td></tr>`; }).join("")}</tbody></table>`;
}
