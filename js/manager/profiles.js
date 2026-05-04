/* ═══════════════════════════════════════════════
   MANAGER — Profiles: member stats, profile cards, profile detail modal
   ═══════════════════════════════════════════════ */
let selectedProfileId = null;
async function renderProfiles(el) {
  el.innerHTML=`
  <div class="topbar">
    <div><div class="page-title">Member Profiles</div><div class="page-sub">Individual summaries</div></div>
    <div class="topbar-actions">
      <select class="input" id="prof-period" onchange="refreshProfiles()" style="width:180px">
        <option value="1" selected>This month</option>
        <option value="last">Last month</option>
        <option value="3">Last 3 months</option>
        <option value="6">Last 6 months</option>
        <option value="all">All time</option>
      </select>
    </div>
  </div>
  <div class="content"><div class="grid-auto" id="profile-card-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px"></div></div>`;
  await loadProfiles();
}

async function loadProfiles() {
  const {month,year} = thisMonth();
  const key = monthKey(year, month);
  const prevMonth = month===0?11:month-1, prevYear = month===0?year-1:year;
  const prevKey = monthKey(prevYear, prevMonth);
  const [allMeals,allBazar,allRent,{data:allUtil},curUtilRes,prevUtilRes] = await Promise.all([
    dbGetAll("meals"), dbGetAll("bazar"), dbGetAll("rent"),
    sb.from("utility_payments").select("*").eq("mess_id",messId()),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",key).maybeSingle(),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",prevKey).maybeSingle(),
  ]);
  buildProfileCards(allMeals,allBazar,allRent,allUtil||[],curUtilRes.data,prevUtilRes.data);
  if (selectedProfileId) showProfileDetail(selectedProfileId,allMeals,allBazar,allRent,allUtil||[],null,curUtilRes.data,prevUtilRes.data);
}
async function refreshProfiles() { await loadProfiles(); }

function getFilteredData(allM,allB,allR,period,allU=[]) {
  if (period==="all") return {meals:allM,bazar:allB,rent:allR,utility:allU};
  if (period==="last") {
    const now=new Date(); let m=now.getMonth()-1,y=now.getFullYear();
    if(m<0){m=11;y--;}
    const key=y+"-"+String(m+1).padStart(2,"0");
    return { meals:allM.filter(r=>r.date.slice(0,7)===key), bazar:allB.filter(r=>r.date.slice(0,7)===key), rent:allR.filter(r=>r.month_key===key), utility:allU.filter(r=>r.month_key===key) };
  }
  const months=parseInt(period), now=new Date();
  let cm=now.getMonth()-months+1, cy=now.getFullYear();
  while(cm<0){cm+=12;cy--;}
  const cut=cy+"-"+String(cm+1).padStart(2,"0");
  return { meals:allM.filter(r=>r.date.slice(0,7)>=cut), bazar:allB.filter(r=>r.date.slice(0,7)>=cut), rent:allR.filter(r=>r.month_key>=cut), utility:allU.filter(r=>r.month_key>=cut) };
}

