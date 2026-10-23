/* ═══════════════════════════════════════════════
   MANAGER — Profiles: member stats, profile cards, profile detail modal
   ═══════════════════════════════════════════════ */
let selectedProfileId = null;
let _profSort = "due";
async function renderProfiles(el) {
  el.innerHTML=`
  <div class="topbar">
    <div><div class="page-title">Member Profiles</div><div class="page-sub">Who owes what — tap a member for the full breakdown</div></div>
    <div class="topbar-actions">
      <select class="input" id="prof-period" onchange="refreshProfiles()" style="width:160px">
        <option value="1" selected>This month</option>
        <option value="last">Last month</option>
        <option value="3">Last 3 months</option>
        <option value="6">Last 6 months</option>
        <option value="all">All time</option>
      </select>
    </div>
  </div>
  <div class="content dk">
    <div id="prof-summary"></div>
    <div class="pc-bar">
      <div class="an-seg" id="prof-sort">
        <button class="an-seg-btn on" data-v="due" onclick="setProfileSort('due')">Owes most</button>
        <button class="an-seg-btn" data-v="name" onclick="setProfileSort('name')">A–Z</button>
        <button class="an-seg-btn" data-v="meals" onclick="setProfileSort('meals')">Most meals</button>
      </div>
    </div>
    <div class="pc-grid" id="profile-card-grid"><div class="loading"><div class="spinner"></div></div></div>
  </div>`;
  await loadProfiles();
}
function setProfileSort(v) {
  _profSort = v;
  document.querySelectorAll("#prof-sort .an-seg-btn").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  if (window._profArgs) buildProfileCards(...window._profArgs);
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
  const [allMeals,allBazar,allRent,{data:allUtil},curUtilRes,prevUtilRes,curRentRec] = await Promise.all([
    dbGetAll("meals"), dbGetAll("bazar"), dbGetAll("rent"),
    getClient().from("utility_payments").select("*").eq("mess_id",messId()),
    getClient().from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",key).maybeSingle(),
    getClient().from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",prevKey).maybeSingle(),
    dbGetMonth("rent", key),
  ]);
  window._profArgs = [allMeals,allBazar,allRent,allUtil||[],curUtilRes.data,prevUtilRes.data];
  buildProfileCards(...window._profArgs);
  if (selectedProfileId) showProfileDetail(selectedProfileId,allMeals,allBazar,allRent,allUtil||[],curRentRec,curUtilRes.data,prevUtilRes.data,curM,curY);
}
async function refreshProfiles() { await loadProfiles(); }

/* Helper: returns the period-filtered utility array for stat display (ud/up totals).
   Unlike getFilteredData, this does NOT change the utility array used for postpaid
   prev-month lookups — that always uses full allU. */
function getFilteredUtilityOnly(allU, period) {
  if (period === "all") return allU;
  if (period === "next") {
    const now = new Date(); let m = now.getMonth() + 1, y = now.getFullYear();
    if (m > 11) { m = 0; y++; }
    const key = y + "-" + String(m + 1).padStart(2, "0");
    return allU.filter(r => r.month_key === key);
  }
  if (period === "last") {
    const now = new Date(); let m = now.getMonth() - 1, y = now.getFullYear();
    if (m < 0) { m = 11; y--; }
    const key = y + "-" + String(m + 1).padStart(2, "0");
    return allU.filter(r => r.month_key === key);
  }
  const months = parseInt(period), now = new Date();
  let cm = now.getMonth() - months + 1, cy = now.getFullYear();
  while (cm < 0) { cm += 12; cy--; }
  const cut = cy + "-" + String(cm + 1).padStart(2, "0");
  return allU.filter(r => r.month_key >= cut);
}

