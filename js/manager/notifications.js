/* ═══════════════════════════════════════════════
   MANAGER — Notifications: member requests, approve/reject
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   NOTIFICATIONS (MANAGER)
═══════════════════════════════════════════ */
async function renderNotifications(el) {
  const all=await dbGetNotifications();
  const pending=all.filter(n=>n.status==="pending");
  const resolved=all.filter(n=>n.status!=="pending");
  el.innerHTML=`
  <div class="topbar">
    <div><div class="page-title">Member Requests</div><div class="page-sub">${pending.length} pending approval</div></div>
    <div class="topbar-actions"><button class="btn btn-ghost btn-sm" onclick="navigate('notifications')">Refresh</button></div>
  </div>
  <div class="content">
    ${pending.length===0?`<div class="card" style="text-align:center;padding:32px"><div style="font-size:28px;margin-bottom:10px">✅</div><div style="color:var(--text2);font-size:14px">No pending requests</div></div>`:`<div class="card" style="margin-bottom:14px"><div class="card-title">Pending (${pending.length})</div><div style="display:flex;flex-direction:column;gap:10px">${pending.map(n=>notifCard(n,true)).join("")}</div></div>`}
    ${resolved.length>0?`<div class="card"><div class="card-title">Recent resolved (${resolved.length})</div><div style="display:flex;flex-direction:column;gap:8px">${resolved.slice(0,20).map(n=>notifCard(n,false)).join("")}</div></div>`:""}
  </div>`;
}

function notifCard(n,showActions) {
  const typeMap={ meal_request:{icon:"🍽️",label:"Meal entry"}, bazar_request:{icon:"🛒",label:"Bazar entry"}, bill_payment:{icon:"💡",label:"Bill payment"} };
  const {icon,label}=typeMap[n.type]||{icon:"📋",label:n.type};
  const statusCls=n.status==="approved"?"badge-green":n.status==="rejected"?"badge-red":"badge-amber";
  const statusLabel=n.status==="approved"?"Approved":n.status==="rejected"?"Rejected":"Pending";
  const billTypeLabel={elec:"⚡ Electricity",wifi:"📶 WiFi",gas:"🔥 Gas",khala:"👩 Khala",other:"📦 Other",rent:"🏠 Rent"};
  let dataHtml="";
  if(n.type==="meal_request"){ const entries=Object.entries(n.data||{}).filter(([k])=>!["day","night"].includes(k)); dataHtml=entries.map(([k,v])=>`<span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">${k}: <b>${v}</b></span>`).join(" "); }
  else if(n.type==="bazar_request"){ const amount=Object.values(n.data)[0]||0; dataHtml=`<span style="font-size:13px;font-weight:600;color:var(--green)">${fmtTk(amount)}</span>`; }
  else if(n.type==="bill_payment"){ dataHtml=`<span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">${billTypeLabel[n.data.billType]||n.data.billType}</span><span style="font-size:13px;font-weight:600;color:var(--green)">${fmtTk(n.data.amount)}</span><span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">${n.data.monthName} ${n.data.year}</span>`; }
  return`<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span>${icon}</span><span style="font-weight:600;font-size:14px">${n.from_name}</span>
          <span style="font-size:12px;color:var(--text3)">submitted a ${label}</span>
          <span class="badge ${statusCls}" style="font-size:10px">${statusLabel}</span>
        </div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px">📅 ${n.date} · ${new Date(n.created_at).toLocaleString()}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:${n.note?"8px":"0"}">${dataHtml}</div>
        ${n.note?`<div style="font-size:12px;color:var(--text2);margin-top:6px">💬 "${n.note}"</div>`:""}
      </div>
      ${showActions?`<div style="display:flex;gap:6px;flex-shrink:0"><button class="btn btn-primary btn-sm" onclick="approveRequest('${n.id}')">✓ Approve</button><button class="btn btn-danger btn-sm" onclick="rejectRequest('${n.id}')">✕ Reject</button></div>`:""}
    </div>
  </div>`;
}

async function approveRequest(id) {
  const billTypeLabel={elec:"Electricity",wifi:"WiFi",gas:"Gas",khala:"Khala",other:"Other",rent:"Rent"};
  const all=await dbGetNotifications();
  const n=all.find(x=>x.id===id); if(!n) return;
  try {
    if(n.type==="meal_request"){
      const {data:existing}=await sb.from("meals").select("*").eq("mess_id",messId()).eq("date",n.date).maybeSingle();
      const merged={...(existing?.meals||{}),...n.data};
      members.forEach(m=>{ const d=Number(merged[m.name+"_day"]||0); const nt=Number(merged[m.name+"_night"]||0); merged[m.name]=round2(d+nt); });
      await dbUpsertMeals(n.date,merged);
    } else if(n.type==="bazar_request"){
      const {data:existing}=await sb.from("bazar").select("*").eq("mess_id",messId()).eq("date",n.date).maybeSingle();
      const cleanData={...n.data}; delete cleanData.amount;
      const merged={...(existing?.bazar||{}),...cleanData};
      await dbUpsertBazar(n.date,merged);
    } else if(n.type==="bill_payment"){
      const {billType,amount,monthKey:mk,monthName,year}=n.data;
      const month=MONTHS.indexOf(monthName);
      if(billType==="rent"){
        const {data:rentRec}=await sb.from("rent").select("*").eq("mess_id",messId()).eq("month_key",mk).maybeSingle();
        if(rentRec){
          const entries=rentRec.entries.map(e=>{ if(e.name===n.from_name){ const newPaid=round2(Number(e.paid||0)+amount); return{...e,paid:newPaid,status:newPaid>=Number(e.rent||0)?"paid":"partial"}; } return e; });
          await dbUpsertRent(month,year,mk,entries);
        } else {
          const entries=members.map(m=>({ name:m.name, rent:0, paid:m.name===n.from_name?amount:0, status:m.name===n.from_name?(amount>0?"partial":"unpaid"):"unpaid", notes:m.name===n.from_name?"Paid by member":"" }));
          await dbUpsertRent(month,year,mk,entries);
        }
      } else {
        const {data:utilRec}=await sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",mk).maybeSingle();
        const existingPayments=utilRec?.payments||{};
        const myPayment=existingPayments[n.from_name]||{paid:0,status:"unpaid"};
        const bills=utilRec?.bills||{};
        const totalBill=["elec","wifi","gas","khala","other"].reduce((s,k)=>s+(bills[k]||0),0);
        const myShare=members.length>0?round2(totalBill/members.length):0;
        const newPaid=round2(Number(myPayment.paid||0)+amount);
        const updatedPayments={...existingPayments,[n.from_name]:{paid:newPaid,status:newPaid>=myShare?"paid":"partial",notes:`Paid ${fmtTk(amount)} for ${billTypeLabel[billType]||billType}`}};
        await dbUpsertUtility(month,year,mk,utilRec?.bills||{},updatedPayments);
      }
    }
    await dbUpdateNotifStatus(id,"approved");
    toast("Request approved ✓","success");
    refreshNotifBadge();
    navigate("notifications");
  } catch(e){ toast("Error: "+e.message,"error"); }
}

async function rejectRequest(id) {
  if(!confirm("Reject this request?")) return;
  try{ await dbUpdateNotifStatus(id,"rejected"); toast("Request rejected"); refreshNotifBadge(); navigate("notifications"); }catch(e){ toast("Error: "+e.message,"error"); }
}