function getMemberStats(member,meals,bazar,rent,utility=[]) {
  let tm=0,tb=0,rd=0,rp=0,ud=0,up=0,ad=0;
  const byM={};
  const em=k=>{ byM[k]=byM[k]||{meals:0,bazar:0,rentPaid:0,utilityPaid:0}; };
  meals.forEach(r=>{
    const d=Number(r.meals[member.name+"_day"]??0), n=Number(r.meals[member.name+"_night"]??0);
    const v=round2(d+n)||Number(r.meals[member.name]||0);
    tm+=v; if(v>0) ad++;
    const k=r.date.slice(0,7); em(k); byM[k].meals+=v;
  });
  bazar.forEach(r=>{ const v=Number(r.bazar[member.name]||0); tb+=v; const k=r.date.slice(0,7); em(k); byM[k].bazar+=v; });
  rent.forEach(r=>{ const e=r.entries?.find(x=>x.name===member.name); if(e){ rd+=Number(e.rent||0); rp+=Number(e.paid||0); em(r.month_key); byM[r.month_key].rentPaid+=Number(e.paid||0); } });
  utility.forEach(r=>{
    const bills=r.bills||{};
    const total=["elec","wifi","gas","khala","other"].reduce((s,k)=>s+(Number(bills[k])||0),0);
    const perHead=members.length>0?round2(total/members.length):0;
    const p=(r.payments||{})[member.name]||{};
    ud+=perHead; up+=Number(p.paid||0); em(r.month_key); byM[r.month_key].utilityPaid+=Number(p.paid||0);
  });
  const allMealsTotal=meals.reduce((s,r)=>s+members.reduce((a,m)=>{ const d=Number(r.meals[m.name+"_day"]??0),n=Number(r.meals[m.name+"_night"]??0); return a+(round2(d+n)||Number(r.meals[m.name]||0)); },0),0);
  const allBazarTotal=bazar.reduce((s,r)=>s+Object.values(r.bazar||{}).reduce((a,v)=>a+Number(v),0),0);
  const mr=allMealsTotal>0?allBazarTotal/allMealsTotal:0;
  const mc=round2(tm*mr);
  const latestR=[...rent].sort((a,b)=>b.month_key.localeCompare(a.month_key))[0];
  const latestRS=latestR?.entries?.find(x=>x.name===member.name)?.status||"unpaid";
  const latestU=[...utility].sort((a,b)=>b.month_key.localeCompare(a.month_key))[0];
  const latestUS=(latestU?.payments||{})[member.name]?.status||"unpaid";
  return { totalMeals:round2(tm), totalBazar:tb, mealRate:round2(mr), mealCost:mc, mealBalance:round2(tb-mc), rentDue:rd, rentPaid:rp, utilityDue:round2(ud), utilityPaid:round2(up), activeDays:ad, avgMeals:meals.length>0?round2(tm/meals.length):0, latestStatus:latestRS, latestUtilStatus:latestUS, byMonth:byM };
}

/* ── Prev-month meal balance (bazar credit − meal cost from previous month only) ── */
function getPrevMonthMealBalance(member, allM, allB) {
  const {month,year} = thisMonth();
  const prevMonth = month===0?11:month-1, prevYear = month===0?year-1:year;
  const prevKey = monthKey(prevYear, prevMonth);
  const prevMealRows  = allM.filter(r => r.date.startsWith(prevKey));
  const prevBazarRows = allB.filter(r => r.date.startsWith(prevKey));
  let myMeals=0, myBazar=0, allMealsT=0, allBazarT=0;
  prevMealRows.forEach(r => {
    const d=Number(r.meals[member.name+"_day"]??0), n=Number(r.meals[member.name+"_night"]??0);
    myMeals += round2(d+n)||Number(r.meals[member.name]||0);
    members.forEach(m => { const md=Number(r.meals[m.name+"_day"]??0),mn=Number(r.meals[m.name+"_night"]??0); allMealsT+=round2(md+mn)||Number(r.meals[m.name]||0); });
  });
  prevBazarRows.forEach(r => { myBazar+=Number(r.bazar[member.name]||0); allBazarT+=Object.values(r.bazar||{}).reduce((a,v)=>a+Number(v),0); });
  const rate = allMealsT>0 ? round2(allBazarT/allMealsT) : 0;
  const cost = round2(myMeals * rate);
  return round2(myBazar - cost); // positive = get back, negative = pay
}

/* ── Utility balance = (prepaid + postpaid total due) − actual paid ── */
function getUtilityBalance(member, currentUtilRec, prevUtilRec) {
  const currentBills = currentUtilRec?.bills || {};
  const prevBills    = prevUtilRec?.bills || {};
  const prepaidDue   = members.length>0 ? round2(["elec","wifi","gas"].reduce((s,k)=>s+(Number(currentBills[k])||0),0)/members.length) : 0;
  const postpaidDue  = members.length>0 ? round2((Number(prevBills.khala||0)+Number(prevBills.other||0))/members.length) : 0;
  const totalDue     = round2(prepaidDue + postpaidDue);
  const actualPaid   = Number((currentUtilRec?.payments||{})[member.name]?.paid||0);
  return round2(actualPaid - totalDue); // positive = overpaid (credit), negative = still owes
}

