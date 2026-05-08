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
  const period = document.getElementById("prof-period")?.value || "1";
  const {month, year} = thisMonth();
  let curM = month, curY = year;
  if (period === "last") {
    curM = month === 0 ? 11 : month - 1;
    curY = month === 0 ? year - 1 : year;
  }
  const key = monthKey(curY, curM);
  const prevM = curM===0?11:curM-1, prevY = curM===0?curY-1:curY;
  const prevKey = monthKey(prevY, prevM);
  const [allMeals,allBazar,allRent,{data:allUtil},curUtilRes,prevUtilRes] = await Promise.all([
    dbGetAll("meals"), dbGetAll("bazar"), dbGetAll("rent"),
    sb.from("utility_payments").select("*").eq("mess_id",messId()),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",key).maybeSingle(),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",prevKey).maybeSingle(),
  ]);
  buildProfileCards(allMeals,allBazar,allRent,allUtil||[],curUtilRes.data,prevUtilRes.data);
  if (selectedProfileId) showProfileDetail(selectedProfileId,allMeals,allBazar,allRent,allUtil||[],null,curUtilRes.data,prevUtilRes.data,curM,curY);
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
  // Canonical utility due for each settlement month M:
  //   prepaid (Elec+Gas+WiFi) from M's record  +  postpaid (Khala+Other) from M-1's record
  // Index records by month_key so we can look up the previous-month bills.
  const utilByKey = {};
  utility.forEach(r => { utilByKey[r.month_key] = r; });
  utility.forEach(r => {
    const prevKey  = previousMonthFromKey(r.month_key).key;
    const prepaid  = utilTotalFromBills(r.bills || {},                     UTIL_PREPAID_KEYS);
    const postpaid = utilTotalFromBills(utilByKey[prevKey]?.bills || {},   UTIL_POSTPAID_KEYS);
    const perHead  = members.length>0 ? round2((prepaid + postpaid) / members.length) : 0;
    const p        = (r.payments || {})[member.name] || {};
    ud += perHead; up += Number(p.paid || 0);
    em(r.month_key); byM[r.month_key].utilityPaid += Number(p.paid || 0);
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

/* ── Current-month meal balance (bazar credit − meal cost) ── */
function profilePreviousMonth(month, year) {
  const pm = month === 0 ? 11 : month - 1;
  const py = month === 0 ? year - 1 : year;

  return {
    month: pm,
    year: py,
    key: monthKey(py, pm),
  };
}

/* Meal pay/get for selected settlement month — net of meal_paid (cash collected).
   Positive  → member is owed back (Get).
   Negative  → member still owes (Pay).
   Zero      → fully settled. */
function getPrevMonthMealBalance(member, allM, allB, curM, curY, currentUtilRec) {
  const { month: tm, year: ty } = thisMonth();
  const month = curM !== undefined ? curM : tm;
  const year  = curY !== undefined ? curY : ty;
  const prev  = previousMonth(month, year);

  // Use the canonical calcSettlementTotals (available from helpers.js)
  const totals = calcSettlementTotals(allM, allB, prev.key);

  const memberMeals = Number(totals.memberMeals[member.name] || 0);
  const memberBazar = Number(totals.memberBazar[member.name] || 0);
  const mealCost    = round2(memberMeals * totals.mealRate);
  const mealPaid    = Number((currentUtilRec?.payments || {})[member.name]?.meal_paid || 0);

  // bazar + cash already paid − what they ate. Zero when fully covered.
  return round2(memberBazar + mealPaid - mealCost);
}

function getUtilityBalance(member, currentUtilRec, previousUtilRec) {
  // Total utility due = current month prepaid (Elec+Gas+WiFi) + previous month postpaid (Khala+Other)
  // Both are settled together under the current month payment record.
  const memberCount   = members.length || 1;
  const prepaidTotal  = utilTotalFromBills(currentUtilRec?.bills  || {}, UTIL_PREPAID_KEYS);
  const postpaidTotal = utilTotalFromBills(previousUtilRec?.bills || {}, UTIL_POSTPAID_KEYS);
  const totalDue      = round2((prepaidTotal + postpaidTotal) / memberCount);
  const actualPaid    = Number((currentUtilRec?.payments || {})[member.name]?.paid || 0);
  return round2(actualPaid - totalDue);
}
function buildWhatIOweHTML(
  member,
  allMeals,
  allBazar,
  currentRentRec,
  currentUtilRec,
  prevUtilRec,
  curM,
  curY
) {
  const { month: tm, year: ty } = thisMonth();
  const month = curM !== undefined ? curM : tm;
  const year  = curY !== undefined ? curY : ty;

  const currentKey = monthKey(year, month);
  const prevMonth  = month === 0 ? 11 : month - 1;
  const prevYear   = month === 0 ? year - 1 : year;
  const prevKey    = monthKey(prevYear, prevMonth);

  // ── Postpaid: meals & bazar from PREVIOUS month ──
  const prevMealRows  = (allMeals  || []).filter(r => String(r.date || "").startsWith(prevKey));
  const prevBazarRows = (allBazar  || []).filter(r => String(r.date || "").startsWith(prevKey));

  let myMeals = 0, myBazar = 0, allMealsTotal = 0, allBazarTotal = 0;

  prevMealRows.forEach(row => {
    members.forEach(m => {
      const v = mealTotalFromObj(row.meals || {}, m.name);
      allMealsTotal += v;
      if (m.name === member.name) myMeals += v;
    });
  });

  prevBazarRows.forEach(row => {
    members.forEach(m => {
      const amount = Number((row.bazar || {})[m.name] || 0);
      allBazarTotal += amount;
      if (m.name === member.name) myBazar += amount;
    });
  });

  const mealRate = allMealsTotal > 0 ? round2(allBazarTotal / allMealsTotal) : 0;
  const mealCost = round2(myMeals * mealRate);

  // ── Previous month postpaid utility ──
  const prevBills  = prevUtilRec?.bills || {};
  const khalaShare = members.length > 0 ? round2(Number(prevBills.khala || 0) / members.length) : 0;
  const otherShare = members.length > 0 ? round2(Number(prevBills.other || 0) / members.length) : 0;

  // ── Current month prepaid utility ──
  const currentBills = currentUtilRec?.bills || {};
  const totalPrepaid = ["elec", "wifi", "gas"].reduce((sum, k) => sum + Number(currentBills[k] || 0), 0);
  const prepaidShare = members.length > 0 ? round2(totalPrepaid / members.length) : 0;
  const elecAmt      = Number(currentBills.elec  || 0);
  const gasAmt       = Number(currentBills.gas   || 0);
  const wifiAmt      = Number(currentBills.wifi  || 0);

  // ── Current month rent ──
  const myRe         = currentRentRec?.entries?.find(e => e.name === member.name) || {};
  const myRentDue    = Number(myRe.rent || 0);

  // ── Credits ──
  const myUtilPay         = (currentUtilRec?.payments || {})[member.name] || {};
  const myUtilActualPaid  = Number(myUtilPay.paid || 0);
  const myMealPaid        = Number(myUtilPay.meal_paid || 0);
  const myRentPaid        = Number(myRe.paid || 0);

  // ── Utility payment covers BOTH prepaid (Elec/Gas/WiFi) and postpaid (Khala/Other) ──
  // A single payment record in currentUtilRec.payments tracks the total amount paid.
  const totalUtilDue     = round2(prepaidShare + khalaShare + otherShare);
  const utilPaidStatus   = myUtilPay.status || "unpaid"; // "paid" | "partial" | "unpaid"
  const utilFullyPaid    = utilPaidStatus === "paid";
  const utilPartiallyPaid= utilPaidStatus === "partial";
  const utilStatusLabel  = utilFullyPaid ? "✅ Paid" : utilPartiallyPaid ? "⚠️ Partial" : "⏳ Not paid yet";
  const utilStatusColor  = utilFullyPaid ? "var(--green)" : utilPartiallyPaid ? "var(--amber)" : "var(--text)";

  const totalBeforeCredit = round2(mealCost + khalaShare + otherShare + myRentDue + prepaidShare);
  const netTotal          = round2(totalBeforeCredit - myBazar - myRentPaid - myUtilActualPaid - myMealPaid);

  const prevLabel = `${MONTHS[prevMonth]} ${prevYear}`;
  const curLabel  = `${MONTHS[month]} ${year}`;

  return `
    <div class="card" style="padding:16px">
      <div class="card-title">What I Owe — ${curLabel}</div>

      <div style="font-size:11px;color:var(--red);font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">
        🔴 Postpaid — from ${prevLabel}
      </div>

      <div class="my-stat-row">
        <span class="my-stat-key">
          🍽️ Meal cost
          <span style="font-size:10px;color:var(--text3);display:block">
            ${round2(myMeals)} meals × ${fmtTk(mealRate)}
          </span>
          <span style="font-size:10px;color:var(--text3);display:block">
            Rate = ${fmtTk(allBazarTotal)} ÷ ${round2(allMealsTotal)} total meals
          </span>
        </span>
        <span class="my-stat-val">${fmtTk(mealCost)}</span>
      </div>

      <div class="my-stat-row">
        <span class="my-stat-key">
          👩 Khala bill
          <span style="font-size:10px;color:var(--text3);display:block">
            ${fmtTk(Number(prevBills.khala || 0))} ÷ ${members.length} members
          </span>
          <span style="font-size:10px;color:${utilStatusColor};display:block">${utilStatusLabel}</span>
        </span>
        <span class="my-stat-val" style="color:${utilStatusColor}">
          ${fmtTk(khalaShare)} ${utilFullyPaid ? "✓" : ""}
        </span>
      </div>

      <div class="my-stat-row">
        <span class="my-stat-key">
          📦 Other cost
          <span style="font-size:10px;color:var(--text3);display:block">
            ${fmtTk(Number(prevBills.other || 0))} ÷ ${members.length} members
          </span>
          <span style="font-size:10px;color:${utilStatusColor};display:block">${utilStatusLabel}</span>
        </span>
        <span class="my-stat-val" style="color:${utilStatusColor}">
          ${fmtTk(otherShare)} ${utilFullyPaid ? "✓" : ""}
        </span>
      </div>

      <div class="my-stat-row" style="color:var(--text3);font-size:12px;border-top:1px dashed var(--border);padding-top:4px;margin-top:2px">
        <span>Postpaid subtotal</span>
        <span>${fmtTk(round2(mealCost + khalaShare + otherShare))}</span>
      </div>

      <div style="font-size:11px;color:var(--blue);font-weight:600;margin:10px 0 6px;text-transform:uppercase;letter-spacing:.5px;border-top:1px solid var(--border);padding-top:10px">
        🔵 Prepaid — for ${curLabel}
      </div>

      <div class="my-stat-row">
        <span class="my-stat-key">
          🏠 Rent
          <span style="font-size:10px;color:var(--text3);display:block">
            ${myRe.status === "paid" ? "✅ Paid" : myRe.status === "partial" ? "⚠️ Partial" : "⏳ Not paid yet"}
          </span>
        </span>
        <span class="my-stat-val" style="color:${myRe.status === "paid" ? "var(--green)" : "var(--text)"}">
          ${fmtTk(myRentDue)} ${myRe.status === "paid" ? "✓" : ""}
        </span>
      </div>

      <div class="my-stat-row">
        <span class="my-stat-key">
          ⚡ Utility share (Elec+Gas+WiFi)
          <span style="font-size:10px;color:var(--text3);display:block">
            ${fmtTk(totalPrepaid)} ÷ ${members.length} members
          </span>
          <span style="font-size:10px;color:var(--text3);display:block">
            Elec ${fmtTk(elecAmt)} + Gas ${fmtTk(gasAmt)} + WiFi ${fmtTk(wifiAmt)}
          </span>
          <span style="font-size:10px;color:${utilStatusColor};display:block">${utilStatusLabel}</span>
        </span>
        <span class="my-stat-val" style="color:${utilStatusColor}">
          ${fmtTk(prepaidShare)} ${utilFullyPaid ? "✓" : ""}
        </span>
      </div>

      <div class="my-stat-row" style="color:var(--text3);font-size:12px;border-top:1px dashed var(--border);padding-top:4px;margin-top:2px">
        <span>Prepaid subtotal (rent + util)</span>
        <span>${fmtTk(round2(myRentDue + prepaidShare))}</span>
      </div>

      <div style="border-top:2px solid var(--border2);margin-top:8px;padding-top:10px">

        ${myUtilActualPaid > 0 || utilFullyPaid ? `
        <div style="background:rgba(39,174,96,.07);border:1px solid rgba(39,174,96,.25);border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:12px">
          <div style="font-weight:700;color:var(--green);margin-bottom:4px">💳 Utility payment record</div>
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text2)">Total utility due (Elec+Gas+WiFi+Khala+Other)</span>
            <span style="font-weight:600">${fmtTk(totalUtilDue)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:3px">
            <span style="color:var(--green)">Paid</span>
            <span style="font-weight:700;color:var(--green)">${fmtTk(myUtilActualPaid)}</span>
          </div>
          ${myUtilActualPaid < totalUtilDue ? `
          <div style="display:flex;justify-content:space-between;margin-top:3px">
            <span style="color:var(--red)">Remaining</span>
            <span style="font-weight:700;color:var(--red)">${fmtTk(round2(totalUtilDue - myUtilActualPaid))}</span>
          </div>` : ""}
        </div>
        ` : ""}

        <div class="my-stat-row">
          <span class="my-stat-key" style="color:var(--text2);font-weight:600">Total before credits</span>
          <span class="my-stat-val">${fmtTk(totalBeforeCredit)}</span>
        </div>

        <div class="my-stat-row">
          <span class="my-stat-key" style="color:var(--green)">
            − Bazar credit
            <span style="font-size:10px;color:var(--text3);display:block">Groceries you bought in ${prevLabel}</span>
          </span>
          <span class="my-stat-val" style="color:var(--green)">${fmtTk(myBazar)}</span>
        </div>

        ${myRentPaid > 0
          ? `<div class="my-stat-row">
              <span class="my-stat-key" style="color:var(--green)">
                − Rent paid
                <span style="font-size:10px;color:var(--text3);display:block">Room rent already paid for ${curLabel}</span>
              </span>
              <span class="my-stat-val" style="color:var(--green)">${fmtTk(myRentPaid)}</span>
            </div>`
          : ""
        }

        ${myMealPaid > 0
          ? `<div class="my-stat-row">
              <span class="my-stat-key" style="color:var(--green)">
                − Meal paid (cash)
                <span style="font-size:10px;color:var(--text3);display:block">Cash collected against meal portion in ${prevLabel}</span>
              </span>
              <span class="my-stat-val" style="color:var(--green)">${fmtTk(myMealPaid)}</span>
            </div>`
          : ""
        }

        ${myUtilActualPaid > 0
          ? `<div class="my-stat-row">
              <span class="my-stat-key" style="color:var(--green)">
                − Utility paid
                <span style="font-size:10px;color:var(--text3);display:block">Covers Elec+Gas+WiFi+Khala+Other</span>
              </span>
              <span class="my-stat-val" style="color:var(--green)">${fmtTk(myUtilActualPaid)}</span>
            </div>`
          : ""
        }

        <div class="my-stat-row" style="font-size:15px;border-top:1px solid var(--border);margin-top:4px;padding-top:8px;background:var(--accent-bg);border-radius:6px;padding:10px;margin-top:8px">
          <span style="font-weight:700">Net payable</span>
          <span style="font-weight:800;color:${netTotal > 0 ? "var(--red)" : netTotal < 0 ? "var(--green)" : "var(--text)"}">
            ${netTotal > 0 ? "Pay " + fmtTk(netTotal) : netTotal < 0 ? "Get " + fmtTk(Math.abs(netTotal)) : "✓ Settled"}
          </span>
        </div>
      </div>
    </div>
  `;
}


function buildProfileCards(allM,allB,allR,allU,curUtilRec,prevUtilRec) {
  const period=document.getElementById("prof-period")?.value||"1";
  const {meals,bazar,rent,utility}=getFilteredData(allM,allB,allR,period,allU);
  const grid=document.getElementById("profile-card-grid"); if(!grid) return;
  if(!members.length){ grid.innerHTML='<div class="empty">No members yet.</div>'; return; }

  // Resolve the *settlement* month the cards should reflect.
  // For "this month" / "last month" we use that exact month.
  // For multi-month periods we use the most recent month so card values
  // match what the manager is most likely about to settle.
  const {month: tm, year: ty} = thisMonth();
  let cMonth = tm, cYear = ty;
  if (period === "last") {
    cMonth = tm === 0 ? 11 : tm - 1;
    cYear  = tm === 0 ? ty - 1 : ty;
  }
  const settlementKey   = monthKey(cYear, cMonth);
  const currentRentRec  = allR.find(r => r.month_key === settlementKey) || null;
  const isSinglePeriod  = (period === "1" || period === "last");

  grid.innerHTML=members.map((m,i)=>{
    const s   = getMemberStats(m, meals, bazar, rent, utility);
    const col = avatarCol(i);

    // Canonical per-member settlement for the resolved month — keeps
    // card numbers in sync with Monthly Log + What-I-Owe detail panel.
    const p = calcMemberSettlement(m, allM, allB, currentRentRec, curUtilRec, prevUtilRec, settlementKey);

    // Status badges always reflect the *current* settlement record
    // (so the manager always sees the actionable state, regardless of period).
    const rentStatus = p.rentStatus    || "unpaid";
    const utilStatus = p.utilityStatus || "unpaid";
    const rc = rentStatus==="paid"?"badge-green":rentStatus==="partial"?"badge-amber":"badge-red";
    const uc = utilStatus==="paid"?"badge-green":utilStatus==="partial"?"badge-amber":"badge-red";

    const netCls   = p.netPayable > 0 ? "net-neg" : p.netPayable < 0 ? "net-pos" : "";
    const netLabel = p.netPayable > 0
      ? "Pay "  + fmtTk(p.netPayable)
      : p.netPayable < 0
        ? "Get " + fmtTk(Math.abs(p.netPayable))
        : "✓ Settled";
    const periodLabel = isSinglePeriod
      ? monthLabelFromKey(settlementKey)
      : (period === "all" ? "All time" : "Last " + period + " months");

    return `<div class="profile-card" onclick="selectProfile('${m.id}')" style="padding:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div class="avatar" style="background:${col.bg};color:${col.fg};width:40px;height:40px;font-size:14px;flex-shrink:0">${initials(m.name)}</div>
        <div style="min-width:0;flex:1">
          <div style="font-weight:700;font-size:15px;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.name}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <span class="badge ${rc}" style="font-size:10px">${rentStatus==="paid"?"Rent ✓":rentStatus==="partial"?"Rent ~":"Rent due"}</span>
            <span class="badge ${uc}" style="font-size:10px">${utilStatus==="paid"?"Utility ✓":utilStatus==="partial"?"Utility ~":"Utility due"}</span>
          </div>
        </div>
      </div>

      <div style="background:var(--accent-bg);border:1px solid var(--border2);border-radius:8px;padding:10px 12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Net payable · ${monthLabelFromKey(settlementKey)}</div>
        </div>
        <div class="${netCls}" style="font-size:18px;font-weight:800;margin-top:2px">${netLabel}</div>
      </div>

      <div style="font-size:10px;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">${periodLabel} · totals</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="stat-card" style="padding:10px"><div class="stat-label" style="font-size:11px">Meals</div><div style="font-size:18px;font-weight:700">${s.totalMeals}</div></div>
        <div class="stat-card" style="padding:10px"><div class="stat-label" style="font-size:11px">Avg/day</div><div style="font-size:18px;font-weight:700">${s.avgMeals}</div></div>
        <div class="stat-card" style="padding:10px"><div class="stat-label" style="font-size:11px">Bazar</div><div style="font-size:14px;font-weight:700">${fmtTk(s.totalBazar)}</div></div>
        <div class="stat-card" style="padding:10px"><div class="stat-label" style="font-size:11px">Utility paid</div><div style="font-size:14px;font-weight:700;color:var(--green)">${fmtTk(round2(s.utilityPaid))}</div></div>
        <div class="stat-card" style="padding:10px;grid-column:span 2"><div class="stat-label" style="font-size:11px">Rent paid</div><div style="font-size:14px;font-weight:700;color:var(--green)">${fmtTk(s.rentPaid)}</div></div>
      </div>
    </div>`;
  }).join("");
}

async function selectProfile(id) {
  const period = document.getElementById("prof-period")?.value || "1";
  const {month, year} = thisMonth();
  let curM = month, curY = year;
  if (period === "last") {
    curM = month === 0 ? 11 : month - 1;
    curY = month === 0 ? year - 1 : year;
  }
  const key = monthKey(curY, curM);
  const prevM = curM===0?11:curM-1, prevY = curM===0?curY-1:curY;
  const prevKey = monthKey(prevY, prevM);
  const [allM,allB,allR,{data:allU},rentRes,curUtilRes,prevUtilRes] = await Promise.all([
    dbGetAll("meals"), dbGetAll("bazar"), dbGetAll("rent"),
    sb.from("utility_payments").select("*").eq("mess_id",messId()),
    dbGetMonth("rent", key),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",key).maybeSingle(),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",prevKey).maybeSingle(),
  ]);
  showProfileDetail(id,allM,allB,allR,allU||[],rentRes,curUtilRes.data,prevUtilRes.data,curM,curY);
}

function showProfileDetail(id,allM,allB,allR,allU,currentRentRec,currentUtilRec,prevUtilRec,curM,curY) {
  const member=members.find(m=>m.id===id); if(!member) return;
  selectedProfileId = id;
  const period=document.getElementById("prof-period")?.value||"1";
  const {meals,bazar,rent,utility}=getFilteredData(allM,allB,allR,period,allU);
  const s=getMemberStats(member,meals,bazar,rent,utility);
  const col=avatarCol(members.indexOf(member));
  const allMK=Object.keys(s.byMonth).sort(), r8=allMK.slice(-8);
  const maxM=Math.max(...r8.map(k=>s.byMonth[k]?.meals||0),1);

  // Meal pay/get uses the selected month: bazar credit + meal_paid − meal cost
  const mealNet  = getPrevMonthMealBalance(member, allM, allB, curM, curY, currentUtilRec);
  // Utility balance uses the selected month: paid − prepaid/postpaid due
  const utilNet  = getUtilityBalance(member, currentUtilRec, prevUtilRec);
  const rentNet  = round2(s.rentPaid - s.rentDue);

  // Tiny formatter so all three header badges render "✓ Settled" at zero
  // (avoids awkward "Get ৳0" / "+৳0" displays).
  const fmtBal = (n, posLabel, negLabel) => n === 0
    ? { html: "✓ Settled", cls: "net-pos" }
    : n > 0
      ? { html: posLabel + " " + fmtTk(Math.abs(n)),  cls: "net-pos" }
      : { html: negLabel + " " + fmtTk(Math.abs(n)),  cls: "net-neg" };
  const mealBadge = fmtBal(mealNet, "Get", "Pay");
  const rentBadge = fmtBal(rentNet, "+",   "−");
  const utilBadge = fmtBal(utilNet, "+",   "−");

  const allMealsTotal=allM.reduce((s,r)=>s+members.reduce((a,m)=>{ const d=Number(r.meals[m.name+"_day"]??0),n=Number(r.meals[m.name+"_night"]??0); return a+(round2(d+n)||Number(r.meals[m.name]||0)); },0),0);
  const allBazarTotal=allB.reduce((s,r)=>s+Object.values(r.bazar||{}).reduce((a,v)=>a+Number(v),0),0);
  const mealShare=allMealsTotal>0?Math.round((s.totalMeals/allMealsTotal)*100):0;
  const bazarShare=allBazarTotal>0?Math.round((s.totalBazar/allBazarTotal)*100):0;

  // Per-month canonical settlement so Recent-months table can show
  // each month's Net payable (matches Monthly Log).
  const rentByKey = {}; allR.forEach(r => { rentByKey[r.month_key] = r; });
  const utilByKey = {}; allU.forEach(r => { utilByKey[r.month_key] = r; });
  const monthlyNet = {};
  allMK.forEach(k => {
    const prevK = previousMonthFromKey(k).key;
    const p = calcMemberSettlement(member, allM, allB, rentByKey[k] || null, utilByKey[k] || null, utilByKey[prevK] || null, k);
    monthlyNet[k] = p.netPayable;
  });

  // Fix 2: Recent months + What I Owe side by side
  const recentMonthsHTML =
    '<div class="card" style="padding:16px">' +
    '<div class="card-title">Recent months</div>' +
    '<div class="tbl-wrap"><table><thead><tr><th>Month</th><th>Meals</th><th>Bazar</th><th>Rent paid</th><th>Util paid</th><th>Net</th></tr></thead>' +
    '<tbody>' + allMK.slice(-6).reverse().map(k=>{
      const d=s.byMonth[k]||{};
      const net = monthlyNet[k] || 0;
      const netCell = net > 0
        ? '<b class="net-neg">Pay '+fmtTk(net)+'</b>'
        : net < 0
          ? '<b class="net-pos">Get '+fmtTk(Math.abs(net))+'</b>'
          : '<b style="color:var(--green)">✓</b>';
      return '<tr><td>'+MONTHS[parseInt(k.slice(5))-1]+' '+k.slice(0,4)+'</td><td>'+(d.meals||0)+'</td><td>'+fmtTk(d.bazar||0)+'</td><td style="color:var(--green)">'+fmtTk(d.rentPaid||0)+'</td><td style="color:var(--green)">'+fmtTk(d.utilityPaid||0)+'</td><td>'+netCell+'</td></tr>';
    }).join("") +
    '</tbody></table></div></div>';

  const whatIOweHTML = buildWhatIOweHTML(member,allM,allB,currentRentRec,currentUtilRec,prevUtilRec,curM,curY);

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
        <div style="text-align:right"><div style="font-size:11px;color:var(--text3)">Meal pay/get</div><div style="font-size:18px;font-weight:700" class="${mealBadge.cls}">${mealBadge.html}</div></div>
        <div style="text-align:right;padding-left:20px;border-left:1px solid var(--border)"><div style="font-size:11px;color:var(--text3)">Rent balance</div><div style="font-size:18px;font-weight:700" class="${rentBadge.cls}">${rentBadge.html}</div></div>
        <div style="text-align:right;padding-left:20px;border-left:1px solid var(--border)"><div style="font-size:11px;color:var(--text3)">Utility balance</div><div style="font-size:18px;font-weight:700" class="${utilBadge.cls}">${utilBadge.html}</div></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:18px">
      ${[["Total meals",s.totalMeals,null],["Active days",s.activeDays,null],["Avg/day",s.avgMeals,null],["Bazar spent",fmtTk(s.totalBazar),null],["Meal cost",fmtTk(s.mealCost),null],["Rent paid",fmtTk(s.rentPaid),"var(--green)"],["Utility paid",fmtTk(round2(s.utilityPaid)),"var(--green)"]].map(([l,v,c])=>'<div class="stat-card" style="padding:10px"><div class="stat-label">'+l+'</div><div style="font-size:15px;font-weight:600;margin-top:4px'+(c?";color:"+c:"")+'">'+v+'</div></div>').join("")}
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
