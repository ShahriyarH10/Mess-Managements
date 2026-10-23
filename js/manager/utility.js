/* ═══════════════════════════════════════════════
   MANAGER — Utility: bills entry, payment tracking
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   ROOM RENT
═══════════════════════════════════════════ */
function renderRent(el) {
  const n = new Date();
  const curY = n.getFullYear();
  const yearOpts = Array.from({length:8},(_,i)=>curY-3+i)
    .map(y=>`<option${y===curY?" selected":""}>${y}</option>`).join("");
  el.innerHTML=`<div class="topbar">
    <div><div class="page-title">Room Rent</div><div class="page-sub">Set each member's rent and record what they've paid</div></div>
    <div class="topbar-actions"><div class="ut-pick">
      <select class="input" id="rent-month" data-on-change="loadRentMonth()">${MONTHS.map((m,i)=>`<option value="${i}"${i===n.getMonth()?" selected":""}>${m}</option>`).join("")}</select>
      <select class="input" id="rent-year" data-on-change="loadRentMonth()">${yearOpts}</select>
    </div></div>
  </div>
  <div class="content dk">
    <div class="card">
      <div id="rent-stats" class="ut-summary"></div>
      <div class="ut-rows" id="rent-rows"><div class="loading"><div class="spinner"></div>Loading…</div></div>
      <div class="ent-foot" style="padding:14px 0 0;border-top:0">
        <button class="btn btn-ghost" data-on-click="markAllRentPaid()">✓ Mark all paid</button>
        <button class="btn btn-primary" data-on-click="saveRent()">💾 Save rent</button>
      </div>
    </div>
    <div class="card"><div class="dk-card-title"><span>📋 Rent history</span></div><div id="rent-history"></div></div>
  </div>`;
  loadRentMonth(); loadRentHistory();
}

async function loadRentMonth() {
  members = await dbGetMembers(); buildInitialsMap(members);
  const month=parseInt(document.getElementById("rent-month")?.value||0);
  const year=parseInt(document.getElementById("rent-year")?.value||new Date().getFullYear());
  const key=monthKey(year,month);
  const {data:rec}=await getClient().from("rent").select("*").eq("mess_id",messId()).eq("month_key",key).maybeSingle();
  const wrap=document.getElementById("rent-rows"); if(!wrap) return;
  wrap.innerHTML=`<div class="ut-row rent-row ut-row-head"><span>Member</span><span>Rent</span><span>Paid</span><span>Status</span><span>Note</span></div>`+members.map((m,i)=>{
    const e=rec?.entries?.find(x=>x.name===m.name)||{};
    const due=Number(e.rent||m.rent||0);
    const paid=Number(e.paid||0);
    const status=e.status||"unpaid";
    const notes=e.notes||"";
    const col=avatarCol(i);
    return `<div class="ut-row rent-row" id="rr-${m.id}" data-status="${status}">
      <div class="dk-who"><span class="dk-av" style="background:${col.bg};color:${col.fg}">${avFace(m.id, m.name)}</span>${escapeHtml(m.name)}${m.room ? `<span class="dk-mini" style="margin-left:4px">· ${escapeHtml(m.room)}</span>` : ""}</div>
      <div class="ml-amt ut-paid rent-due" data-cap="rent"><span>৳</span><input type="number" class="input input-sm" id="rd-${m.id}" value="${due}" data-on-input="updRentDue('${m.id}')" title="Rent for this month"/></div>
      <div class="ml-amt ut-paid" data-cap="paid"><span>৳</span><input type="number" class="input input-sm" id="rp-${m.id}" value="${paid}" data-due="${due}" data-on-input="updRentAutoStatus('${m.id}')" title="Amount paid"/></div>
      <select class="input input-sm ut-status" id="rs-${m.id}" data-on-change="rentStatusChanged('${m.id}')">
        <option value="paid"    ${status==="paid"   ?"selected":""}>✅ Paid</option>
        <option value="partial" ${status==="partial"?"selected":""}>⚠️ Partial</option>
        <option value="unpaid"  ${status==="unpaid" ?"selected":""}>⏳ Not paid</option>
      </select>
      <input type="text" class="input input-sm ut-note" id="rn-${m.id}" placeholder="Note" value="${escapeHtml(notes)}"/>
    </div>`;
  }).join("");
  updRentSum();
}

function updRentDue(memberId) {
  const dueInput=document.getElementById("rd-"+memberId);
  const paidInput=document.getElementById("rp-"+memberId);
  if(!dueInput||!paidInput) return;
  paidInput.dataset.due=dueInput.value||0;
  updRentAutoStatus(memberId);
}

/* Auto-update status when paid amount changes */
function updRentAutoStatus(memberId) {
  const dueInput  = document.getElementById("rd-"+memberId);
  const paidInput = document.getElementById("rp-"+memberId);
  const statSel   = document.getElementById("rs-"+memberId);
  if (!dueInput || !paidInput || !statSel) { updRentSum(); return; }
  const due  = parseFloat(dueInput.value  || 0);
  const paid = parseFloat(paidInput.value || 0);
  if (paid <= 0)        statSel.value = "unpaid";
  else if (paid >= due) statSel.value = "paid";
  else                  statSel.value = "partial";
  rentStatusChanged(memberId);
  updRentSum();
}

