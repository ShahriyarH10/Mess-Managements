/* ═══════════════════════════════════════════════
   MEMBER — Pages: My Profile, Meal entry, Bazar, Payments, Mess Overview
   ═══════════════════════════════════════════════ */
async function renderMyMeals(el) {
  const member=await getMe(); if(!member) return;
  const myNotifs=await sb.from("notifications").select("*").eq("mess_id",messId()).eq("from_id",currentUser.memberId).eq("type","meal_request").order("created_at",{ascending:false});
  const history=sanitize(myNotifs.data||[]);
  el.innerHTML=`
  <div class="topbar"><div><div class="page-title">Meal Entry</div><div class="page-sub">Submit your meal count — manager will approve</div></div></div>
  <div class="content">
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">Submit meal request</div>
      <div class="date-row"><label>Date</label><input type="date" class="input" id="my-meal-date" value="${today()}" style="width:170px"/></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div class="field"><label>Day meals</label><input type="number" class="input" id="my-meal-day" min="0" max="4" step="0.5" value="1"/></div>
        <div class="field"><label>Night meals</label><input type="number" class="input" id="my-meal-night" min="0" max="4" step="0.5" value="1"/></div>
      </div>
      <div class="field"><label>Note (optional)</label><input type="text" class="input" id="my-meal-note" placeholder="e.g. I was absent at lunch"/></div>
      <button class="btn btn-primary" onclick="submitMealRequest()">📨 Submit to manager</button>
    </div>
    <div class="card"><div class="card-title">My requests</div>
      ${history.length===0?'<div class="empty">No requests yet</div>':`<div class="tbl-wrap"><table>
        <thead><tr><th>Date</th><th>Day</th><th>Night</th><th>Note</th><th>Status</th><th>Submitted</th></tr></thead>
        <tbody>${history.map(n=>{ const sc=n.status==="approved"?"badge-green":n.status==="rejected"?"badge-red":"badge-amber"; const sl=n.status==="approved"?"Approved":n.status==="rejected"?"Rejected":"Pending"; const dayKey=Object.keys(n.data).find(k=>k.endsWith("_day")); const nightKey=Object.keys(n.data).find(k=>k.endsWith("_night")); const dayVal=dayKey?n.data[dayKey]:0; const nightVal=nightKey?n.data[nightKey]:0; return`<tr><td>${n.date}</td><td>${dayVal>0?`<span class="badge badge-blue">${dayVal}</span>`:"—"}</td><td>${nightVal>0?`<span class="badge badge-amber">${nightVal}</span>`:"—"}</td><td style="color:var(--text3)">${n.note||"—"}</td><td><span class="badge ${sc}">${sl}</span></td><td style="color:var(--text3);font-size:12px">${new Date(n.created_at).toLocaleDateString()}</td></tr>`; }).join("")}</tbody>
      </table></div>`}
    </div>
  </div>`;
}

async function submitMealRequest() {
  const date=document.getElementById("my-meal-date")?.value;
  const day=parseFloat(document.getElementById("my-meal-day")?.value||0);
  const night=parseFloat(document.getElementById("my-meal-night")?.value||0);
  const note=cleanText(document.getElementById("my-meal-note")?.value||"");
  if(!date){ toast("Select a date"); return; }
  if(day===0&&night===0){ toast("Enter at least one meal"); return; }
  const member=await getMe();
  const data={ [member.name+"_day"]:day, [member.name+"_night"]:night, [member.name]:round2(day+night), day, night };
  try{ await dbSaveNotification({type:"meal_request",date,data,note}); toast("Request sent to manager 📨","success"); navigate("my-meals"); }catch(e){ toast("Error: "+e.message,"error"); }
}

