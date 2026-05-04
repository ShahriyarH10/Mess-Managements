/* ═══════════════════════════════════════════════
   MANAGER — Utility: bills entry, payment tracking
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   ROOM RENT
═══════════════════════════════════════════ */
function renderRent(el) {
  const n=new Date();
  el.innerHTML=`<div class="topbar"><div><div class="page-title">Room Rent</div><div class="page-sub">Track monthly rent collection</div></div></div>
  <div class="content">
    <div class="month-sel"><label>Month</label><select class="input" id="rent-month" style="width:180px">${MONTHS.map((m,i)=>`<option value="${i}"${i===n.getMonth()?" selected":""}>${m}</option>`).join("")}</select><label>Year</label><select class="input" id="rent-year" style="width:90px">${Array.from({length:5},(_,i)=>2023+i).map(y=>`<option${y===n.getFullYear()?" selected":""}>${y}</option>`).join("")}</select><button class="btn btn-ghost" onclick="loadRentMonth()">Load</button></div>
    <div class="stat-grid" id="rent-stats"></div>
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">Rent entries</div>
      <div class="tbl-wrap"><table><thead><tr><th>Member</th><th>Rent due (৳)</th><th>Paid (৳)</th><th>Status</th><th>Notes</th></tr></thead><tbody id="rent-tbody"></tbody></table></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button class="btn btn-primary" onclick="saveRent()">Save rent</button>
        <button class="btn btn-ghost" onclick="markAllRentPaid()">Mark all paid</button>
      </div>
    </div>
    <div class="card"><div class="card-title">History</div><div class="tbl-wrap" id="rent-history"></div></div>
  </div>`;
  loadRentMonth(); loadRentHistory();
}

async function loadRentMonth() {
  members = await dbGetMembers();
  const month=parseInt(document.getElementById("rent-month")?.value||0);
  const year=parseInt(document.getElementById("rent-year")?.value||new Date().getFullYear());
  const key=monthKey(year,month);
  const {data:rec}=await sb.from("rent").select("*").eq("mess_id",messId()).eq("month_key",key).maybeSingle();
  const tbody=document.getElementById("rent-tbody"); if(!tbody) return;
  tbody.innerHTML=members.map(m=>{
    const e=rec?.entries?.find(x=>x.name===m.name)||{};
    const due=Number(e.rent||0);
    const paid=Number(e.paid||0);
    const status=e.status||"unpaid";
    const notes=e.notes||"";
    return `<tr>
      <td><b>${m.name}</b></td>
      <td><input type="number" class="input input-sm" id="rd-${m.id}" value="${due}" style="width:95px" oninput="updRentDue('${m.id}')"/></td>
      <td><input type="number" class="input input-sm" id="rp-${m.id}" value="${paid}" data-due="${due}" style="width:95px" oninput="updRentSum()"/></td>
      <td><select class="input input-sm" id="rs-${m.id}" style="width:100px">
        <option value="paid"    ${status==="paid"   ?"selected":""}>Paid</option>
        <option value="unpaid"  ${status==="unpaid" ?"selected":""}>Not paid</option>
        <option value="partial" ${status==="partial"?"selected":""}>Partial</option>
      </select></td>
      <td><input type="text" class="input input-sm" id="rn-${m.id}" placeholder="—" value="${notes}" style="width:100px"/></td>
    </tr>`;
  }).join("");
  updRentSum();
}

function updRentDue(memberId) {
  const dueInput=document.getElementById("rd-"+memberId);
  const paidInput=document.getElementById("rp-"+memberId);
  if(!dueInput||!paidInput) return;
  paidInput.dataset.due=dueInput.value||0;
  updRentSum();
}

function updRentSum() {
  let due=0, paid=0;
  members.forEach(m=>{
    const di=document.getElementById("rd-"+m.id);
    const pi=document.getElementById("rp-"+m.id);
    if(!di||!pi) return;
    due+=parseFloat(di.value||0);
    paid+=parseFloat(pi.value||0);
  });
  const el=document.getElementById("rent-stats"); if(!el) return;
  el.innerHTML=`
    <div class="stat-card"><div class="stat-label">Total due</div><div class="stat-value" style="font-size:17px">${fmtTk(due)}</div></div>
    <div class="stat-card"><div class="stat-label">Collected</div><div class="stat-value" style="font-size:17px;color:var(--green)">${fmtTk(paid)}</div></div>
    <div class="stat-card"><div class="stat-label">Outstanding</div><div class="stat-value" style="font-size:17px;color:${due-paid>0?"var(--red)":"var(--green)"}">${fmtTk(round2(due-paid))}</div></div>
    <div class="stat-card"><div class="stat-label">Collection rate</div><div class="stat-value">${due>0?Math.round((paid/due)*100):0}%</div></div>`;
}

function markAllRentPaid() {
  members.forEach(m=>{
    const rd=document.getElementById("rd-"+m.id);
    const rp=document.getElementById("rp-"+m.id);
    const rs=document.getElementById("rs-"+m.id);
    if(rd&&rp&&rs){ const due=parseFloat(rd.value||0); rp.value=due; rp.dataset.due=due; rs.value="paid"; }
  });
  updRentSum();
}

async function saveRent() {
  const month=parseInt(document.getElementById("rent-month")?.value||0);
  const year=parseInt(document.getElementById("rent-year")?.value||new Date().getFullYear());
  const key=monthKey(year,month);
  const entries=members.map(m=>({
    name:   m.name,
    rent:   parseFloat(document.getElementById("rd-"+m.id)?.value||0),
    paid:   parseFloat(document.getElementById("rp-"+m.id)?.value||0),
    status: document.getElementById("rs-"+m.id)?.value||"unpaid",
    notes:  cleanText(document.getElementById("rn-"+m.id)?.value||""),
  }));
  try{ await dbUpsertRent(month,year,key,entries); toast("Rent saved","success"); loadRentHistory(); }catch(e){ toast("Error: "+e.message,"error"); }
}

async function loadRentHistory() {
  const wrap=document.getElementById("rent-history"); if(!wrap) return;
  const {data:all}=await sb.from("rent").select("*").eq("mess_id",messId()).order("month_key",{ascending:false});
  if(!all?.length){ wrap.innerHTML='<div class="empty">No rent records</div>'; return; }
  wrap.innerHTML=`<table><thead><tr><th>Month</th><th>Total due</th><th>Collected</th><th>Status</th></tr></thead><tbody>${all.map(r=>{ const due=r.entries.reduce((s,e)=>s+Number(e.rent||0),0),paid=r.entries.reduce((s,e)=>s+Number(e.paid||0),0),allPaid=r.entries.every(e=>e.status==="paid"),anyUnpaid=r.entries.some(e=>e.status==="unpaid"); const cls=allPaid?"badge-green":anyUnpaid?"badge-red":"badge-amber"; return`<tr><td><b>${r.month_name} ${r.year}</b></td><td>${fmtTk(due)}</td><td style="color:var(--green)">${fmtTk(paid)}</td><td><span class="badge ${cls}">${allPaid?"Complete":anyUnpaid?"Pending":"Partial"}</span></td></tr>`; }).join("")}</tbody></table>`;
}