/* ── "What I Owe" card HTML (shared by all profile views) ── */
function buildWhatIOweHTML(member, allMeals, allBazar, currentRentRec, currentUtilRec, prevUtilRec) {
  const {month,year} = thisMonth();
  const prevMonth = month===0?11:month-1, prevYear = month===0?year-1:year;
  const prevKey = monthKey(prevYear, prevMonth);

  const prevMealRows  = allMeals.filter(r => r.date.startsWith(prevKey));
  const prevBazarRows = allBazar.filter(r => r.date.startsWith(prevKey));
  let myMeals=0, myBazar=0, allMealsTotal=0, allBazarTotal=0;
  prevMealRows.forEach(r => {
    const d=Number(r.meals[member.name+"_day"]??0), n=Number(r.meals[member.name+"_night"]??0);
    myMeals += round2(d+n)||Number(r.meals[member.name]||0);
    members.forEach(m => { const md=Number(r.meals[m.name+"_day"]??0),mn=Number(r.meals[m.name+"_night"]??0); allMealsTotal+=round2(md+mn)||Number(r.meals[m.name]||0); });
  });
  prevBazarRows.forEach(r => { myBazar+=Number(r.bazar[member.name]||0); allBazarTotal+=Object.values(r.bazar||{}).reduce((a,v)=>a+Number(v),0); });
  const mealRate   = allMealsTotal>0 ? round2(allBazarTotal/allMealsTotal) : 0;
  const mealCost   = round2(myMeals * mealRate);
  const prevBills  = prevUtilRec?.bills || {};
  const khalaShare = members.length>0 ? round2(Number(prevBills.khala||0)/members.length) : 0;
  const otherShare = members.length>0 ? round2(Number(prevBills.other||0)/members.length) : 0;
  const currentBills  = currentUtilRec?.bills || {};
  const totalPrepaid  = ["elec","wifi","gas"].reduce((s,k)=>s+(Number(currentBills[k])||0),0);
  const prepaidShare  = members.length>0 ? round2(totalPrepaid/members.length) : 0;
  const myRe          = currentRentRec?.entries?.find(e=>e.name===member.name) || {};
  const myRentDue     = Number(myRe.rent||0);
  const myUtilPaid    = Number((currentUtilRec?.payments||{})[member.name]?.paid||0);
  const netTotal      = round2(mealCost+khalaShare+otherShare+myRentDue+prepaidShare-myBazar-myUtilPaid);

  return '<div class="card" style="padding:16px">' +
    '<div class="card-title">What I Owe — ' + MONTHS[month] + ' ' + year + '</div>' +
    '<div style="font-size:11px;color:var(--red);font-weight:600;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">🔴 Postpaid — from ' + MONTHS[prevMonth] + ' ' + prevYear + '</div>' +
    '<div class="my-stat-row"><span class="my-stat-key">🍽️ Meal cost <span style="font-size:10px;color:var(--text3)">' + round2(myMeals) + ' × ' + fmtTk(mealRate) + '</span></span><span class="my-stat-val">' + fmtTk(mealCost) + '</span></div>' +
    '<div class="my-stat-row"><span class="my-stat-key">👩 Khala</span><span class="my-stat-val">' + fmtTk(khalaShare) + '</span></div>' +
    '<div class="my-stat-row"><span class="my-stat-key">📦 Other</span><span class="my-stat-val">' + fmtTk(otherShare) + '</span></div>' +
    '<div class="my-stat-row" style="color:var(--text3);font-size:12px"><span>Postpaid subtotal</span><span>' + fmtTk(round2(mealCost+khalaShare+otherShare)) + '</span></div>' +
    '<div style="font-size:11px;color:var(--blue);font-weight:600;margin:10px 0 8px;text-transform:uppercase;letter-spacing:.5px;border-top:1px solid var(--border);padding-top:10px">🔵 Prepaid — for ' + MONTHS[month] + ' ' + year + '</div>' +
    '<div class="my-stat-row"><span class="my-stat-key">🏠 Rent</span><span class="my-stat-val">' + fmtTk(myRentDue) + '</span></div>' +
    '<div class="my-stat-row"><span class="my-stat-key">⚡ Utility <span style="font-size:10px;color:var(--text3)">elec+wifi+gas</span></span><span class="my-stat-val">' + fmtTk(prepaidShare) + '</span></div>' +
    '<div class="my-stat-row" style="color:var(--text3);font-size:12px"><span>Prepaid subtotal</span><span>' + fmtTk(round2(myRentDue+prepaidShare)) + '</span></div>' +
    '<div style="border-top:2px solid var(--border2);margin-top:6px;padding-top:10px">' +
    '<div class="my-stat-row"><span class="my-stat-key" style="color:var(--green)">− Bazar credit</span><span class="my-stat-val" style="color:var(--green)">' + fmtTk(myBazar) + '</span></div>' +
    (myUtilPaid>0 ? '<div class="my-stat-row"><span class="my-stat-key" style="color:var(--green)">− Utility paid</span><span class="my-stat-val" style="color:var(--green)">' + fmtTk(myUtilPaid) + '</span></div>' : '') +
    '<div class="my-stat-row" style="font-size:15px;border-top:1px solid var(--border);margin-top:4px;padding-top:8px"><span style="font-weight:700">Net</span><span style="font-weight:700;color:' + (netTotal>0?"var(--red)":"var(--green)") + '">' + (netTotal>0?"Pay "+fmtTk(netTotal):netTotal<0?"Get "+fmtTk(-netTotal):"Settled ✓") + '</span></div>' +
    '</div></div>';
}