function getFilteredData(allM,allB,allR,period,allU=[]) {
  // NOTE: utility is ALWAYS returned unfiltered so getMemberStats can look up
  // the previous month's postpaid bills (Khala+Other) via utilByKey.
  // Filtering utility to a single month would break the postpaid calculation.
  if (period==="all") return {meals:allM,bazar:allB,rent:allR,utility:allU};
  if (period==="next") {
    const now=new Date(); let m=now.getMonth()+1,y=now.getFullYear();
    if(m>11){m=0;y++;}
    const key=y+"-"+String(m+1).padStart(2,"0");
    return { meals:allM.filter(r=>r.date.slice(0,7)===key), bazar:allB.filter(r=>r.date.slice(0,7)===key), rent:allR.filter(r=>r.month_key===key), utility:allU };
  }
  if (period==="last") {
    const now=new Date(); let m=now.getMonth()-1,y=now.getFullYear();
    if(m<0){m=11;y--;}
    const key=y+"-"+String(m+1).padStart(2,"0");
    return { meals:allM.filter(r=>r.date.slice(0,7)===key), bazar:allB.filter(r=>r.date.slice(0,7)===key), rent:allR.filter(r=>r.month_key===key), utility:allU };
  }
  const months=parseInt(period), now=new Date();
  let cm=now.getMonth()-months+1, cy=now.getFullYear();
  while(cm<0){cm+=12;cy--;}
  const cut=cy+"-"+String(cm+1).padStart(2,"0");
  return { meals:allM.filter(r=>r.date.slice(0,7)>=cut), bazar:allB.filter(r=>r.date.slice(0,7)>=cut), rent:allR.filter(r=>r.month_key>=cut), utility:allU };
}