async function renderMyBazar(el) {
  const member=await getMe(); if(!member) return;
  const myNotifs=await sb.from("notifications").select("*").eq("mess_id",messId()).eq("from_id",currentUser.memberId).eq("type","bazar_request").order("created_at",{ascending:false});
  const history=sanitize(myNotifs.data||[]);
  el.innerHTML=`
  <div class="topbar"><div><div class="page-title">Bazar Entry</div><div class="page-sub">Submit your grocery spending — manager will approve</div></div></div>
  <div class="content">
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">Submit bazar request</div>
      <div class="date-row"><label>Date</label><input type="date" class="input" id="my-bazar-date" value="${today()}" style="width:170px"/></div>
      <div class="field"><label>Amount (৳) *</label><input type="number" class="input" id="my-bazar-amount" min="0" placeholder="e.g. 850"/></div>
      <div class="field"><label>Note (optional)</label><input type="text" class="input" id="my-bazar-note" placeholder="e.g. Bought vegetables from market"/></div>
      <button class="btn btn-primary" onclick="submitBazarRequest()">📨 Submit to manager</button>
    </div>
    <div class="card"><div class="card-title">My requests</div>
      ${history.length===0?'<div class="empty">No requests yet</div>':`<div class="tbl-wrap"><table>
        <thead><tr><th>Date</th><th>Amount</th><th>Note</th><th>Status</th><th>Submitted</th></tr></thead>
        <tbody>${history.map(n=>{ const sc=n.status==="approved"?"badge-green":n.status==="rejected"?"badge-red":"badge-amber"; const sl=n.status==="approved"?"Approved":n.status==="rejected"?"Rejected":"Pending"; const amount=Object.values(n.data)[0]||0; return`<tr><td>${n.date}</td><td style="color:var(--green);font-weight:600">${fmtTk(amount)}</td><td style="color:var(--text3)">${n.note||"—"}</td><td><span class="badge ${sc}">${sl}</span></td><td style="color:var(--text3);font-size:12px">${new Date(n.created_at).toLocaleDateString()}</td></tr>`; }).join("")}</tbody>
      </table></div>`}
    </div>
  </div>`;
}

async function submitBazarRequest() {
  const date=document.getElementById("my-bazar-date")?.value;
  const amount=parseFloat(document.getElementById("my-bazar-amount")?.value||0);
  const note=cleanText(document.getElementById("my-bazar-note")?.value||"");
  if(!date){ toast("Select a date"); return; }
  if(amount<=0){ toast("Enter a valid amount"); return; }
  const member=await getMe();
  const data={[member.name]:amount};
  try{ await dbSaveNotification({type:"bazar_request",date,data,note}); toast("Request sent to manager 📨","success"); navigate("my-bazar"); }catch(e){ toast("Error: "+e.message,"error"); }
}