function buildProfileCards(allM,allB,allR,allU,curUtilRec,prevUtilRec) {
  const period=document.getElementById("prof-period")?.value||"1";
  const {meals,bazar,rent,utility}=getFilteredData(allM,allB,allR,period,allU);
  const grid=document.getElementById("profile-card-grid"); if(!grid) return;
  if(!members.length){ grid.innerHTML='<div class="empty">No members yet.</div>'; return; }
  grid.innerHTML=members.map((m,i)=>{
    const s=getMemberStats(m,meals,bazar,rent,utility);
    const col=avatarCol(i);
    const rc=s.latestStatus==="paid"?"badge-green":s.latestStatus==="partial"?"badge-amber":"badge-red";
    const uc=s.latestUtilStatus==="paid"?"badge-green":s.latestUtilStatus==="partial"?"badge-amber":"badge-red";
    return `<div class="profile-card" onclick="selectProfile('${m.id}')" style="padding:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div class="avatar" style="background:${col.bg};color:${col.fg};width:40px;height:40px;font-size:14px;flex-shrink:0">${initials(m.name)}</div>
        <div>
          <div style="font-weight:700;font-size:15px;margin-bottom:4px">${m.name}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <span class="badge ${rc}" style="font-size:10px">${s.latestStatus==="paid"?"Rent ✓":s.latestStatus==="partial"?"Rent partial":"Rent due"}</span>
            <span class="badge ${uc}" style="font-size:10px">${s.latestUtilStatus==="paid"?"Utility ✓":s.latestUtilStatus==="partial"?"Utility partial":"Utility due"}</span>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="stat-card" style="padding:10px"><div class="stat-label" style="font-size:11px">Meals</div><div style="font-size:20px;font-weight:700">${s.totalMeals}</div></div>
        <div class="stat-card" style="padding:10px"><div class="stat-label" style="font-size:11px">Avg/day</div><div style="font-size:20px;font-weight:700">${s.avgMeals}</div></div>
        <div class="stat-card" style="padding:10px"><div class="stat-label" style="font-size:11px">Bazar</div><div style="font-size:16px;font-weight:700">${fmtTk(s.totalBazar)}</div></div>
        <div class="stat-card" style="padding:10px"><div class="stat-label" style="font-size:11px">Utility paid</div><div style="font-size:16px;font-weight:700;color:var(--green)">${fmtTk(round2(s.utilityPaid))}</div></div>
        <div class="stat-card" style="padding:10px;grid-column:span 2"><div class="stat-label" style="font-size:11px">Rent paid</div><div style="font-size:16px;font-weight:700;color:var(--green)">${fmtTk(s.rentPaid)}</div></div>
      </div>
    </div>`;
  }).join("");
}

