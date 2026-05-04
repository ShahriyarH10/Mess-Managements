/* ═══════════════════════════════════════════════
   MEMBER — Dashboard: settlement stats, today's meals, what I owe
   ═══════════════════════════════════════════════ */
async function getMe() { return members.find(m=>m.id===currentUser.memberId)||null; }

async function renderMyDashboard(el) {
  const member=await getMe();
  if(!member){ el.innerHTML='<div class="content"><div class="empty">Profile not found. Contact manager.</div></div>'; return; }
  const {month,year}=thisMonth();
  const key=monthKey(year,month);
  const prevMonth=month===0?11:month-1;
  const prevYear=month===0?year-1:year;
  const prevKey=monthKey(prevYear,prevMonth);

  const [allMeals,allBazar,rentRec,currentUtilRes,prevUtilRes]=await Promise.all([
    dbGetAll("meals"), dbGetAll("bazar"), dbGetMonth("rent",key),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",key).maybeSingle(),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",prevKey).maybeSingle(),
  ]);
  const currentUtilRec=currentUtilRes.data;
  const prevUtilRec=prevUtilRes.data;

  // POSTPAID: Meals & Bazar from PREVIOUS month
  const prevMealRows=allMeals.filter(r=>r.date.startsWith(prevKey));
  const prevBazarRows=allBazar.filter(r=>r.date.startsWith(prevKey));
  let myMeals=0, myBazar=0, allMealsTotal=0, allBazarTotal=0;
  prevMealRows.forEach(r=>{
    const d=Number(r.meals[member.name+"_day"]??0), n=Number(r.meals[member.name+"_night"]??0);
    myMeals+=round2(d+n)||Number(r.meals[member.name]||0);
    members.forEach(m=>{ const md=Number(r.meals[m.name+"_day"]??0),mn=Number(r.meals[m.name+"_night"]??0); allMealsTotal+=round2(md+mn)||Number(r.meals[m.name]||0); });
  });
  prevBazarRows.forEach(r=>{ myBazar+=Number(r.bazar[member.name]||0); allBazarTotal+=Object.values(r.bazar||{}).reduce((a,v)=>a+Number(v),0); });
  const mealRate=allMealsTotal>0?round2(allBazarTotal/allMealsTotal):0;
  const mealCost=round2(myMeals*mealRate);

  const prevBills=prevUtilRec?.bills||{};
  const khalaShare=members.length>0?round2(Number(prevBills.khala||0)/members.length):0;
  const otherShare=members.length>0?round2(Number(prevBills.other||0)/members.length):0;
  const currentBills=currentUtilRec?.bills||{};
  const totalPrepaid=["elec","wifi","gas"].reduce((s,k)=>s+(Number(currentBills[k])||0),0);
  const prepaidShare=members.length>0?round2(totalPrepaid/members.length):0;
  const myRe=rentRec?.entries?.find(e=>e.name===member.name)||{};
  const myRentDue=Number(myRe.rent||0);
  const myRentPaid=Number(myRe.paid||0);
  const myUtilPay=(currentUtilRec?.payments||{})[member.name]||{};
  const myUtilActualPaid=Number(myUtilPay.paid||0);

  const netTotal=round2(mealCost+khalaShare+otherShare+myRentDue+prepaidShare-myBazar-myUtilActualPaid);

  const idx=members.findIndex(m=>m.id===member.id);
  const col=avatarCol(Math.max(idx,0));
  const rc=myRe.status==="paid"?"badge-green":myRe.status==="partial"?"badge-amber":"badge-red";
  const uc=myUtilPay.status==="paid"?"badge-green":myUtilPay.status==="partial"?"badge-amber":"badge-red";

  // Today meals totals
  const todayStr=today();
  const todayRec=allMeals.find(r=>r.date===todayStr);
  let todayDay=0, todayNight=0;
  if(todayRec){ members.forEach(m=>{ todayDay+=Number(todayRec.meals[m.name+"_day"]??todayRec.meals[m.name]??0); todayNight+=Number(todayRec.meals[m.name+"_night"]??0); }); todayDay=round2(todayDay); todayNight=round2(todayNight); }

  // Per-member badges for today
  let memberBadgesHTML = "";
  if(todayRec){
    memberBadgesHTML = members.map(m=>{
      const d=Number(todayRec.meals[m.name+"_day"]??todayRec.meals[m.name]??0);
      const n=Number(todayRec.meals[m.name+"_night"]??0);
      const i=members.findIndex(x=>x.id===m.id), c=avatarCol(i);
      let badges="";
      if(d>0) badges+='<span style="background:var(--blue-bg);color:var(--blue);font-size:10px;padding:1px 5px;border-radius:4px;font-weight:600">D'+d+'</span>';
      if(n>0) badges+='<span style="background:var(--accent-bg);color:var(--accent);font-size:10px;padding:1px 5px;border-radius:4px;font-weight:600">N'+n+'</span>';
      return '<div style="display:inline-flex;align-items:center;gap:5px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 10px">'+
        '<span style="font-size:13px;font-weight:500">'+m.name+'</span>'+badges+
        '</div>';
    }).join("");
  }

  el.innerHTML=`
  <div class="topbar">
    <div><div class="page-title">My Dashboard</div><div class="page-sub">${MONTHS[month]} ${year}</div></div>
  </div>
  <div class="content">

    <!-- Settlement stats + Today — matching image layout -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">

      <!-- Left: Settlement stat boxes -->
      <div class="card">
        <div class="card-title">This month's settlement <span style="font-size:11px;color:var(--text3);font-weight:400">(meals from ${MONTHS[prevMonth].slice(0,3)})</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
          <div class="stat-card">
            <div class="stat-label">My meals</div>
            <div class="stat-value">${round2(myMeals)}</div>
            <div class="stat-sub">${MONTHS[prevMonth].slice(0,3)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Meal rate</div>
            <div class="stat-value" style="font-size:17px">${fmtTk(mealRate)}</div>
            <div class="stat-sub">per meal</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">My bazar</div>
            <div class="stat-value" style="font-size:17px">${fmtTk(myBazar)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Meal cost</div>
            <div class="stat-value" style="font-size:17px">${fmtTk(mealCost)}</div>
          </div>
        </div>
      </div>

      <!-- Right: Today's meals — Day/Night/Total big numbers + per-member badges -->
      <div class="card">
        <div class="card-title">Today — ${todayStr}</div>
        ${todayRec ? `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-bottom:14px">
          <div style="background:var(--blue-bg);border:1px solid rgba(91,155,213,.2);border-radius:var(--radius-sm);padding:14px;text-align:center">
            <div style="font-size:11px;color:var(--blue);font-weight:600;margin-bottom:6px">Day</div>
            <div style="font-size:20px;font-weight:700;color:var(--blue);line-height:1">${todayDay}</div>
          </div>
          <div style="background:var(--accent-bg);border:1px solid rgba(212,168,83,.2);border-radius:var(--radius-sm);padding:14px;text-align:center">
            <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:6px">Night</div>
            <div style="font-size:20px;font-weight:700;color:var(--accent);line-height:1">${todayNight}</div>
          </div>
          <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;text-align:center">
            <div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:6px">Total</div>
            <div style="font-size:20px;font-weight:700;line-height:1">${round2(todayDay+todayNight)}</div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:7px">${memberBadgesHTML}</div>
        ` : `<div class="empty" style="padding:20px">No meal entry today</div>`}
      </div>
    </div>

    <!-- What I Owe -->
    <div class="card" style="padding:16px">
  <div class="card-title">What I Owe — ${MONTHS[month]} ${year}</div>

  <!-- Postpaid -->
  <div style="font-size:11px;color:var(--red);font-weight:600;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">
    🔴 Postpaid — from ${MONTHS[prevMonth]} ${prevYear}
  </div>
  <div class="my-stat-row">
    <span class="my-stat-key">🍽️ Meal cost <span style="font-size:10px;color:var(--text3)">${round2(myMeals)} × ${fmtTk(mealRate)}</span></span>
    <span class="my-stat-val">${fmtTk(mealCost)}</span>
  </div>
  <div class="my-stat-row">
    <span class="my-stat-key">👩 Khala</span>
    <span class="my-stat-val">${fmtTk(khalaShare)}</span>
  </div>
  <div class="my-stat-row">
    <span class="my-stat-key">📦 Other</span>
    <span class="my-stat-val">${fmtTk(otherShare)}</span>
  </div>
  <div class="my-stat-row" style="color:var(--text3);font-size:12px">
    <span>Postpaid subtotal</span>
    <span>${fmtTk(round2(mealCost+khalaShare+otherShare))}</span>
  </div>

  <!-- Prepaid -->
  <div style="font-size:11px;color:var(--blue);font-weight:600;margin:10px 0 8px;text-transform:uppercase;letter-spacing:.5px;border-top:1px solid var(--border);padding-top:10px">
    🔵 Prepaid — for ${MONTHS[month]} ${year}
  </div>
  <div class="my-stat-row">
    <span class="my-stat-key">🏠 Rent</span>
    <span class="my-stat-val" style="color:${myRe.status==='paid'?'var(--green)':'var(--text)'}">${fmtTk(myRentDue)} ${myRe.status==='paid'?'✓':''}</span>
  </div>
  <div class="my-stat-row">
    <span class="my-stat-key">⚡ Utility <span style="font-size:10px;color:var(--text3)">elec+wifi+gas</span></span>
    <span class="my-stat-val" style="color:${myUtilPay.status==='paid'?'var(--green)':'var(--text)'}">${fmtTk(prepaidShare)} ${myUtilPay.status==='paid'?'✓':''}</span>
  </div>
  <div class="my-stat-row" style="color:var(--text3);font-size:12px">
    <span>Prepaid subtotal</span>
    <span>${fmtTk(round2(myRentDue+prepaidShare))}</span>
  </div>

  <!-- Net -->
  <div style="border-top:2px solid var(--border2);margin-top:6px;padding-top:10px">
    <div class="my-stat-row">
      <span class="my-stat-key" style="color:var(--text2)">Total</span>
      <span class="my-stat-val">${fmtTk(round2(mealCost+khalaShare+otherShare+myRentDue+prepaidShare))}</span>
    </div>
    <div class="my-stat-row">
      <span class="my-stat-key" style="color:var(--green)">− Bazar credit</span>
      <span class="my-stat-val" style="color:var(--green)">${fmtTk(myBazar)}</span>
    </div>
    ${myUtilActualPaid > 0 ? `
    <div class="my-stat-row">
      <span class="my-stat-key" style="color:var(--green)">− Utility paid</span>
      <span class="my-stat-val" style="color:var(--green)">${fmtTk(myUtilActualPaid)}</span>
    </div>` : ''}
    <div class="my-stat-row" style="font-size:15px;border-top:1px solid var(--border);margin-top:4px;padding-top:8px">
      <span style="font-weight:700">Net</span>
      <span style="font-weight:700;color:${netTotal>0?'var(--red)':'var(--green)'}">${
        netTotal > 0 ? 'Pay ' + fmtTk(netTotal) :
        netTotal < 0 ? 'Get ' + fmtTk(-netTotal) :
        'Settled ✓'
      }</span>
    </div>
  </div>
</div>

  </div>`;
}