/* Tint the member row by its status (CSS: .ut-row[data-status]). */
function rentStatusChanged(memberId) {
  const row = document.getElementById("rr-" + memberId), sel = document.getElementById("rs-" + memberId);
  if (row && sel) row.dataset.status = sel.value;
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
  const out=round2(due-paid), rate=due>0?Math.min(100,Math.round((paid/due)*100)):0;
  const month=parseInt(document.getElementById("rent-month")?.value||0);
  el.innerHTML=`
    <div class="dk-card-title" style="margin-bottom:10px"><span>🏠 ${MONTHS[month]} rent</span><span class="dk-legend"><b style="color:var(--text)">${rate}%</b>&nbsp;collected</span></div>
    <div class="ent-pills">
      <span class="ent-pill">Total due <b>${fmtTk(due)}</b></span>
      <span class="ent-pill ent-g">Collected <b>${fmtTk(paid)}</b></span>
      <span class="ent-pill">Outstanding <b style="color:${out>0?"var(--red)":"var(--green)"}">${out>0?fmtTk(out):"✓ None"}</b></span>
    </div>
    <div class="dk-bar ut-progress"><i style="width:${rate}%;background:${rate>=100?"var(--green)":"var(--accent)"}"></i></div>`;
}

function markAllRentPaid() {
  members.forEach(m=>{
    const rd=document.getElementById("rd-"+m.id);
    const rp=document.getElementById("rp-"+m.id);
    const rs=document.getElementById("rs-"+m.id);
    if(rd&&rp&&rs){ const due=parseFloat(rd.value||0); rp.value=due; rp.dataset.due=due; rs.value="paid"; rentStatusChanged(m.id); }
  });
  updRentSum();
}

async function saveRent() {
  if (!requireManager('saveRent')) return;
  const month=parseInt(document.getElementById("rent-month")?.value||0);
  const year=parseInt(document.getElementById("rent-year")?.value||new Date().getFullYear());
  const key=monthKey(year,month);
  if (await isMonthLocked(key)) { toast("🔒 " + monthLabelFromKey(key) + " is locked — unlock it first", "error"); return; }
  const entries=members.map(m=>({
    name:   m.name,
    rent:   parseFloat(document.getElementById("rd-"+m.id)?.value||0),
    paid:   parseFloat(document.getElementById("rp-"+m.id)?.value||0),
    status: document.getElementById("rs-"+m.id)?.value||"unpaid",
    notes:  cleanText(document.getElementById("rn-"+m.id)?.value||""),
  }));
  try{
    // what was paid before this save, so each increase becomes a receipt
    const { data: before } = await getClient().from("rent").select("entries").eq("mess_id", messId()).eq("month_key", key).maybeSingle();
    const prevPaid = name => Number((before?.entries || []).find(e => e.name === name)?.paid || 0);
    await dbUpsertRent(month,year,key,entries);
    toast("Rent saved","success");
    for (const m of members) {
      const added = round2(Number(entries.find(e => e.name === m.name)?.paid || 0) - prevPaid(m.name));
      if (added > 0.01) await recordCreditedReceipt({ member: m, month, year, amount: added, source: "manager", split: { allocRent: added } });
    }
    loadRentHistory();
  }catch(e){ toast("Error: "+e.message,"error"); }
}

async function loadRentHistory() {
  const wrap = document.getElementById("rent-history");
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';
  const { data: all } = await getClient().from("rent").select("*").eq("mess_id", messId()).order("month_key", { ascending: false });
  if (!all?.length) { wrap.innerHTML = '<div class="empty">No rent records yet</div>'; return; }

  wrap.innerHTML = all.slice(0, 12).map(r => {
    const es    = r.entries || [];
    const due   = es.reduce((s, e) => s + Number(e.rent || 0), 0);
    const paid  = es.reduce((s, e) => s + Number(e.paid || 0), 0);
    const rate  = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0;
    const done  = es.filter(e => e.status === "paid").length;
    const left  = es.filter(e => e.status !== "paid").map(e => escapeHtml(e.name.split(" ")[0]));
    const st    = done === es.length && es.length ? "ok" : paid > 0 ? "mid" : "bad";
    return `<div class="rh-row">
      <div class="rh-month"><b>${monthLabelFromKey(r.month_key)}</b><span>${done}/${es.length} paid</span></div>
      <div class="rh-bar"><div class="dk-bar"><i style="width:${rate}%;background:${st === "ok" ? "var(--green)" : st === "mid" ? "var(--accent)" : "var(--red)"}"></i></div>
        <span class="rh-left">${left.length ? "Pending: " + left.slice(0, 4).join(", ") + (left.length > 4 ? ` +${left.length - 4}` : "") : "All cleared 🎉"}</span></div>
      <div class="rh-amt"><b style="color:var(--green)">${fmtTk(paid)}</b><span>of ${fmtTk(due)}</span></div>
      <span class="dk-chip ${st}">${rate}%</span>
    </div>`;
  }).join("");
}