async function selectProfile(id) {
  const {month,year} = thisMonth();
  const key = monthKey(year, month);
  const prevMonth = month===0?11:month-1, prevYear = month===0?year-1:year;
  const prevKey = monthKey(prevYear, prevMonth);
  const [allM,allB,allR,{data:allU},rentRes,curUtilRes,prevUtilRes] = await Promise.all([
    dbGetAll("meals"), dbGetAll("bazar"), dbGetAll("rent"),
    sb.from("utility_payments").select("*").eq("mess_id",messId()),
    dbGetMonth("rent", key),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",key).maybeSingle(),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",prevKey).maybeSingle(),
  ]);
  showProfileDetail(id,allM,allB,allR,allU||[],rentRes,curUtilRes.data,prevUtilRes.data);
}

function showProfileDetail(id,allM,allB,allR,allU,currentRentRec,currentUtilRec,prevUtilRec) {
  const member=members.find(m=>m.id===id); if(!member) return;
  selectedProfileId = id;
  const period=document.getElementById("prof-period")?.value||"1";
  const {meals,bazar,rent,utility}=getFilteredData(allM,allB,allR,period,allU);
  const s=getMemberStats(member,meals,bazar,rent,utility);
  const col=avatarCol(members.indexOf(member));
  const allMK=Object.keys(s.byMonth).sort(), r8=allMK.slice(-8);
  const maxM=Math.max(...r8.map(k=>s.byMonth[k]?.meals||0),1);

  // Fix 3a: Meal pay/get from previous month only
  const mealNet  = getPrevMonthMealBalance(member, allM, allB);
  // Fix 3b: Utility balance = prepaid + postpaid due − paid
  const utilNet  = getUtilityBalance(member, currentUtilRec, prevUtilRec);
  const rentNet  = round2(s.rentPaid - s.rentDue);

  const allMealsTotal=allM.reduce((s,r)=>s+members.reduce((a,m)=>{ const d=Number(r.meals[m.name+"_day"]??0),n=Number(r.meals[m.name+"_night"]??0); return a+(round2(d+n)||Number(r.meals[m.name]||0)); },0),0);
  const allBazarTotal=allB.reduce((s,r)=>s+Object.values(r.bazar||{}).reduce((a,v)=>a+Number(v),0),0);
  const mealShare=allMealsTotal>0?Math.round((s.totalMeals/allMealsTotal)*100):0;
  const bazarShare=allBazarTotal>0?Math.round((s.totalBazar/allBazarTotal)*100):0;

  // Fix 2: Recent months + What I Owe side by side
  const recentMonthsHTML =
    '<div class="card" style="padding:16px">' +
    '<div class="card-title">Recent months</div>' +
    '<div class="tbl-wrap"><table><thead><tr><th>Month</th><th>Meals</th><th>Bazar</th><th>Rent paid</th><th>Util paid</th></tr></thead>' +
    '<tbody>' + allMK.slice(-6).reverse().map(k=>{const d=s.byMonth[k]||{};return '<tr><td>'+MONTHS[parseInt(k.slice(5))-1]+' '+k.slice(0,4)+'</td><td>'+( d.meals||0)+'</td><td>'+fmtTk(d.bazar||0)+'</td><td style="color:var(--green)">'+fmtTk(d.rentPaid||0)+'</td><td style="color:var(--green)">'+fmtTk(d.utilityPaid||0)+'</td></tr>';}).join("") +
    '</tbody></table></div></div>';

  const whatIOweHTML = buildWhatIOweHTML(member,allM,allB,currentRentRec,currentUtilRec,prevUtilRec);

  document.getElementById("modal-content").innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:14px">
        <div class="avatar" style="width:50px;height:50px;font-size:16px;background:${col.bg};color:${col.fg};border:2px solid var(--accent)">${initials(member.name)}</div>
        <div>
          <div style="font-family:var(--font-serif);font-size:22px;font-weight:600">${member.name}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px">Room ${member.room||"—"} · @${member.username||"—"} · Joined: ${member.joined||"—"}</div>
        </div>
      </div>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        <div style="text-align:right"><div style="font-size:11px;color:var(--text3)">Meal pay/get</div><div style="font-size:18px;font-weight:700" class="${mealNet>=0?"net-pos":"net-neg"}">${mealNet>=0?"Get ":"Pay "}${fmtTk(Math.abs(mealNet))}</div></div>
        <div style="text-align:right;padding-left:20px;border-left:1px solid var(--border)"><div style="font-size:11px;color:var(--text3)">Rent balance</div><div style="font-size:18px;font-weight:700" class="${rentNet>=0?"net-pos":"net-neg"}">${rentNet>=0?"+":""}${fmtTk(rentNet)}</div></div>
        <div style="text-align:right;padding-left:20px;border-left:1px solid var(--border)"><div style="font-size:11px;color:var(--text3)">Utility balance</div><div style="font-size:18px;font-weight:700" class="${utilNet>=0?"net-pos":"net-neg"}">${utilNet>=0?"+":""}${fmtTk(utilNet)}</div></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:18px">
      ${[["Total meals",s.totalMeals,null],["Active days",s.activeDays,null],["Avg/day",s.avgMeals,null],["Bazar spent",fmtTk(s.totalBazar),null],["Meal cost",fmtTk(s.mealCost),null],["Rent due",fmtTk(s.rentDue),null],["Rent paid",fmtTk(s.rentPaid),"var(--green)"],["Utility due",fmtTk(round2(s.utilityDue)),null],["Utility paid",fmtTk(round2(s.utilityPaid)),"var(--green)"]].map(([l,v,c])=>'<div class="stat-card" style="padding:10px"><div class="stat-label">'+l+'</div><div style="font-size:15px;font-weight:600;margin-top:4px'+(c?";color:"+c:"")+'">'+v+'</div></div>').join("")}
    </div>
    <div class="detail-section"><div class="detail-section-title">Share in mess</div>
      <div class="mini-bar"><div class="mini-bar-label">Meal share</div><div class="mini-bar-track" style="height:8px"><div class="mini-bar-fill" style="width:${mealShare}%"></div></div><div class="mini-bar-val">${mealShare}%</div></div>
      <div class="mini-bar"><div class="mini-bar-label">Bazar share</div><div class="mini-bar-track" style="height:8px"><div class="mini-bar-fill" style="width:${bazarShare}%"></div></div><div class="mini-bar-val">${bazarShare}%</div></div>
    </div>
    <div class="detail-section"><div class="detail-section-title">Monthly meal history</div>
      ${r8.length?`<div class="hist-labels">${r8.map(k=>`<span>${MONTHS[parseInt(k.slice(5))-1].slice(0,3)}</span>`).join("")}</div><div class="hist-wrap">${r8.map(k=>{const v=s.byMonth[k]?.meals||0;const h=Math.max(Math.round((v/maxM)*44),3);return`<div class="hist-b" style="height:${h}px"><div class="tip">${MONTHS[parseInt(k.slice(5))-1].slice(0,3)}: ${v}</div></div>`;}).join("")}</div>`:'<div style="color:var(--text3);font-size:13px">No history</div>'}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
      ${recentMonthsHTML}
      ${whatIOweHTML}
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`;
  document.querySelector(".modal").classList.add("modal-wide");
  openModal();
}
