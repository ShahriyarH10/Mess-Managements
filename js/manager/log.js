/* ═══════════════════════════════════════════════
   MANAGER — Log: room rent + monthly settlement log
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   MONTHLY LOG
═══════════════════════════════════════════ */
function renderLog(el) {
  const n=new Date();
  el.innerHTML=`<div class="topbar"><div><div class="page-title">Monthly Log</div><div class="page-sub">Full settlement report</div></div></div>
  <div class="content">
    <div class="month-sel"><label>Month</label><select class="input" id="log-month" style="width:180px">${MONTHS.map((m,i)=>`<option value="${i}"${i===n.getMonth()?" selected":""}>${m}</option>`).join("")}</select><label>Year</label><select class="input" id="log-year" style="width:90px">${Array.from({length:5},(_,i)=>2023+i).map(y=>`<option${y===n.getFullYear()?" selected":""}>${y}</option>`).join("")}</select><button class="btn btn-primary" onclick="loadLog()">Generate</button></div>
    <div id="log-content"><div class="empty">Select a month and click Generate</div></div>
  </div>`;
}

async function loadLog() {
  const month=parseInt(document.getElementById("log-month").value);
  const year=parseInt(document.getElementById("log-year").value);
  const key=monthKey(year,month);
  const prevMonth=month===0?11:month-1;
  const prevYear=month===0?year-1:year;
  const prevKey=monthKey(prevYear,prevMonth);

  const [allMeals,allBazar,currentRentRec,currentUtilRes,prevUtilRes]=await Promise.all([
    dbGetAll("meals"), dbGetAll("bazar"),
    dbGetMonth("rent",key),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",key).maybeSingle(),
    sb.from("utility_payments").select("*").eq("mess_id",messId()).eq("month_key",prevKey).maybeSingle(),
  ]);
  const currentUtilRec=currentUtilRes.data;
  const prevUtilRec=prevUtilRes.data;

  const getMT=(mObj,n)=>{ if(mObj[n+"_day"]!=null||mObj[n+"_night"]!=null) return round2(Number(mObj[n+"_day"]||0)+Number(mObj[n+"_night"]||0)); return Number(mObj[n]||0); };

  // POSTPAID: Meals & Bazar from PREVIOUS month
  const prevMealRows=allMeals.filter(r=>r.date.startsWith(prevKey)).sort((a,b)=>a.date.localeCompare(b.date));
  const prevBazarRows=allBazar.filter(r=>r.date.startsWith(prevKey)).sort((a,b)=>a.date.localeCompare(b.date));
  let totalMeals=0, totalBazar=0;
  const memMeals={}, memBazar={};
  members.forEach(m=>{ memMeals[m.name]=0; memBazar[m.name]=0; });
  prevMealRows.forEach(r=>{ members.forEach(m=>{ const t=getMT(r.meals,m.name); memMeals[m.name]+=t; totalMeals+=t; }); });
  prevBazarRows.forEach(r=>{ Object.entries(r.bazar||{}).forEach(([n,v])=>{ memBazar[n]=(memBazar[n]||0)+Number(v); totalBazar+=Number(v); }); });
  members.forEach(m=>memMeals[m.name]=round2(memMeals[m.name]));
  const mealRate=totalMeals>0?round2(totalBazar/totalMeals):0;

  // POSTPAID bills: Khala + Other from PREVIOUS month
  const prevBills=prevUtilRec?.bills||{};
  const khalaTotal=Number(prevBills.khala||0);
  const otherPostpaid=Number(prevBills.other||0);
  const khalaPerHead=members.length>0?round2(khalaTotal/members.length):0;
  const otherPerHead=members.length>0?round2(otherPostpaid/members.length):0;
  const totalPostpaid=khalaTotal+otherPostpaid;

  // PREPAID bills: Elec + WiFi + Gas from CURRENT month
  const currentBills=currentUtilRec?.bills||{};
  const totalPrepaid=["elec","wifi","gas"].reduce((s,k)=>s+(Number(currentBills[k])||0),0);
  const prepaidPerHead=members.length>0?round2(totalPrepaid/members.length):0;
  const utilPayments=currentUtilRec?.payments||{};

  const payData=members.map(m=>{
    const meals=memMeals[m.name]||0;
    const bazar=memBazar[m.name]||0;
    const mealCost=round2(meals*mealRate);
    // Rent from current month's rent record
    const rentEntry=currentRentRec?.entries?.find(e=>e.name===m.name)||{};
    const rent=Number(rentEntry.rent||0);
    const utilActualPaid=Number((utilPayments[m.name]?.paid)||0);
    const postpaid=round2(mealCost+khalaPerHead+otherPerHead);
    const prepaid=round2(rent+prepaidPerHead);
    const totalOwed=round2(postpaid+prepaid);
    const net=round2(totalOwed-bazar-utilActualPaid);
    return { name:m.name, meals, bazar, mealCost, khala:khalaPerHead, other:otherPerHead, utility:prepaidPerHead, utilPaid:utilActualPaid, rent, postpaid, prepaid, totalOwed, net };
  });

  document.getElementById("log-content").innerHTML=`
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 16px;margin-bottom:14px;font-size:13px;color:var(--text2);display:flex;gap:10px;align-items:flex-start">
      <span style="font-size:16px">ℹ️</span>
      <div><b>How this settlement works:</b><br>
        🔴 <b>Postpaid</b> — Meal cost, Khala & Other are from <b>${MONTHS[prevMonth]} ${prevYear}</b> (previous month, settled now)<br>
        🔵 <b>Prepaid</b> — Electricity, WiFi, Gas & Rent are from <b>${MONTHS[month]} ${year}</b> (current month, paid upfront)
      </div>
    </div>
    <div class="stat-grid" style="margin-bottom:14px">
      <div class="stat-card"><div class="stat-label">Meals (${MONTHS[prevMonth].slice(0,3)})</div><div class="stat-value">${round2(totalMeals)}</div></div>
      <div class="stat-card"><div class="stat-label">Meal rate</div><div class="stat-value" style="font-size:17px">${fmtTk(mealRate)}</div></div>
      <div class="stat-card"><div class="stat-label">Total bazar (${MONTHS[prevMonth].slice(0,3)})</div><div class="stat-value" style="font-size:17px">${fmtTk(totalBazar)}</div></div>
      <div class="stat-card"><div class="stat-label">🔵 Prepaid bills</div><div class="stat-value" style="font-size:17px;color:var(--blue)">${fmtTk(totalPrepaid)}</div></div>
      <div class="stat-card"><div class="stat-label">🔴 Khala+Other (${MONTHS[prevMonth].slice(0,3)})</div><div class="stat-value" style="font-size:17px;color:var(--red)">${fmtTk(totalPostpaid)}</div></div>
      <div class="stat-card"><div class="stat-label">Prepaid per head</div><div class="stat-value" style="font-size:17px">${fmtTk(prepaidPerHead)}</div></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;font-size:12px">
      <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:var(--red);display:inline-block"></span>Postpaid — from ${MONTHS[prevMonth]} ${prevYear} (meals, khala, other)</span>
      <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:var(--blue);display:inline-block"></span>Prepaid — for ${MONTHS[month]} ${year} (electricity, WiFi, gas, rent)</span>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">Settlement — ${MONTHS[month]} ${year}</div>
      <div class="tbl-wrap"><table>
        <thead>
          <tr>
            <th rowspan="2">Member</th>
            <th rowspan="2">Meals<br><span style="font-size:10px;font-weight:400;color:var(--text3)">${MONTHS[prevMonth].slice(0,3)}</span></th>
            <th colspan="3" style="text-align:center;color:var(--red);border-bottom:1px solid var(--border)">🔴 Postpaid (${MONTHS[prevMonth].slice(0,3)})</th>
            <th colspan="3" style="text-align:center;color:var(--blue);border-bottom:1px solid var(--border)">🔵 Prepaid (${MONTHS[month].slice(0,3)})</th>
            <th rowspan="2">Bazar credit<br><span style="font-size:10px;font-weight:400;color:var(--text3)">${MONTHS[prevMonth].slice(0,3)}</span></th>
            <th rowspan="2">Net</th>
          </tr>
          <tr>
            <th style="color:var(--red)">Meal cost</th><th style="color:var(--red)">Khala</th><th style="color:var(--red)">Other</th>
            <th style="color:var(--blue)">Util share</th><th style="color:var(--blue)">Util paid</th><th style="color:var(--blue)">Rent</th>
          </tr>
        </thead>
        <tbody>
          ${payData.map(p=>{
            const nc=p.net>0?"net-neg":p.net<0?"net-pos":"";
            const nl=p.net>0?`Pay ${fmtTk(p.net)}`:p.net<0?`Get ${fmtTk(-p.net)}`:"Settled";
            const utilPaidColor=p.utilPaid>=p.utility&&p.utilPaid>0?"var(--green)":p.utilPaid>0?"var(--amber)":"var(--text2)";
            return`<tr>
              <td><b>${p.name}</b></td><td>${p.meals}</td>
              <td style="color:var(--red)">${fmtTk(p.mealCost)}</td>
              <td style="color:var(--red)">${fmtTk(p.khala)}</td>
              <td style="color:var(--red)">${fmtTk(p.other)}</td>
              <td style="color:var(--blue)">${fmtTk(p.utility)}</td>
              <td style="color:${utilPaidColor};font-weight:500">${fmtTk(p.utilPaid)}
                ${p.utilPaid>=p.utility&&p.utilPaid>0?`<span class="badge badge-green" style="font-size:9px;margin-left:3px">paid</span>`:p.utilPaid>0?`<span class="badge badge-amber" style="font-size:9px;margin-left:3px">partial</span>`:""}
              </td>
              <td style="color:var(--blue)">${fmtTk(p.rent)}</td>
              <td style="color:var(--green)">${fmtTk(p.bazar)}</td>
              <td class="${nc}"><b>${nl}</b></td>
            </tr>`;
          }).join("")}
        </tbody>
        <tfoot>
          <tr>
            <td><b>Total</b></td><td>${round2(totalMeals)}</td>
            <td style="color:var(--red)">${fmtTk(round2(payData.reduce((s,p)=>s+p.mealCost,0)))}</td>
            <td style="color:var(--red)">${fmtTk(khalaTotal)}</td>
            <td style="color:var(--red)">${fmtTk(otherPostpaid)}</td>
            <td style="color:var(--blue)">${fmtTk(totalPrepaid)}</td>
            <td style="color:var(--blue)">${fmtTk(round2(payData.reduce((s,p)=>s+p.utilPaid,0)))}</td>
            <td style="color:var(--blue)">${fmtTk(round2(payData.reduce((s,p)=>s+p.rent,0)))}</td>
            <td style="color:var(--green)">${fmtTk(totalBazar)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table></div>
    </div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:8px;font-weight:500">📋 Meal & Bazar data below is from <b>${MONTHS[prevMonth]} ${prevYear}</b> — the postpaid source for this settlement</div>
    <div class="grid-2" style="gap:12px">
      <div class="card">
        <div class="card-title">Meal log — ${MONTHS[prevMonth]} ${prevYear}</div>
        <div class="scroll-table tbl-wrap"><table>
          <thead><tr><th>Date</th>${members.map(m=>`<th>${m.name}</th>`).join("")}<th>Total</th></tr></thead>
          <tbody>${prevMealRows.map(r=>{ let t=0; const cells=members.map(m=>{ const mv=getMT(r.meals,m.name); t+=mv; return`<td>${mv}</td>`; }).join(""); return`<tr><td>${r.date.slice(8)}</td>${cells}<td><b>${round2(t)}</b></td></tr>`; }).join("")}</tbody>
          <tfoot><tr><td>Total</td>${members.map(m=>`<td>${memMeals[m.name]||0}</td>`).join("")}<td>${round2(totalMeals)}</td></tr></tfoot>
        </table></div>
      </div>
      <div class="card">
        <div class="card-title">Bazar log — ${MONTHS[prevMonth]} ${prevYear}</div>
        <div class="scroll-table tbl-wrap"><table>
          <thead><tr><th>Date</th>${members.map(m=>`<th>${m.name}</th>`).join("")}<th>Total</th></tr></thead>
          <tbody>${prevBazarRows.map(r=>{ const bt=Object.values(r.bazar||{}).reduce((s,v)=>s+Number(v),0); return`<tr><td>${r.date.slice(8)}</td>${members.map(m=>`<td>${r.bazar[m.name]!=null?fmtTk(r.bazar[m.name]):"0"}</td>`).join("")}<td><b>${fmtTk(bt)}</b></td></tr>`; }).join("")}</tbody>
          <tfoot><tr><td>Total</td>${members.map(m=>`<td>${fmtTk(memBazar[m.name]||0)}</td>`).join("")}<td>${fmtTk(totalBazar)}</td></tr></tfoot>
        </table></div>
      </div>
    </div>`;
}