async function renderMyProfile(el) {
  const member=await getMe();
  if(!member){ el.innerHTML='<div class="content"><div class="empty">Profile not found</div></div>'; return; }
  el.innerHTML=`
  <div class="topbar">
    <div><div class="page-title">My Profile</div><div class="page-sub">Personal stats</div></div>
    <div class="topbar-actions">
      <select class="input" id="my-prof-period" onchange="refreshMyProfile()" style="width:180px">
        <option value="1" selected>This month</option>
        <option value="last">Last month</option>
        <option value="3">Last 3 months</option>
        <option value="6">Last 6 months</option>
        <option value="all">All time</option>
      </select>
    </div>
  </div>
  <div class="content" id="my-profile-content"><div class="loading"><div class="spinner"></div>Loading…</div></div>`;
  await loadMyProfile(member);
}

async function refreshMyProfile() { const member=await getMe(); if(!member) return; await loadMyProfile(member); }

async function loadMyProfile(member) {
  const content=document.getElementById("my-profile-content"); if(!content) return;
  content.innerHTML='<div class="loading"><div class="spinner"></div>Loading…</div>';
  const {month,year} = thisMonth();
  const curKey  = monthKey(year, month);
  const prevMonth = month===0?11:month-1, prevYear = month===0?year-1:year;
  const prevKey = monthKey(prevYear, prevMonth);
  const [allM,allB,allR,{data:allU},profRentRes,profCurUtilRes,profPrevUtilRes]=await Promise.all([
    dbGetAll("meals"), dbGetAll("bazar"), dbGetAll("rent"),
    sb.from("utility_payments").select("*").eq("mess_id",messId()),
    dbGetMonth("rent", curKey),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",curKey).maybeSingle(),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",prevKey).maybeSingle(),
  ]);
  const curUtilRec  = profCurUtilRes.data;
  const prevUtilRec = profPrevUtilRes.data;

  const period=document.getElementById("my-prof-period")?.value||"1";
  const {meals,bazar,rent,utility}=getFilteredData(allM,allB,allR,period,allU||[]);
  const s=getMemberStats(member,meals,bazar,rent,utility);
  const idx=members.findIndex(m=>m.id===member.id);
  const col=avatarCol(Math.max(idx,0));
  const allMK=Object.keys(s.byMonth).sort(), r8=allMK.slice(-8);
  const maxM=Math.max(...r8.map(k=>s.byMonth[k]?.meals||0),1);

  const allMealsTotal=allM.reduce((s,r)=>s+members.reduce((a,m)=>{ const d=Number(r.meals[m.name+"_day"]??0),n=Number(r.meals[m.name+"_night"]??0); return a+(round2(d+n)||Number(r.meals[m.name]||0)); },0),0);
  const allBazarTotal=allB.reduce((s,r)=>s+Object.values(r.bazar||{}).reduce((a,v)=>a+Number(v),0),0);
  const mealShare=allMealsTotal>0?Math.round((s.totalMeals/allMealsTotal)*100):0;
  const bazarShare=allBazarTotal>0?Math.round((s.totalBazar/allBazarTotal)*100):0;

  // Fix 3a: Meal pay/get from previous month only
  const mealNet = getPrevMonthMealBalance(member, allM, allB);
  // Fix 3b: Utility balance = prepaid + postpaid due − paid
  const utilNet = getUtilityBalance(member, curUtilRec, prevUtilRec);
  const rentNet = round2(s.rentPaid - s.rentDue);

  const periodLabel={"1":"This month","last":"Last month","3":"Last 3 months","6":"Last 6 months","all":"All time"}[period]||"";

  // Fix 1: My Profile matches manager profile view structure
  // Fix 2: Recent months + What I Owe side by side
  const recentMonthsHTML =
    '<div class="card" style="padding:16px">' +
    '<div class="card-title">Recent months</div>' +
    '<div class="tbl-wrap"><table><thead><tr><th>Month</th><th>Meals</th><th>Bazar</th><th>Rent paid</th><th>Util paid</th></tr></thead>' +
    '<tbody>' + allMK.slice(-6).reverse().map(k=>{const d=s.byMonth[k]||{};return '<tr><td>'+MONTHS[parseInt(k.slice(5))-1]+' '+k.slice(0,4)+'</td><td>'+(d.meals||0)+'</td><td>'+fmtTk(d.bazar||0)+'</td><td style="color:var(--green)">'+fmtTk(d.rentPaid||0)+'</td><td style="color:var(--green)">'+fmtTk(d.utilityPaid||0)+'</td></tr>';}).join("") +
    '</tbody></table></div></div>';

  const whatIOweHTML = buildWhatIOweHTML(member, allM, allB, profRentRes, curUtilRec, prevUtilRec);

  const myRe = profRentRes?.entries?.find(e=>e.name===member.name)||{};
  const myUtilPay = (curUtilRec?.payments||{})[member.name]||{};
  const rc=myRe.status==="paid"?"badge-green":myRe.status==="partial"?"badge-amber":"badge-red";
  const uc=myUtilPay.status==="paid"?"badge-green":myUtilPay.status==="partial"?"badge-amber":"badge-red";

  content.innerHTML=`<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:14px">
        <div class="avatar" style="width:52px;height:52px;font-size:17px;background:${col.bg};color:${col.fg};border:2px solid var(--accent)">${initials(member.name)}</div>
        <div>
          <div style="font-family:var(--font-serif);font-size:22px">${member.name}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">Room ${member.room||"—"}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:1px">@${member.username||"—"} · Joined: ${member.joined||"—"}</div>
          <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">
            <span class="badge ${rc}">Rent ${myRe.status==="paid"?"✓ paid":"due"}</span>
            <span class="badge ${uc}">Utility ${myUtilPay.status==="paid"?"✓ paid":"due"}</span>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        <div style="text-align:right"><div style="font-size:11px;color:var(--text3)">Meal pay/get</div><div style="font-size:18px;font-weight:700" class="${mealNet>=0?"net-pos":"net-neg"}">${mealNet>=0?"Get ":"Pay "}${fmtTk(Math.abs(mealNet))}</div></div>
        <div style="text-align:right;padding-left:20px;border-left:1px solid var(--border)"><div style="font-size:11px;color:var(--text3)">Rent balance</div><div style="font-size:18px;font-weight:700" class="${rentNet>=0?"net-pos":"net-neg"}">${rentNet>=0?"+":""}${fmtTk(rentNet)}</div></div>
        <div style="text-align:right;padding-left:20px;border-left:1px solid var(--border)"><div style="font-size:11px;color:var(--text3)">Utility balance</div><div style="font-size:18px;font-weight:700" class="${utilNet>=0?"net-pos":"net-neg"}">${utilNet>=0?"+":""}${fmtTk(utilNet)}</div></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:7px;margin-bottom:18px">
      ${[["Total meals",s.totalMeals,null],["Active days",s.activeDays,null],["Avg/day",s.avgMeals,null],["Bazar spent",fmtTk(s.totalBazar),null],["Meal cost",fmtTk(s.mealCost),null],["Rent paid",fmtTk(s.rentPaid),"var(--green)"],["Util paid",fmtTk(round2(s.utilityPaid)),"var(--green)"]].map(([l,v,c])=>'<div class="stat-card" style="padding:9px"><div class="stat-label">'+l+'</div><div style="font-size:15px;font-weight:600;margin-top:4px'+(c?";color:"+c:"")+'">'+v+'</div></div>').join("")}
    </div>
    <div class="detail-section"><div class="detail-section-title">Mess share — ${periodLabel}</div>
      <div class="mini-bar"><div class="mini-bar-label">Meal share</div><div class="mini-bar-track" style="height:8px"><div class="mini-bar-fill" style="width:${mealShare}%"></div></div><div class="mini-bar-val">${mealShare}%</div></div>
      <div class="mini-bar"><div class="mini-bar-label">Bazar share</div><div class="mini-bar-track" style="height:8px"><div class="mini-bar-fill" style="width:${bazarShare}%"></div></div><div class="mini-bar-val">${bazarShare}%</div></div>
    </div>
    <div class="detail-section"><div class="detail-section-title">Monthly meal history</div>
      ${r8.length?`<div class="hist-labels">${r8.map(k=>`<span>${MONTHS[parseInt(k.slice(5))-1].slice(0,3)}</span>`).join("")}</div><div class="hist-wrap">${r8.map(k=>{ const v=s.byMonth[k]?.meals||0; const h=Math.max(Math.round((v/maxM)*44),3); return`<div class="hist-b" style="height:${h}px"><div class="tip">${MONTHS[parseInt(k.slice(5))-1].slice(0,3)}: ${v}</div></div>`; }).join("")}</div>`:'<div style="color:var(--text3);font-size:13px">No history</div>'}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
      ${recentMonthsHTML}
      ${whatIOweHTML}
    </div>
  </div>`;
}