function getMemberStats(member,meals,bazar,rent,utility=[],filteredUtility=null) {
  let tm=0,tb=0,rd=0,rp=0,ud=0,up=0,ad=0;
  const byM={};
  const em=k=>{ byM[k]=byM[k]||{meals:0,bazar:0,rentPaid:0,utilityPaid:0}; };
  meals.forEach(r=>{
    const v=mealMemberTotal(r.meals||{}, member.name);
    tm+=v; if(v>0) ad++;
    const k=r.date.slice(0,7); em(k); byM[k].meals+=v;
  });
  bazar.forEach(r=>{ const v=Number(r.bazar[member.name]||0); tb+=v; const k=r.date.slice(0,7); em(k); byM[k].bazar+=v; });
  rent.forEach(r=>{ const e=r.entries?.find(x=>x.name===member.name); if(e){ rd+=Number(e.rent||0); rp+=Number(e.paid||0); em(r.month_key); byM[r.month_key].rentPaid+=Number(e.paid||0); } });
  // utility = full allU (for postpaid prev-month lookup)
  // filteredUtility = period-scoped subset (for ud/up stat totals)
  // If filteredUtility not provided, fall back to utility (all-time view)
  const utilForStats = filteredUtility !== null ? filteredUtility : utility;
  const utilByKey = {};
  utility.forEach(r => { utilByKey[r.month_key] = r; });
  // ud/up: only sum within the filtered period so the stat card is accurate
  utilForStats.forEach(r => {
    const prevKey  = previousMonthFromKey(r.month_key).key;
    const prepaid  = utilTotalFromBills(r.bills || {},                     UTIL_PREPAID_KEYS);
    const postpaid = utilTotalFromBills(utilByKey[prevKey]?.bills || {},   UTIL_POSTPAID_KEYS);
    const perHead  = members.length>0 ? round2((prepaid + postpaid) / members.length) : 0;
    const p        = (r.payments || {})[member.name] || {};
    ud += perHead; up += Number(p.paid || 0);
    em(r.month_key); byM[r.month_key].utilityPaid += Number(p.paid || 0);
  });
  const allMealsTotal=meals.reduce((s,r)=>{
    const mObj=r.meals||{}; const keys=Object.keys(mObj);
    const hasSplit=keys.some(k=>k.endsWith("_day")||k.endsWith("_night"));
    if(hasSplit) return s+keys.reduce((a,k)=>(k.endsWith("_day")||k.endsWith("_night"))?a+(Number(mObj[k])||0):a,0);
    return s+Object.values(mObj).reduce((a,v)=>a+(Number(v)||0),0);
  },0);
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
  curY,
  prevDue = 0
) {
  const { month: tm, year: ty } = thisMonth();
  const month = curM !== undefined ? curM : tm;
  const year  = curY !== undefined ? curY : ty;
  const currentKey = monthKey(year, month);
  const prevMonth  = month === 0 ? 11 : month - 1;
  const prevYear   = month === 0 ? year - 1 : year;
  const prevLabel  = `${MONTHS[prevMonth]} ${prevYear}`;
  const curLabel   = `${MONTHS[month]} ${year}`;

  // ── Use the canonical settlement calc (single source of truth, same as Monthly Log) ──
  const p = calcMemberSettlement(
    member, allMeals, allBazar,
    currentRentRec, currentUtilRec, prevUtilRec,
    currentKey
  );

  const {
    mealCost, memberBazar, mealRate, memberMeals,
    totalMeals: allMealsTotal, totalBazar: allBazarTotal,
    khalaShare, otherShare, khalaTotal, otherTotal,
    prepaidUtility: prepaidShare, prepaidTotal,
    roomRent: myRentDue, roomRentPaid: myRentPaid,
    utilityPaid: myUtilActualPaid, mealPaid: myMealPaid,
    utilityStatus, rentStatus,
    messCredit,
    netPayable,
  } = p;

  const netWithPrevDue = round2(netPayable + prevDue);

  const currentBills  = currentUtilRec?.bills || {};
  const elecAmt = Number(currentBills.elec || 0);
  const gasAmt  = Number(currentBills.gas  || 0);
  const wifiAmt = Number(currentBills.wifi || 0);

  const totalUtilDue     = round2(prepaidShare + khalaShare + otherShare);
  const utilFullyPaid    = utilityStatus === "paid";
  const utilPartiallyPaid= utilityStatus === "partial";
  const utilStatusLabel  = utilFullyPaid ? "✅ Paid" : utilPartiallyPaid ? "⚠️ Partial" : "⏳ Not paid yet";
  const utilStatusColor  = utilFullyPaid ? "var(--green)" : utilPartiallyPaid ? "var(--amber)" : "var(--text)";

  const totalBeforeCredit = round2(mealCost + khalaShare + otherShare + myRentDue + prepaidShare);

  // Carry-forward credit breakdown (for tooltip)
  const rawMessCredit   = Number((currentBills.mess_credit   || {})[member.name] || 0);
  const rawChangeCredit = Number((currentBills.change_credit || {})[member.name] || 0);

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
            ${round2(memberMeals)} meals × ${fmtTk(mealRate)}
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
            ${fmtTk(Number(khalaTotal))} ÷ ${members.length} members
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
            ${fmtTk(Number(otherTotal))} ÷ ${members.length} members
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
            ${rentStatus === "paid" ? "✅ Paid" : rentStatus === "partial" ? "⚠️ Partial" : "⏳ Not paid yet"}
          </span>
        </span>
        <span class="my-stat-val" style="color:${rentStatus === "paid" ? "var(--green)" : "var(--text)"}">
          ${fmtTk(myRentDue)} ${rentStatus === "paid" ? "✓" : ""}
        </span>
      </div>

      <div class="my-stat-row">
        <span class="my-stat-key">
          ⚡ Utility share (Elec+Gas+WiFi)
          <span style="font-size:10px;color:var(--text3);display:block">
            ${fmtTk(prepaidTotal)} ÷ ${members.length} members
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
          <div style="display:flex;justify-content:space-between;gap:8px">
            <span style="color:var(--text2);flex:1;min-width:0">Total utility due (Elec+Gas+WiFi+Khala+Other)</span>
            <span style="font-weight:600;flex-shrink:0;white-space:nowrap">${fmtTk(totalUtilDue)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:8px;margin-top:3px">
            <span style="color:var(--green);flex:1">Paid</span>
            <span style="font-weight:700;color:var(--green);flex-shrink:0;white-space:nowrap">${fmtTk(myUtilActualPaid)}</span>
          </div>
          ${myUtilActualPaid < totalUtilDue ? `
          <div style="display:flex;justify-content:space-between;gap:8px;margin-top:3px">
            <span style="color:var(--red);flex:1">Remaining</span>
            <span style="font-weight:700;color:var(--red);flex-shrink:0;white-space:nowrap">${fmtTk(round2(totalUtilDue - myUtilActualPaid))}</span>
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
          <span class="my-stat-val" style="color:var(--green)">${fmtTk(memberBazar)}</span>
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

        ${messCredit > 0
          ? `<div class="my-stat-row" style="background:rgba(52,152,219,.07);border:1px solid rgba(52,152,219,.25);border-radius:6px;padding:8px 10px;margin-top:4px">
              <span class="my-stat-key" style="color:var(--blue)">
                ↩ Carry-forward credit
                <span style="font-size:10px;color:var(--text3);display:block">Applied from last month's overpayment or Mess Owes balance</span>
                ${rawMessCredit > 0   ? `<span style="font-size:10px;color:var(--text3);display:block">Overpayment credit: ${fmtTk(rawMessCredit)}</span>` : ""}
                ${rawChangeCredit > 0 ? `<span style="font-size:10px;color:var(--text3);display:block">Change/Mess Owes credit: ${fmtTk(rawChangeCredit)}</span>` : ""}
              </span>
              <span class="my-stat-val" style="color:var(--blue);font-weight:800">− ${fmtTk(messCredit)}</span>
            </div>`
          : `<div style="font-size:11px;color:var(--text3);padding:6px 0;margin-top:2px">
              ↩ No carry-forward credit this month
            </div>`
        }

        ${prevDue > 0
          ? `<div class="my-stat-row" style="background:var(--red-bg);border:1px solid rgba(224,82,82,.25);border-radius:6px;padding:8px 10px;margin-top:4px">
              <span class="my-stat-key" style="color:var(--red)">
                ⚠️ Previous due
                <span style="font-size:10px;color:var(--text3);display:block">Unpaid balance carried forward from before ${prevLabel}</span>
              </span>
              <span class="my-stat-val" style="color:var(--red);font-weight:800">+ ${fmtTk(prevDue)}</span>
            </div>`
          : ""
        }

        <div class="my-stat-row" style="font-size:15px;border-top:1px solid var(--border);margin-top:4px;background:var(--accent-bg);border-radius:6px;padding:10px;margin-top:8px;border-bottom:none">
          <span style="font-weight:700;flex:1">Net payable</span>
          <span style="font-weight:800;flex-shrink:0;white-space:nowrap;color:${netWithPrevDue > 0 ? "var(--red)" : netWithPrevDue < 0 ? "var(--green)" : "var(--text)"}">
            ${netWithPrevDue > 0 ? "Pay " + fmtTk(netWithPrevDue) : netWithPrevDue < 0 ? "Get " + fmtTk(Math.abs(netWithPrevDue)) : "✓ Settled"}
          </span>
        </div>

        <div style="font-size:11px;color:var(--text3);margin-top:8px;line-height:1.6;background:var(--bg3);padding:8px 12px;border-radius:6px">
          <b>Formula:</b> ${fmtTk(mealCost)} + ${fmtTk(khalaShare)} + ${fmtTk(otherShare)} + ${fmtTk(myRentDue)} + ${fmtTk(prepaidShare)} − ${fmtTk(memberBazar)} − ${fmtTk(myMealPaid)} − ${fmtTk(myRentPaid)} − ${fmtTk(myUtilActualPaid)}${messCredit > 0 ? ` − ${fmtTk(messCredit)} (carried fwd)` : ""}${prevDue > 0 ? ` + ${fmtTk(prevDue)} (prev due)` : ""} = <b>${fmtTk(netWithPrevDue)}</b>
        </div>
      </div>
    </div>
  `;
}


function buildProfileCards(allM,allB,allR,allU,curUtilRec,prevUtilRec) {
  const period=document.getElementById("prof-period")?.value||"1";
  const {meals,bazar,rent,utility}=getFilteredData(allM,allB,allR,period,allU);
  // filteredUtility: period-scoped subset for stat totals (ud/up in getMemberStats)
  // utility (full allU) stays for postpaid prev-month lookup
  const filteredUtility = getFilteredUtilityOnly(allU, period);
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

  const rows = members.map((m, i) => {
    const st  = getMemberStats(m, meals, bazar, rent, utility, filteredUtility);
    const p   = calcMemberSettlement(m, allM, allB, currentRentRec, curUtilRec, prevUtilRec, settlementKey);
    p.prevDue = calcPrevDueForMember(m, allM, allB, allR, allU, settlementKey);
    p.netWithPrevDue = round2(p.netPayable + p.prevDue);
    return { m, i, s: st, p };
  });
  const sorters = {
    due:   (a, b) => b.p.netWithPrevDue - a.p.netWithPrevDue,
    name:  (a, b) => String(a.m.name).localeCompare(String(b.m.name)),
    meals: (a, b) => b.s.totalMeals - a.s.totalMeals,
  };
  rows.sort(sorters[_profSort] || sorters.due);

  // Summary tiles
  const owing = rows.filter(r => r.p.netWithPrevDue > 0.01);
  const owed  = rows.filter(r => r.p.netWithPrevDue < -0.01);
  const outstanding = round2(owing.reduce((t, r) => t + r.p.netWithPrevDue, 0));
  const carried = round2(rows.reduce((t, r) => t + (r.p.prevDue || 0), 0));
  const sum = document.getElementById("prof-summary");
  const tile = (icon, label, value, sub, color) => `<div class="pf-tile"><div class="dk-head"><span class="dk-ico">${icon}</span><span class="dk-label">${label}</span></div>
    <div class="stat-value pf-val" ${color ? `style="color:${color}"` : ""}>${value}</div><div class="dk-sub">${sub}</div></div>`;
  if (sum) sum.innerHTML = `<div class="pf-tiles">
    ${tile("📌", "Outstanding", fmtTk(outstanding), `${owing.length} of ${rows.length} members owe · ${monthLabelFromKey(settlementKey)}`, outstanding > 0 ? "var(--red)" : "var(--green)")}
    ${tile("⏪", "From earlier months", fmtTk(carried), carried > 0 ? "unpaid dues carried forward" : "nothing carried forward", carried > 0 ? "var(--red)" : null)}
    ${tile("✅", "Settled", rows.length - owing.length - owed.length, "members with nothing to pay", "var(--green)")}
    ${tile("💚", "Mess owes", owed.length, owed.length ? fmtTk(round2(Math.abs(owed.reduce((t, r) => t + r.p.netWithPrevDue, 0)))) + " to return" : "nobody to pay back", owed.length ? "var(--green)" : null)}
  </div>`;
  const maxMeals = Math.max(1, ...rows.map(r => r.s.totalMeals));
  const periodLabel = isSinglePeriod ? monthLabelFromKey(settlementKey) : (period === "all" ? "All time" : "Last " + period + " months");

  grid.innerHTML = rows.map(({ m, i, s: st, p }) => {
    const col = avatarCol(i), net = p.netWithPrevDue;
    const pays = net > 0.01, gets = net < -0.01;
    const chip = (label, status) => {
      const st2 = status || "unpaid";
      return `<span class="pc-chip ${st2 === "paid" ? "ok" : st2 === "partial" ? "mid" : "bad"}">${label} ${st2 === "paid" ? "✓" : st2 === "partial" ? "partial" : "due"}</span>`;
    };
    return `<button class="pc-card ${pays ? "pc-pay" : gets ? "pc-get" : "pc-ok"}" onclick="selectProfile('${m.id}')">
      <div class="pc-head">
        <span class="avatar pc-av" style="background:${col.bg};color:${col.fg}">${avFace(m.id, m.name)}</span>
        <div class="pc-who"><div class="pc-name">${m.name}</div><div class="pc-meta">${m.room ? "Room " + m.room + " · " : ""}${m.role === "manager" ? "👑 Manager" : m.role === "sub_manager" ? "⚡ Sub-manager" : "Member"}</div></div>
        <span class="pc-go">›</span>
      </div>
      <div class="pc-net">
        <span class="pc-net-lbl">${pays ? "To pay" : gets ? "Mess owes" : "Balance"}</span>
        <span class="pc-net-amt">${pays || gets ? fmtTk(Math.abs(net)) : "✓ Settled"}</span>
      </div>
      ${p.prevDue > 0 ? `<div class="pc-warn">incl. ${fmtTk(p.prevDue)} from earlier months</div>` : ""}
      <div class="pc-chips">${chip("Rent", p.rentStatus)}${chip("Utility", p.utilityStatus)}</div>
      <div class="pc-stats">
        <div><b>${st.totalMeals}</b><span>meals</span></div>
        <div><b>${st.avgMeals}</b><span>per day</span></div>
        <div><b>${fmtTk(st.totalBazar)}</b><span>bazar</span></div>
      </div>
      <div class="dk-bar pc-bar-meals" title="${st.totalMeals} meals · ${periodLabel}"><i style="width:${Math.round((st.totalMeals / maxMeals) * 100)}%;background:${col.fg}"></i></div>
    </button>`;
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
    getClient().from("utility_payments").select("*").eq("mess_id",messId()),
    dbGetMonth("rent", key),
    getClient().from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",key).maybeSingle(),
    getClient().from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",prevKey).maybeSingle(),
  ]);
  showProfileDetail(id,allM,allB,allR,allU||[],rentRes,curUtilRes.data,prevUtilRes.data,curM,curY);
}

/* Net payable for one settlement month, including dues carried from earlier months. */
function monthlyNetFor(member, allM, allB, allR, allU, key) {
  const rentRec = allR.find(r => r.month_key === key) || null;
  const utilRec = allU.find(r => r.month_key === key) || null;
  const prevRec = allU.find(r => r.month_key === previousMonthFromKey(key).key) || null;
  const p = calcMemberSettlement(member, allM, allB, rentRec, utilRec, prevRec, key);
  return round2(p.netPayable + calcPrevDueForMember(member, allM, allB, allR, allU, key));
}

function showProfileDetail(id,allM,allB,allR,allU,currentRentRec,currentUtilRec,prevUtilRec,curM,curY) {
  const member=members.find(m=>m.id===id); if(!member) return;
  selectedProfileId = id;
  const period=document.getElementById("prof-period")?.value||"1";
  const {meals,bazar,rent,utility}=getFilteredData(allM,allB,allR,period,allU);
  // filteredUtility: period-scoped subset for stat totals (ud/up in getMemberStats)
  // utility (full allU) stays for postpaid prev-month lookup
  const filteredUtility = getFilteredUtilityOnly(allU, period);
  const s=getMemberStats(member,meals,bazar,rent,utility,filteredUtility);
  const col=avatarCol(members.indexOf(member));

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

  const allMealsTotal = meals.reduce((t, r) => t + mealRowTotal(r.meals || {}), 0);
  const allBazarTotal = bazar.reduce((t, r) => t + Object.values(r.bazar || {}).reduce((a, v) => a + Number(v || 0), 0), 0);
  const mealShare=allMealsTotal>0?Math.round((s.totalMeals/allMealsTotal)*100):0;
  const bazarShare=allBazarTotal>0?Math.round((s.totalBazar/allBazarTotal)*100):0;

  // Outstanding balance from ALL past unpaid settlements, for the
  // currently-selected settlement month — feeds the What I Owe panel below.
  const currentKeyForOwe = monthKey(curY || thisMonth().year, curM !== undefined ? curM : thisMonth().month);
  const prevDueForOwe = calcPrevDueForMember(member, allM, allB, allR, allU, currentKeyForOwe);

  const whatIOweHTML = buildWhatIOweHTML(member,allM,allB,currentRentRec,currentUtilRec,prevUtilRec,curM,curY,prevDueForOwe);

  const isMultiMonth = (period !== "1" && period !== "last");
  const settlKey2 = monthKey(curM || thisMonth().month, curY || thisMonth().year);
  const multiMonthBanner = isMultiMonth ? `
    <div style="background:var(--accent-bg);border:1px solid rgba(212,168,83,.25);border-radius:var(--radius-sm);padding:9px 13px;margin-bottom:14px;font-size:12px;color:var(--accent);display:flex;align-items:center;gap:8px">
      ℹ️ <span>Stats cover <b>${period === "all" ? "all time" : "last " + period + " months"}</b>. 
      Net payable and "What I Owe" are always pinned to the <b>latest settlement month (${monthLabelFromKey(settlKey2)})</b>.</span>
    </div>` : "";
  // History always spans every month (not just the selected period)
  const allTime = getMemberStats(member, allM, allB, allR, allU, null);
  const histKeys = Object.keys(allTime.byMonth).sort().slice(-8);
  const histMax = Math.max(1, ...histKeys.map(k => allTime.byMonth[k]?.meals || 0));
  const net = round2(monthlyNetFor(member, allM, allB, allR, allU, currentKeyForOwe));
  const pays = net > 0.01, gets = net < -0.01;
  const chipB = (label, b) => `<span class="pf-chip ${b.cls === "net-neg" ? "bad" : "ok"}"><span>${label}</span><b>${b.html}</b></span>`;
  const tile = (icon, label, value, sub, bar) => `<div class="pf-tile"><div class="dk-head"><span class="dk-ico">${icon}</span><span class="dk-label">${label}</span></div>
    <div class="stat-value pf-val">${value}</div><div class="dk-sub">${sub}</div>${bar != null ? `<div class="dk-bar pf-share"><i style="width:${bar}%"></i></div>` : ""}</div>`;
  const recentRows = Object.keys(allTime.byMonth).sort().slice(-6).reverse().map(k => {
    const d = allTime.byMonth[k] || {}, n = monthlyNetFor(member, allM, allB, allR, allU, k);
    const cell = n > 0.01 ? `<b class="net-neg">Pay ${fmtTk(n)}</b>` : n < -0.01 ? `<b class="net-pos">Get ${fmtTk(Math.abs(n))}</b>` : `<b class="net-pos">✓</b>`;
    return `<tr><td style="white-space:nowrap"><b>${MONTHS[parseInt(k.slice(5)) - 1].slice(0, 3)} ${k.slice(0, 4)}</b></td><td>${round2(d.meals || 0)}</td><td>${fmtTk(d.bazar || 0)}</td><td style="color:var(--green)">${fmtTk(round2((d.rentPaid || 0) + (d.utilityPaid || 0)))}</td><td style="text-align:right">${cell}</td></tr>`;
  }).join("");

  document.getElementById("modal-content").innerHTML=`
    ${multiMonthBanner}
    <div class="pf-head pd-head ${pays ? "mb-pay" : gets ? "mb-get" : ""}">
      <div class="pf-id">
        <div class="avatar pf-av" style="background:${col.bg};color:${col.fg}">${avFace(member.id, member.name)}</div>
        <div class="pf-who">
          <div class="pf-name">${member.name}</div>
          <div class="pf-meta">Room ${member.room || "—"} · @${member.username || "—"} · joined ${member.joined || "—"}${member.phone ? " · " + member.phone : ""}</div>
          <div class="pf-chips">${chipB("Meals", mealBadge)}${chipB("Rent", rentBadge)}${chipB("Utility", utilBadge)}</div>
        </div>
      </div>
      <div class="pf-net">
        <div class="mb-hero-lbl">Net payable · ${monthLabelFromKey(currentKeyForOwe)}</div>
        <div class="pf-net-amt" style="color:${pays ? "var(--red)" : "var(--green)"}">${pays ? "Pays " : gets ? "Gets " : "✓ Settled"}${pays || gets ? fmtTk(Math.abs(net)) : ""}</div>
        <div class="pf-net-btns">
          ${pays ? `<button class="btn btn-primary btn-sm" onclick="closeModal();navigate('collect')">💵 Collect</button>` : ""}
          <button class="btn btn-ghost btn-sm" onclick="closeModal()">Close</button>
        </div>
      </div>
    </div>

    <div class="pf-tiles">
      ${tile("🍽️", "Meals", s.totalMeals, `${s.activeDays} days · ${s.avgMeals}/day`, null)}
      ${tile("🧾", "Meal cost", fmtTk(s.mealCost), `${mealShare}% of mess meals`, mealShare)}
      ${tile("🛒", "Bazar spent", fmtTk(s.totalBazar), `${bazarShare}% of mess bazar`, bazarShare)}
      ${tile("✅", "Paid", fmtTk(round2(s.rentPaid + s.utilityPaid)), `rent ${fmtTk(s.rentPaid)} · utility ${fmtTk(round2(s.utilityPaid))}`, null)}
    </div>

    <div class="pf-grid">
      <div class="pf-col">
        <div class="card">
          <div class="dk-card-title"><span>Meals per month</span><span class="dk-legend">last ${histKeys.length} month${histKeys.length === 1 ? "" : "s"}</span></div>
          ${histKeys.length ? `<div class="an-wd pf-hist" style="grid-template-columns:repeat(${histKeys.length},minmax(0,1fr))">
            ${histKeys.map(k => { const v = round2(allTime.byMonth[k]?.meals || 0);
              return `<div class="an-wd-col${k === currentKeyForOwe ? " top" : ""}" title="${monthLabelFromKey(k)}: ${v} meals"><b>${v}</b><div class="an-wd-bar"><i style="height:${Math.max(3, Math.round((v / histMax) * 100))}%"></i></div><span>${MONTHS[parseInt(k.slice(5)) - 1].slice(0, 3)}</span></div>`; }).join("")}
          </div>` : `<div class="empty">No history yet</div>`}
        </div>
        <div class="card">
          <div class="dk-card-title"><span>Recent months</span></div>
          <div class="tbl-wrap"><table><thead><tr><th>Month</th><th>Meals</th><th>Bazar</th><th>Paid</th><th style="text-align:right">Net</th></tr></thead>
          <tbody>${recentRows || `<tr><td colspan="5" class="empty">No data</td></tr>`}</tbody></table></div>
        </div>
      </div>
      <div class="pf-col">${whatIOweHTML}</div>
    </div>`;
  document.querySelector(".modal").classList.add("modal-wide");
  openModal();
}