async function renderMyPayments(el) {
  const member=await getMe();
  if(!member){ el.innerHTML='<div class="content"><div class="empty">Profile not found</div></div>'; return; }
  const [allRent,{data:allUtil},billNotifs]=await Promise.all([
    dbGetAll("rent"),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).order("month_key",{ascending:false}),
    sb.from("notifications").select("*").eq("mess_id",messId()).eq("from_id",currentUser.memberId).eq("type","bill_payment").order("created_at",{ascending:false}),
  ]);
  const billHistory=sanitize(billNotifs.data||[]);
  const n=new Date();
  el.innerHTML=`
  <div class="topbar"><div><div class="page-title">My Payments</div><div class="page-sub">Rent & utility history</div></div></div>
  <div class="content">
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">Submit a bill payment</div>
      <div class="auth-sub" style="margin-bottom:14px;font-size:13px;color:var(--text2)">If you paid a bill directly, submit it here. Manager will approve and credit your account.</div>
      <div class="grid-2">
        <div class="field"><label>Month</label><select class="input" id="bp-month">${MONTHS.map((m,i)=>`<option value="${i}"${i===n.getMonth()?" selected":""}>${m}</option>`).join("")}</select></div>
        <div class="field"><label>Year</label><select class="input" id="bp-year">${Array.from({length:3},(_,i)=>2024+i).map(y=>`<option${y===n.getFullYear()?" selected":""}>${y}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>Bill type *</label><select class="input" id="bp-type"><option value="">— Select bill —</option><option value="elec">⚡ Electricity</option><option value="wifi">📶 WiFi</option><option value="gas">🔥 Gas</option><option value="khala">👩 Khala</option><option value="other">📦 Other</option><option value="rent">🏠 Room Rent</option></select></div>
      <div class="field"><label>Amount paid (৳) *</label><input type="number" class="input" id="bp-amount" min="0" placeholder="e.g. 1200"/></div>
      <div class="field"><label>Note (optional)</label><input type="text" class="input" id="bp-note" placeholder="e.g. Paid full electricity bill"/></div>
      <button class="btn btn-primary" onclick="submitBillPayment()">📨 Submit to manager</button>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">My bill payment requests</div>
      ${billHistory.length===0?'<div class="empty">No bill payment requests yet</div>':`<div class="tbl-wrap"><table>
        <thead><tr><th>Month</th><th>Bill</th><th>Amount</th><th>Note</th><th>Status</th><th>Submitted</th></tr></thead>
        <tbody>${billHistory.map(n=>{ const sc=n.status==="approved"?"badge-green":n.status==="rejected"?"badge-red":"badge-amber"; const sl=n.status==="approved"?"Approved":n.status==="rejected"?"Rejected":"Pending"; const billLabel={elec:"⚡ Electricity",wifi:"📶 WiFi",gas:"🔥 Gas",khala:"👩 Khala",other:"📦 Other",rent:"🏠 Rent"}[n.data.billType]||n.data.billType; return`<tr><td>${n.data.monthName} ${n.data.year}</td><td>${billLabel}</td><td style="color:var(--green);font-weight:600">${fmtTk(n.data.amount)}</td><td style="color:var(--text3)">${n.note||"—"}</td><td><span class="badge ${sc}">${sl}</span></td><td style="color:var(--text3);font-size:12px">${new Date(n.created_at).toLocaleDateString()}</td></tr>`; }).join("")}</tbody>
      </table></div>`}
    </div>
     
  </div>`;
}

async function submitBillPayment() {
  const month=parseInt(document.getElementById("bp-month")?.value);
  const year=parseInt(document.getElementById("bp-year")?.value);
  const billType=document.getElementById("bp-type")?.value;
  const amount=parseFloat(document.getElementById("bp-amount")?.value||0);
  const note=cleanText(document.getElementById("bp-note")?.value||"");
  if(!billType){ toast("Select a bill type"); return; }
  if(amount<=0){ toast("Enter a valid amount"); return; }
  const key=monthKey(year,month);
  const data={billType,amount,monthKey:key,monthName:MONTHS[month],year};
  try{ await dbSaveNotification({type:"bill_payment",date:today(),data,note}); toast("Bill payment submitted 📨","success"); navigate("my-payments"); }catch(e){ toast("Error: "+e.message,"error"); }
}

async function renderMessOverview(el) {
  const {month,year}=thisMonth(); const key=monthKey(year,month);
  const [allM,allB]=await Promise.all([dbGetAll("meals"),dbGetAll("bazar")]);
  const mM=allM.filter(r=>r.date.startsWith(key)), mB=allB.filter(r=>r.date.startsWith(key));
  let totalM=0, totalB=0;
  mM.forEach(r=>members.forEach(m=>{ const d=Number(r.meals[m.name+"_day"]??0),n=Number(r.meals[m.name+"_night"]??0); totalM+=round2(d+n)||Number(r.meals[m.name]||0); }));
  mB.forEach(r=>Object.values(r.bazar||{}).forEach(v=>totalB+=Number(v)));
  const mealRate=totalM>0?round2(totalB/totalM):0;
  let memBazar={};
  mB.forEach(r=>Object.entries(r.bazar||{}).forEach(([k,v])=>{ memBazar[k]=(memBazar[k]||0)+Number(v); }));
  const topB=Object.entries(memBazar).sort((a,b)=>b[1]-a[1]).slice(0,6), maxB=topB[0]?.[1]||1;
  el.innerHTML=`<div class="topbar"><div><div class="page-title">Mess Overview</div><div class="page-sub">${MONTHS[month]} ${year}</div></div></div>
  <div class="content">
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Total meals</div><div class="stat-value">${round2(totalM)}</div></div>
      <div class="stat-card"><div class="stat-label">Meal rate</div><div class="stat-value" style="font-size:17px">${fmtTk(mealRate)}</div></div>
      <div class="stat-card"><div class="stat-label">Total bazar</div><div class="stat-value" style="font-size:17px">${fmtTk(totalB)}</div></div>
      <div class="stat-card"><div class="stat-label">Members</div><div class="stat-value">${members.length}</div></div>
    </div>
    <div class="card" style="margin-bottom:12px"><div class="card-title">Bazar contributors</div>
      ${topB.length?topB.map(([name,amt])=>`<div class="mini-bar"><div class="mini-bar-label">${name}</div><div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.round((amt/maxB)*100)}%"></div></div><div class="mini-bar-val">${fmtTk(amt)}</div></div>`).join(""):'<div class="empty">No bazar data</div>'}
    </div>
    <div class="card"><div class="card-title">Member meal totals</div>
      ${members.length?`<div class="tbl-wrap"><table><thead><tr><th>Member</th><th>Meals</th><th>Bazar</th><th>Meal cost</th><th>Balance</th></tr></thead><tbody>${members.map(m=>{ let myM=0,myB=0; mM.forEach(r=>{ myM+=round2(Number(r.meals[m.name+"_day"]??0)+Number(r.meals[m.name+"_night"]??0))||Number(r.meals[m.name]||0); }); mB.forEach(r=>{ myB+=Number(r.bazar[m.name]||0); }); const mc=round2(myM*mealRate),bal=round2(myB-mc); return`<tr><td><b>${m.name}</b></td><td>${round2(myM)}</td><td style="color:var(--green)">${fmtTk(myB)}</td><td>${fmtTk(mc)}</td><td class="${bal>=0?"net-pos":"net-neg"}">${bal>=0?"Get "+fmtTk(bal):"Pay "+fmtTk(-bal)}</td></tr>`; }).join("")}</tbody></table></div>`:'<div class="empty">No members</div>'}
    </div>
  </div>`;
}
