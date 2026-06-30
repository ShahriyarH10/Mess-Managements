/* ═══════════════════════════════════════════════
   MANAGER — Log: monthly settlement report
   Settlement month M uses:
     • POSTPAID data from month M-1 (meals, bazar, khala, other)
     • PREPAID data from month M   (rent, elec, gas, wifi)
   ═══════════════════════════════════════════════ */

function renderLog(el) {
  const n    = new Date();
  const opts = buildMonthOptions(n.getMonth(), n.getFullYear());

  el.innerHTML = `
    <div class="topbar">
      <div>
        <div class="page-title">Monthly Log</div>
        <div class="page-sub">Full settlement report with calculation breakdown</div>
      </div>
    </div>

    <div class="content">
      <div class="settlement-formula-box" style="
        background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);
        padding:16px 18px;margin-bottom:16px;font-size:13px;line-height:1.7
      ">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">📊 How settlement is calculated</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <div style="color:var(--red);font-weight:600;margin-bottom:4px">🔴 Postpaid (from PREVIOUS month)</div>
            <div>• Meal cost = meals eaten × meal rate</div>
            <div>• Khala bill (cook/helper)</div>
            <div>• Other cost</div>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">Meal rate = total bazar ÷ total meals</div>
          </div>
          <div>
            <div style="color:var(--blue);font-weight:600;margin-bottom:4px">🔵 Prepaid (from CURRENT month)</div>
            <div>• Room rent</div>
            <div>• Electricity + Gas + WiFi (shared equally)</div>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">Utility = total bills ÷ number of members</div>
          </div>
        </div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);color:var(--green);font-weight:600">
          ✅ Credits (deducted): Bazar spent + Meal cash + Rent paid + Utility paid + ↩ Carry-forward credit
        </div>
        <div style="margin-top:6px;background:var(--accent-bg);border-radius:6px;padding:8px 12px;font-weight:600;color:var(--accent)">
          Net = Meal cost + Khala + Other + Rent + Elec/Gas/WiFi − Bazar − Meal paid − Rent paid − Util paid − Carried fwd + Prev due
        </div>
      </div>

      <div class="month-sel">
        <label>Settlement month</label>
        <select class="input" id="log-month" style="width:180px">
          ${opts.monthOptions}
        </select>
        <label>Year</label>
        <select class="input" id="log-year" style="width:95px">
          ${opts.yearOptions}
        </select>
        <button class="btn btn-primary" onclick="loadLog()">Generate Report</button>
        <button class="btn btn-ghost" onclick="doExportReport()">🖨️ Print PDF</button>
      </div>

      <div id="log-content">
        <div class="empty" style="padding:32px;text-align:center">
          <div style="font-size:32px;margin-bottom:8px">📋</div>
          <div>Select a month and click <b>Generate Report</b></div>
        </div>
      </div>
    </div>
  `;
}

async function loadLog() {
  const month         = parseInt(document.getElementById("log-month").value);
  const year          = parseInt(document.getElementById("log-year").value);
  const settlementKey = monthKey(year, month);
  const prev          = previousMonth(month, year);
  const sourceKey     = prev.key;
  const prevPrev      = previousMonthFromKey(prev.key);

  const logContent = document.getElementById("log-content");
  logContent.innerHTML = '<div class="loading"><div class="spinner"></div>Generating settlement report…</div>';

  const [
    allMeals,
    allBazar,
    currentRentRec,
    currentUtilRes,
    previousUtilRes,
    rentRecPrevRes,
    utilRecPrevPrevRes,
  ] = await Promise.all([
    dbGetAll("meals"),
    dbGetAll("bazar"),
    dbGetMonth("rent", settlementKey),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", settlementKey).maybeSingle(),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", sourceKey).maybeSingle(),
    dbGetMonth("rent", prev.key),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", prevPrev.key).maybeSingle(),
  ]);

  const currentUtilRec   = currentUtilRes.data;
  const previousUtilRec  = previousUtilRes.data;
  const rentRecPrev      = rentRecPrevRes;
  const utilRecPrevPrev  = utilRecPrevPrevRes.data;

  const payData = members.map(m => {
    const p = calcMemberSettlement(m, allMeals, allBazar, currentRentRec, currentUtilRec, previousUtilRec, settlementKey);
    p.prevDue = calcPrevDueForMember(m, allMeals, allBazar, currentUtilRec, rentRecPrev, previousUtilRec, utilRecPrevPrev, settlementKey);
    p.netWithPrevDue = round2(p.netPayable + p.prevDue);
    return p;
  });
  window._logPayData = payData; // store for Details button

  const totalMeals   = round2(payData[0]?.totalMeals || 0);
  const totalBazar   = round2(payData[0]?.totalBazar  || 0);
  const mealRate     = totalMeals > 0 ? round2(totalBazar / totalMeals) : 0;

  const prepaidTotal = utilTotalFromBills(currentUtilRec?.bills || {}, UTIL_PREPAID_KEYS);
  const elecAmt      = Number(currentUtilRec?.bills?.elec  || 0);
  const gasAmt       = Number(currentUtilRec?.bills?.gas   || 0);
  const wifiAmt      = Number(currentUtilRec?.bills?.wifi  || 0);
  const khalaTotal   = Number(previousUtilRec?.bills?.khala || 0);
  const otherTotal   = Number(previousUtilRec?.bills?.other || 0);
  const postpaidTotal = round2(khalaTotal + otherTotal);
  const prepaidShare  = members.length > 0 ? round2(prepaidTotal / members.length) : 0;

  const mealRows  = allMeals.filter(r => String(r.date || "").startsWith(sourceKey)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const bazarRows = allBazar.filter(r => String(r.date || "").startsWith(sourceKey)).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const grandNetPayable = round2(payData.reduce((s, p) => s + p.netWithPrevDue, 0));
  const totalRent       = round2(payData.reduce((s, p) => s + p.roomRent, 0));
  const totalMealCost   = round2(payData.reduce((s, p) => s + p.mealCost, 0));
  const totalUtilPaid   = round2(payData.reduce((s, p) => s + p.utilityPaid, 0));
  const totalRentPaid   = round2(payData.reduce((s, p) => s + p.roomRentPaid, 0));
  const totalMealPaid   = round2(payData.reduce((s, p) => s + (p.mealPaid || 0), 0));

  logContent.innerHTML = `
    <!-- ── Summary banner ── -->
    <div style="
      background:linear-gradient(135deg,var(--bg3),var(--bg2));
      border:1px solid var(--border2);border-radius:var(--radius);
      padding:18px;margin-bottom:14px
    ">
      <div style="font-size:16px;font-weight:700;margin-bottom:12px">
        Settlement — ${MONTHS[month]} ${year}
        <span style="font-size:12px;color:var(--text3);font-weight:400;margin-left:8px">
          (Meal & Bazar data from ${MONTHS[prev.month]} ${prev.year})
        </span>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">🍽 Total meals (${MONTHS[prev.month].slice(0,3)})</div>
          <div class="stat-value">${totalMeals}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">📊 Meal rate</div>
          <div class="stat-value" style="font-size:17px">${fmtTk(mealRate)}</div>
          <div class="stat-sub">${fmtTk(totalBazar)} ÷ ${totalMeals} meals</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">🛒 Total bazar (${MONTHS[prev.month].slice(0,3)})</div>
          <div class="stat-value" style="font-size:17px">${fmtTk(totalBazar)}</div>
        </div>
        <div class="stat-card" style="border-color:rgba(91,155,213,.3)">
          <div class="stat-label" style="color:var(--blue)">🔵 Prepaid bills (${MONTHS[month].slice(0,3)})</div>
          <div class="stat-value" style="font-size:17px;color:var(--blue)">${fmtTk(prepaidTotal)}</div>
          <div class="stat-sub">Elec ${fmtTk(elecAmt)} + Gas ${fmtTk(gasAmt)} + WiFi ${fmtTk(wifiAmt)}</div>
        </div>
        <div class="stat-card" style="border-color:rgba(231,76,60,.3)">
          <div class="stat-label" style="color:var(--red)">🔴 Postpaid bills (${MONTHS[prev.month].slice(0,3)})</div>
          <div class="stat-value" style="font-size:17px;color:var(--red)">${fmtTk(postpaidTotal)}</div>
          <div class="stat-sub">Khala ${fmtTk(khalaTotal)} + Other ${fmtTk(otherTotal)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">⚡ Prepaid per member</div>
          <div class="stat-value" style="font-size:17px">${fmtTk(prepaidShare)}</div>
          <div class="stat-sub">${prepaidTotal} ÷ ${members.length} members</div>
        </div>
      </div>
    </div>

    <!-- ── Settlement table ── -->
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div class="card-title" style="margin:0">Member Settlement — ${MONTHS[month]} ${year}</div>
        <div style="display:flex;gap:10px;font-size:12px;font-weight:600;flex-wrap:wrap">
          <span><span style="display:inline-block;width:9px;height:9px;background:var(--red);border-radius:2px;margin-right:4px"></span>Postpaid from ${MONTHS[prev.month]} ${prev.year}</span>
          <span><span style="display:inline-block;width:9px;height:9px;background:var(--blue);border-radius:2px;margin-right:4px"></span>Prepaid for ${MONTHS[month]} ${year}</span>
          <span><span style="display:inline-block;width:9px;height:9px;background:var(--green);border-radius:2px;margin-right:4px"></span>Credits</span>
        </div>
      </div>

      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th rowspan="2">Member</th>
              <th rowspan="2">Meals<br><span style="font-size:10px;color:var(--text3)">${MONTHS[prev.month].slice(0,3)}</span></th>
              <th colspan="3" style="color:var(--red);background:rgba(231,76,60,.07)">
                🔴 Postpaid — ${MONTHS[prev.month].slice(0,3)} ${prev.year}
              </th>
              <th colspan="2" style="color:var(--blue);background:rgba(91,155,213,.07)">
                🔵 Prepaid — ${MONTHS[month].slice(0,3)} ${year}
              </th>
              <th colspan="6" style="color:var(--green);background:rgba(39,174,96,.07)">
                ✅ Credits
              </th>
              <th rowspan="2" style="background:var(--bg3)">Net</th>
            </tr>
            <tr>
              <th style="color:var(--red)">Meal cost</th>
              <th style="color:var(--red)">Khala</th>
              <th style="color:var(--red)">Other</th>
              <th style="color:var(--blue)">Util share</th>
              <th style="color:var(--blue)">Rent</th>
              <th style="color:var(--green)">Bazar paid</th>
              <th style="color:var(--green)">Meal paid</th>
              <th style="color:var(--green)">Rent paid</th>
              <th style="color:var(--green)">Util paid</th>
              <th style="color:var(--blue)">↩ Carried fwd</th>
              <th style="color:var(--red)">Prev due</th>
            </tr>
          </thead>

          <tbody>
            ${payData.map(p => `
              <tr>
                <td>
                  <b>${p.memberName}</b>
                  <div style="display:flex;gap:4px;margin-top:3px;flex-wrap:wrap">
                    <span class="badge ${p.rentStatus === 'paid' ? 'badge-green' : p.rentStatus === 'partial' ? 'badge-amber' : 'badge-red'}" style="font-size:9px">
                      rent ${p.rentStatus === 'paid' ? '✓' : p.rentStatus === 'partial' ? '~' : '✗'}
                    </span>
                    <span class="badge ${p.utilityStatus === 'paid' ? 'badge-green' : p.utilityStatus === 'partial' ? 'badge-amber' : 'badge-red'}" style="font-size:9px">
                      util ${p.utilityStatus === 'paid' ? '✓' : p.utilityStatus === 'partial' ? '~' : '✗'}
                    </span>
                  </div>
                </td>
                <td style="text-align:center">
                  <b>${p.memberMeals}</b>
                  <div style="font-size:10px;color:var(--text3)">${p.memberMeals} × ${fmtTk(p.mealRate)}</div>
                </td>
                <td style="color:var(--red)">${fmtTk(p.mealCost)}</td>
                <td style="color:var(--red)">${fmtTk(p.khalaShare)}</td>
                <td style="color:var(--red)">${fmtTk(p.otherShare)}</td>
                <td style="color:var(--blue)">
                  ${fmtTk(p.prepaidUtility)}
                  <div style="font-size:10px;color:var(--text3)">${fmtTk(p.prepaidTotal)} ÷ ${members.length}</div>
                </td>
                <td style="color:var(--blue)">${fmtTk(p.roomRent)}</td>
                <td style="color:var(--green)">${fmtTk(p.memberBazar)}</td>
                <td style="color:${(p.mealPaid||0) > 0 ? 'var(--green)' : 'var(--text3)'}">
                  ${(p.mealPaid||0) > 0 ? fmtTk(p.mealPaid) : '৳0'}
                </td>
                <td style="color:${p.roomRentPaid > 0 ? 'var(--green)' : 'var(--text3)'}">
                  ${p.roomRentPaid > 0 ? fmtTk(p.roomRentPaid) : '৳0'}
                </td>
                <td style="color:${p.utilityPaid > 0 ? 'var(--green)' : 'var(--text3)'}">
                  ${p.utilityPaid > 0 ? fmtTk(p.utilityPaid) : '৳0'}
                </td>
                <td style="color:${(p.messCredit||0) > 0 ? 'var(--blue)' : 'var(--text3)'}">
                  ${(p.messCredit||0) > 0 ? `↩ ${fmtTk(p.messCredit)}` : '—'}
                </td>
                <td style="color:${(p.prevDue||0) > 0 ? 'var(--red)' : 'var(--text3)'}">
                  ${(p.prevDue||0) > 0 ? fmtTk(p.prevDue) : '—'}
                </td>
                <td style="background:var(--bg3)">
                  <button
                    class="btn btn-ghost btn-sm"
                    style="font-size:11px;padding:3px 7px;margin-bottom:3px"
                    onclick="showSettlementBreakdown(${payData.indexOf(p)})"
                  >Details</button>
                  <div>
                    <b class="${p.netWithPrevDue > 0 ? 'net-neg' : p.netWithPrevDue < 0 ? 'net-pos' : ''}" style="font-size:14px">
                      ${p.netWithPrevDue > 0 ? 'Pay ' + fmtTk(p.netWithPrevDue) : p.netWithPrevDue < 0 ? 'Get ' + fmtTk(Math.abs(p.netWithPrevDue)) : '✓ Settled'}
                    </b>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>

          <tfoot>
            <tr>
              <td><b>Total</b></td>
              <td>${totalMeals}</td>
              <td>${fmtTk(totalMealCost)}</td>
              <td>${fmtTk(khalaTotal)}</td>
              <td>${fmtTk(otherTotal)}</td>
              <td>${fmtTk(prepaidTotal)}</td>
              <td>${fmtTk(totalRent)}</td>
              <td>${fmtTk(totalBazar)}</td>
              <td>${fmtTk(totalMealPaid)}</td>
              <td>${fmtTk(totalRentPaid)}</td>
              <td>${fmtTk(totalUtilPaid)}</td>
              <td style="color:var(--blue)">${fmtTk(round2(payData.reduce((s,p) => s + (p.messCredit||0), 0)))}</td>
              <td style="color:var(--red)">${fmtTk(round2(payData.reduce((s,p) => s + (p.prevDue||0), 0)))}</td>
              <td><b class="${grandNetPayable > 0 ? 'net-neg' : grandNetPayable < 0 ? 'net-pos' : ''}">
                ${grandNetPayable > 0 ? 'Pay ' + fmtTk(grandNetPayable) : grandNetPayable < 0 ? 'Get ' + fmtTk(Math.abs(grandNetPayable)) : '✓ Balanced'}
              </b></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style="font-size:12px;color:var(--text3);margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        💡 Click <b>Details</b> on any row for a step-by-step breakdown. <b style="color:var(--blue)">↩ Carried fwd</b> = credit applied from last month's overpayment or Mess Owes balance — reduces this month's net payable. <b style="color:var(--red)">Prev due</b> = unpaid balance from last month — adds to this month's net payable.
      </div>
    </div>

    <!-- ── Meal & Bazar detail logs ── -->
    <div style="font-size:13px;color:var(--text2);margin:0 0 8px;font-weight:600">
      📋 Raw data used for this settlement — from ${MONTHS[prev.month]} ${prev.year}
    </div>

    <div class="grid-2" style="gap:12px">
      <div class="card">
        <div class="card-title">Meal log — ${MONTHS[prev.month]} ${prev.year}</div>
        <div class="scroll-table tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                ${members.map(m => `<th>${m.name}</th>`).join("")}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${mealRows.length
                ? mealRows.map(r => {
                    let total = 0;
                    const cells = members.map(m => {
                      const v = mealMemberTotal(r.meals || {}, m.name);
                      total += v;
                      return `<td class="${v > 0 ? "net-pos" : ""}">${v > 0 ? v : "—"}</td>`;
                    }).join("");
                    return `<tr><td>${String(r.date).slice(8)}</td>${cells}<td><b>${round2(total)}</b></td></tr>`;
                  }).join("")
                : `<tr><td colspan="${members.length + 2}" class="empty">No meal entries</td></tr>`
              }
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                ${members.map(m => {
                  const p = payData.find(x => x.memberName === m.name);
                  return `<td>${p?.memberMeals || 0}</td>`;
                }).join("")}
                <td>${totalMeals}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Bazar log — ${MONTHS[prev.month]} ${prev.year}</div>
        <div class="scroll-table tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                ${members.map(m => `<th>${m.name}</th>`).join("")}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${bazarRows.length
                ? bazarRows.map(r => {
                    const total = members.reduce((s, m) => s + Number((r.bazar || {})[m.name] || 0), 0);
                    return `
                      <tr>
                        <td>${String(r.date).slice(8)}</td>
                        ${members.map(m => {
                          const v = Number((r.bazar || {})[m.name] || 0);
                          return `<td class="${v > 0 ? "net-pos" : ""}">${v > 0 ? fmtTk(v) : "—"}</td>`;
                        }).join("")}
                        <td><b>${fmtTk(total)}</b></td>
                      </tr>`;
                  }).join("")
                : `<tr><td colspan="${members.length + 2}" class="empty">No bazar entries</td></tr>`
              }
            </tbody>
            ${bazarRows.length ? `
              <tfoot>
                <tr>
                  <td>Total</td>
                  ${members.map(m => {
                    const p = payData.find(x => x.memberName === m.name);
                    return `<td>${fmtTk(p?.memberBazar || 0)}</td>`;
                  }).join("")}
                  <td>${fmtTk(totalBazar)}</td>
                </tr>
              </tfoot>` : ""}
          </table>
        </div>
      </div>
    </div>
  `;
}

/* Show step-by-step breakdown modal for a single member */
function showSettlementBreakdown(idx) {
  const p = window._logPayData[idx];
  if (!p) return;
  const memberName = p.memberName;
  const modal = document.getElementById("modal-content");

  const prevLabel = monthLabelFromKey(p.sourceKey);
  const curLabel  = monthLabelFromKey(p.settlementKey);

  const rows = [
    { label: `🍽️ Meal cost`, sub: `${p.memberMeals} meals × ${fmtTk(p.mealRate)} rate`, val: p.mealCost, color: "var(--red)", section: "postpaid" },
    { label: `👩 Khala share`, sub: `${fmtTk(p.khalaTotal)} ÷ ${members.length} members`, val: p.khalaShare, color: "var(--red)", section: "postpaid" },
    { label: `📦 Other share`, sub: `${fmtTk(p.otherTotal)} ÷ ${members.length} members`, val: p.otherShare, color: "var(--red)", section: "postpaid" },
    { label: `🏠 Room rent`, sub: `${curLabel}`, val: p.roomRent, color: "var(--blue)", section: "prepaid" },
    { label: `⚡ Utility share`, sub: `${fmtTk(p.prepaidTotal)} ÷ ${members.length} (Elec+Gas+WiFi)`, val: p.prepaidUtility, color: "var(--blue)", section: "prepaid" },
  ];

  const grossTotal = round2(rows.reduce((s, r) => s + r.val, 0));

  modal.innerHTML = `
    <div class="modal-title">Settlement Breakdown — ${memberName}</div>
    <div class="modal-sub" style="margin-bottom:12px">${curLabel} settlement</div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--red);margin-bottom:6px">
      🔴 Postpaid charges — from ${prevLabel}
    </div>

    ${rows.filter(r => r.section === "postpaid").map(r => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg3);border-radius:6px;margin-bottom:6px">
        <div>
          <div style="font-weight:600">${r.label}</div>
          <div style="font-size:11px;color:var(--text3)">${r.sub}</div>
        </div>
        <div style="font-weight:700;color:${r.color};font-size:15px">+ ${fmtTk(r.val)}</div>
      </div>
    `).join("")}

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--blue);margin:12px 0 6px">
      🔵 Prepaid charges — for ${curLabel}
    </div>

    ${rows.filter(r => r.section === "prepaid").map(r => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg3);border-radius:6px;margin-bottom:6px">
        <div>
          <div style="font-weight:600">${r.label}</div>
          <div style="font-size:11px;color:var(--text3)">${r.sub}</div>
        </div>
        <div style="font-weight:700;color:${r.color};font-size:15px">+ ${fmtTk(r.val)}</div>
      </div>
    `).join("")}

    <div style="display:flex;justify-content:space-between;padding:10px 12px;background:var(--bg2);border-radius:6px;margin:8px 0;font-weight:700">
      <span>Subtotal (gross)</span>
      <span>${fmtTk(grossTotal)}</span>
    </div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--green);margin-bottom:6px">
      ✅ Credits (deducted)
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(39,174,96,.08);border:1px solid rgba(39,174,96,.2);border-radius:6px;margin-bottom:6px">
      <div>
        <div style="font-weight:600;color:var(--green)">🛒 Bazar credit</div>
        <div style="font-size:11px;color:var(--text3)">Groceries bought by ${memberName} in ${prevLabel}</div>
      </div>
      <div style="font-weight:700;color:var(--green);font-size:15px">− ${fmtTk(p.memberBazar)}</div>
    </div>

    ${(p.mealPaid || 0) > 0 ? `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(39,174,96,.08);border:1px solid rgba(39,174,96,.2);border-radius:6px;margin-bottom:6px">
        <div>
          <div style="font-weight:600;color:var(--green)">🍽️ Meal paid (cash)</div>
          <div style="font-size:11px;color:var(--text3)">Cash collected against meal portion in ${curLabel}</div>
        </div>
        <div style="font-weight:700;color:var(--green);font-size:15px">− ${fmtTk(p.mealPaid)}</div>
      </div>
    ` : ""}

    ${p.roomRentPaid > 0 ? `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(39,174,96,.08);border:1px solid rgba(39,174,96,.2);border-radius:6px;margin-bottom:6px">
        <div>
          <div style="font-weight:600;color:var(--green)">🏠 Rent paid</div>
          <div style="font-size:11px;color:var(--text3)">${curLabel} — rent already paid</div>
        </div>
        <div style="font-weight:700;color:var(--green);font-size:15px">− ${fmtTk(p.roomRentPaid)}</div>
      </div>
    ` : `
      <div style="padding:8px 12px;background:var(--bg3);border-radius:6px;margin-bottom:6px;font-size:12px;color:var(--text3)">
        🏠 Rent not paid yet
      </div>
    `}

    ${p.utilityPaid > 0 ? `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(39,174,96,.08);border:1px solid rgba(39,174,96,.2);border-radius:6px;margin-bottom:6px">
        <div>
          <div style="font-weight:600;color:var(--green)">💳 Utility paid</div>
          <div style="font-size:11px;color:var(--text3)">Covers Elec+Gas+WiFi+Khala+Other in ${curLabel}</div>
        </div>
        <div style="font-weight:700;color:var(--green);font-size:15px">− ${fmtTk(p.utilityPaid)}</div>
      </div>
    ` : `
      <div style="padding:8px 12px;background:var(--bg3);border-radius:6px;margin-bottom:6px;font-size:12px;color:var(--text3)">
        💳 Utility not paid yet
      </div>
    `}

    ${(p.messCredit||0) > 0 ? `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(52,152,219,.08);border:1px solid rgba(52,152,219,.3);border-radius:6px;margin-bottom:6px">
        <div>
          <div style="font-weight:600;color:var(--blue)">↩ Carry-forward credit</div>
          <div style="font-size:11px;color:var(--text3)">Credit from last month's overpayment or Mess Owes balance</div>
        </div>
        <div style="font-weight:700;color:var(--blue);font-size:15px">− ${fmtTk(p.messCredit)}</div>
      </div>
    ` : ""}

    ${(p.prevDue||0) > 0 ? `
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--red);margin:12px 0 6px">
        🔴 Previous due
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(231,76,60,.08);border:1px solid rgba(231,76,60,.3);border-radius:6px;margin-bottom:6px">
        <div>
          <div style="font-weight:600;color:var(--red)">⏮ Previous due</div>
          <div style="font-size:11px;color:var(--text3)">Unpaid balance carried forward from ${prevLabel}</div>
        </div>
        <div style="font-weight:700;color:var(--red);font-size:15px">+ ${fmtTk(p.prevDue)}</div>
      </div>
    ` : ""}

    <div style="display:flex;justify-content:space-between;padding:12px 14px;background:var(--accent-bg);border:2px solid var(--accent);border-radius:8px;margin-top:10px;font-size:16px;font-weight:800">
      <span>Net Payable</span>
      <span style="color:${p.netWithPrevDue > 0 ? 'var(--red)' : p.netWithPrevDue < 0 ? 'var(--green)' : 'var(--text)'}">
        ${p.netWithPrevDue > 0 ? 'Pay ' + fmtTk(p.netWithPrevDue) : p.netWithPrevDue < 0 ? 'Get ' + fmtTk(Math.abs(p.netWithPrevDue)) : '✓ Settled'}
      </span>
    </div>

    <div style="font-size:11px;color:var(--text3);margin-top:10px;line-height:1.6;background:var(--bg3);padding:8px 12px;border-radius:6px">
      <b>Formula:</b> ${fmtTk(p.mealCost)} + ${fmtTk(p.khalaShare)} + ${fmtTk(p.otherShare)} + ${fmtTk(p.roomRent)} + ${fmtTk(p.prepaidUtility)} − ${fmtTk(p.memberBazar)} − ${fmtTk(p.mealPaid || 0)} − ${fmtTk(p.roomRentPaid)} − ${fmtTk(p.utilityPaid)}${(p.messCredit||0) > 0 ? ` − ${fmtTk(p.messCredit)} (carried fwd)` : ''}${(p.prevDue||0) > 0 ? ` + ${fmtTk(p.prevDue)} (prev due)` : ''} = <b>${fmtTk(p.netWithPrevDue)}</b>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    </div>
  `;

  document.querySelector(".modal").classList.remove("modal-wide");
  openModal();
}


/* ═══════════════════════════════════════════
   PRINT SETTLEMENT — HTML print, landscape
   Page 1: exact same settlement table as screen
   Page 2+: one receipt card per member
═══════════════════════════════════════════ */
async function doExportReport() {
  const monthEl = document.getElementById("log-month");
  const yearEl  = document.getElementById("log-year");
  if (!monthEl || !yearEl) { toast("Select a month first", "error"); return; }

  const month         = parseInt(monthEl.value);
  const year          = parseInt(yearEl.value);
  const settlementKey = monthKey(year, month);
  const prev          = previousMonth(month, year);
  const sourceKey     = prev.key;
  const prevPrev      = previousMonthFromKey(prev.key);

  const btn = document.activeElement;
  if (btn) { btn.disabled = true; btn.textContent = "Preparing..."; }

  try {
    const [allMeals, allBazar, currentRentRec, currentUtilRes, previousUtilRes, rentRecPrevRes, utilRecPrevPrevRes] = await Promise.all([
      dbGetAll("meals"), dbGetAll("bazar"), dbGetMonth("rent", settlementKey),
      getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", settlementKey).maybeSingle(),
      getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", sourceKey).maybeSingle(),
      dbGetMonth("rent", prev.key),
      getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", prevPrev.key).maybeSingle(),
    ]);

    const currentUtilRec  = currentUtilRes.data;
    const previousUtilRec = previousUtilRes.data;
    const rentRecPrev     = rentRecPrevRes;
    const utilRecPrevPrev = utilRecPrevPrevRes.data;

    const payData = members.map(m => {
      const p = calcMemberSettlement(m, allMeals, allBazar, currentRentRec, currentUtilRec, previousUtilRec, settlementKey);
      p.prevDue = calcPrevDueForMember(m, allMeals, allBazar, currentUtilRec, rentRecPrev, previousUtilRec, utilRecPrevPrev, settlementKey);
      p.netWithPrevDue = round2(p.netPayable + p.prevDue);
      return p;
    });

    const totalMeals    = round2(payData[0]?.totalMeals || 0);
    const totalBazar    = round2(payData[0]?.totalBazar  || 0);
    const mealRate      = totalMeals > 0 ? round2(totalBazar / totalMeals) : 0;
    const prepaidTotal  = utilTotalFromBills(currentUtilRec?.bills || {}, UTIL_PREPAID_KEYS);
    const elecAmt       = Number(currentUtilRec?.bills?.elec  || 0);
    const gasAmt        = Number(currentUtilRec?.bills?.gas   || 0);
    const wifiAmt       = Number(currentUtilRec?.bills?.wifi  || 0);
    const khalaTotal    = Number(previousUtilRec?.bills?.khala || 0);
    const otherTotal    = Number(previousUtilRec?.bills?.other || 0);
    const postpaidTotal = round2(khalaTotal + otherTotal);
    const prepaidShare  = members.length > 0 ? round2(prepaidTotal / members.length) : 0;
    const grandNet      = round2(payData.reduce((s,p) => s + p.netWithPrevDue, 0));
    const totalMealCost = round2(payData.reduce((s,p) => s + p.mealCost, 0));
    const totalRent     = round2(payData.reduce((s,p) => s + p.roomRent, 0));
    const totalUtilPaid = round2(payData.reduce((s,p) => s + p.utilityPaid, 0));
    const totalRentPaid = round2(payData.reduce((s,p) => s + p.roomRentPaid, 0));
    const totalMealPaid = round2(payData.reduce((s,p) => s + (p.mealPaid||0), 0));
    const totalCarried  = round2(payData.reduce((s,p) => s + (p.messCredit||0), 0));
    const totalPrevDue  = round2(payData.reduce((s,p) => s + (p.prevDue||0), 0));

    const messName    = currentMess?.name || "Mess";
    const managerName = members.find(m => m.role === "manager")?.name || currentUser?.name || "";
    const genDate     = new Date().toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true });
    const receiptNo   = "SET-" + year + String(month+1).padStart(2,"0") + "-" + String(Date.now()).slice(-4);

    function fP(v) { return "৳" + Number(v).toLocaleString("en-IN", { minimumFractionDigits:0, maximumFractionDigits:2 }); }
    function eh(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

    /* ── Settlement table rows ── */
    const tableRows = payData.map(p => {
      const net = p.netWithPrevDue;
      const netColor = net > 0 ? "#c0392b" : net < 0 ? "#27ae60" : "#888";
      const netHtml  = net > 0 ? `Pay ${fP(net)}` : net < 0 ? `Get ${fP(Math.abs(net))}` : "&#10003; Settled";
      const rentBg   = p.rentStatus === "paid" ? "#e8f8f0" : p.rentStatus === "partial" ? "#fff8e8" : "#fdf0f0";
      const rentCol  = p.rentStatus === "paid" ? "#27ae60" : p.rentStatus === "partial" ? "#e67e22" : "#c0392b";
      const rentTxt  = p.rentStatus === "paid" ? "&#10003;" : p.rentStatus === "partial" ? "~" : "&#10007;";
      const utilBg   = p.utilityStatus === "paid" ? "#e8f8f0" : p.utilityStatus === "partial" ? "#fff8e8" : "#fdf0f0";
      const utilCol  = p.utilityStatus === "paid" ? "#27ae60" : p.utilityStatus === "partial" ? "#e67e22" : "#c0392b";
      const utilTxt  = p.utilityStatus === "paid" ? "&#10003;" : p.utilityStatus === "partial" ? "~" : "&#10007;";
      return `<tr>
        <td>
          <b>${eh(p.memberName)}</b>
          <div style="display:flex;gap:4px;margin-top:3px">
            <span style="font-size:9px;padding:1px 6px;border-radius:10px;background:${rentBg};color:${rentCol};border:1px solid ${rentCol}">rent ${rentTxt}</span>
            <span style="font-size:9px;padding:1px 6px;border-radius:10px;background:${utilBg};color:${utilCol};border:1px solid ${utilCol}">util ${utilTxt}</span>
          </div>
        </td>
        <td class="num">
          <b>${p.memberMeals}</b>
          <div class="sub">${p.memberMeals} &times; ${fP(p.mealRate)}</div>
        </td>
        <td class="num red">${fP(p.mealCost)}</td>
        <td class="num red">${fP(p.khalaShare)}</td>
        <td class="num red">${fP(p.otherShare)}</td>
        <td class="num blue">
          ${fP(p.prepaidUtility)}
          <div class="sub">${fP(p.prepaidTotal)} &divide; ${members.length}</div>
        </td>
        <td class="num blue">${fP(p.roomRent)}</td>
        <td class="num green">${fP(p.memberBazar)}</td>
        <td class="num ${(p.mealPaid||0)>0?"green":"muted"}">${(p.mealPaid||0)>0?fP(p.mealPaid):fP(0)}</td>
        <td class="num ${p.roomRentPaid>0?"green":"muted"}">${p.roomRentPaid>0?fP(p.roomRentPaid):fP(0)}</td>
        <td class="num ${p.utilityPaid>0?"green":"muted"}">${p.utilityPaid>0?fP(p.utilityPaid):fP(0)}</td>
        <td class="num ${(p.messCredit||0)>0?"blue":"muted"}">${(p.messCredit||0)>0?"&#8629; "+fP(p.messCredit):"&mdash;"}</td>
        <td class="num ${(p.prevDue||0)>0?"red":"muted"}">${(p.prevDue||0)>0?fP(p.prevDue):"&mdash;"}</td>
        <td class="num net-cell"><b style="color:${netColor};font-size:13px">${netHtml}</b></td>
      </tr>`;
    }).join("");

    /* ── Totals footer ── */
    const grandColor = grandNet > 0 ? "#c0392b" : grandNet < 0 ? "#27ae60" : "#888";
    const grandHtml  = grandNet > 0 ? `Pay ${fP(grandNet)}` : grandNet < 0 ? `Get ${fP(Math.abs(grandNet))}` : "&#10003; Balanced";
    const totalsRow  = `<tr class="totals-row">
      <td><b>Total</b></td>
      <td class="num"><b>${totalMeals}</b></td>
      <td class="num">${fP(totalMealCost)}</td>
      <td class="num">${fP(khalaTotal)}</td>
      <td class="num">${fP(otherTotal)}</td>
      <td class="num">${fP(prepaidTotal)}</td>
      <td class="num">${fP(totalRent)}</td>
      <td class="num">${fP(totalBazar)}</td>
      <td class="num">${fP(totalMealPaid)}</td>
      <td class="num">${fP(totalRentPaid)}</td>
      <td class="num">${fP(totalUtilPaid)}</td>
      <td class="num" style="color:#5b9bd5">${fP(totalCarried)}</td>
      <td class="num" style="color:#c0392b">${fP(totalPrevDue)}</td>
      <td class="num net-cell"><b style="color:${grandColor}">${grandHtml}</b></td>
    </tr>`;

    /* ── Member receipt cards (page-break separated) ── */
    const memberCards = payData.map(p => {
      const net      = p.netWithPrevDue;
      const netColor = net > 0 ? "#c0392b" : net < 0 ? "#27ae60" : "#888";
      const netLabel = net > 0 ? `Pay ${fP(net)}` : net < 0 ? `Get ${fP(Math.abs(net))}` : "&#10003; Settled";
      const netBg    = net > 0 ? "#fdf0f0" : net < 0 ? "#e8f8f0" : "#f7f7f7";
      const netBdr   = net > 0 ? "#f5c6c6" : net < 0 ? "#b2dfce" : "#ddd";
      const rentCol  = p.rentStatus === "paid" ? "#27ae60" : p.rentStatus === "partial" ? "#e67e22" : "#c0392b";
      const utilCol  = p.utilityStatus === "paid" ? "#27ae60" : p.utilityStatus === "partial" ? "#e67e22" : "#c0392b";

      return `
      <div class="member-card">
        <div class="card-header">
          <div>
            <div class="card-name">${eh(p.memberName)}</div>
            <div class="card-badges">
              <span style="color:${rentCol};border-color:${rentCol}" class="cbadge">Rent: ${p.rentStatus==="paid"?"Paid":p.rentStatus==="partial"?"Partial":"Unpaid"}</span>
              <span style="color:${utilCol};border-color:${utilCol}" class="cbadge">Utility: ${p.utilityStatus==="paid"?"Paid":p.utilityStatus==="partial"?"Partial":"Unpaid"}</span>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:.5px">Net Payable</div>
            <div style="font-size:20px;font-weight:800;color:${netColor}">${netLabel}</div>
          </div>
        </div>

        <div class="card-body">
          <div class="card-col">
            <div class="card-section-lbl" style="color:#c0392b">&#9679; Postpaid — ${MONTHS[prev.month]} ${prev.year}</div>
            <div class="card-row"><span>Meals consumed</span><span class="card-val">${p.memberMeals} meals</span></div>
            <div class="card-row"><span>Meal rate</span><span class="card-val">${fP(p.mealRate)} / meal</span></div>
            <div class="card-row"><span>Meal cost (${p.memberMeals} &times; ${fP(p.mealRate)})</span><span class="card-val red">${fP(p.mealCost)}</span></div>
            ${p.khalaShare > 0 ? `<div class="card-row"><span>Khala share (${fP(p.khalaTotal)} &divide; ${members.length})</span><span class="card-val red">${fP(p.khalaShare)}</span></div>` : ""}
            ${p.otherShare > 0 ? `<div class="card-row"><span>Other share (${fP(p.otherTotal)} &divide; ${members.length})</span><span class="card-val red">${fP(p.otherShare)}</span></div>` : ""}
          </div>

          <div class="card-col">
            <div class="card-section-lbl" style="color:#2980b9">&#9679; Prepaid — ${MONTHS[month]} ${year}</div>
            <div class="card-row"><span>Room rent</span><span class="card-val blue">${fP(p.roomRent)}</span></div>
            ${p.prepaidUtility > 0 ? `<div class="card-row"><span>Utility share (${fP(p.prepaidTotal)} &divide; ${members.length})</span><span class="card-val blue">${fP(p.prepaidUtility)}</span></div>` : ""}
            <div class="card-row total-row"><span><b>Total charges</b></span><span class="card-val"><b>${fP(p.totalPay)}</b></span></div>

            <div class="card-section-lbl" style="color:#27ae60;margin-top:10px">&#10003; Credits</div>
            <div class="card-row"><span>Bazar contributed</span><span class="card-val green">- ${fP(p.memberBazar)}</span></div>
            ${p.roomRentPaid  > 0 ? `<div class="card-row"><span>Rent paid</span><span class="card-val green">- ${fP(p.roomRentPaid)}</span></div>` : ""}
            ${p.utilityPaid   > 0 ? `<div class="card-row"><span>Utility paid</span><span class="card-val green">- ${fP(p.utilityPaid)}</span></div>` : ""}
            ${(p.mealPaid||0) > 0 ? `<div class="card-row"><span>Meal cash paid</span><span class="card-val green">- ${fP(p.mealPaid)}</span></div>` : ""}
            ${(p.messCredit||0) > 0 ? `<div class="card-row"><span>&#8629; Carried forward</span><span class="card-val blue">- ${fP(p.messCredit)}</span></div>` : ""}
            ${(p.prevDue||0) > 0 ? `<div class="card-row"><span>Previous due (${MONTHS[prev.month]})</span><span class="card-val" style="color:#c0392b">+ ${fP(p.prevDue)}</span></div>` : ""}
          </div>
        </div>

        <div class="card-net" style="background:${netBg};border-color:${netBdr}">
          <span>Net Payable — ${eh(p.memberName)}</span>
          <span style="color:${netColor};font-size:18px;font-weight:800">${netLabel}</span>
        </div>
      </div>`;
    }).join("");

    /* ── Full HTML ── */
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Settlement — ${eh(messName)} — ${MONTHS[month]} ${year}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#222;font-size:11px;}

    /* ── Page 1: table layout ── */
    .page1{padding:12px 14px;}

    /* Header — payment receipt style */
    .head{text-align:center;padding-bottom:14px;border-bottom:2px dashed #ccc;margin-bottom:12px;}
    .head-icon{font-size:30px;line-height:1;margin-bottom:5px;}
    .head-name{font-size:20px;font-weight:800;letter-spacing:.3px;color:#111;}
    .head-sub{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.9px;margin-top:3px;}
    .head-period{font-size:13px;font-weight:700;color:#b8914a;margin-top:6px;}
    .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:6px 12px;background:#f7f7f7;border:1px solid #eee;border-radius:8px;padding:8px 12px;margin-bottom:10px;}
    .ml{display:flex;flex-direction:column;gap:1px;}
    .ml-lbl{font-size:8px;text-transform:uppercase;letter-spacing:.6px;color:#999;}
    .ml-val{font-size:11px;font-weight:600;color:#222;}

    /* Summary stat cards — light style */
    .stat-row{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:10px;}
    .stat{background:#f7f7f7;border:1px solid #eee;border-radius:7px;padding:8px 10px;}
    .stat.blue{border-top:2px solid #5b9bd5;background:#f0f5fd;}
    .stat.red{border-top:2px solid #e05252;background:#fdf5f5;}
    .stat.plain{border-top:2px solid #ccc;}
    .stat-lbl{font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:#999;margin-bottom:4px;}
    .stat-val{font-size:13px;font-weight:700;color:#222;}
    .stat-sub{font-size:8px;color:#aaa;margin-top:2px;}

    /* Settlement table */
    .tbl-wrap{overflow:hidden;border-radius:8px;border:1px solid #ddd;}
    table{width:100%;border-collapse:collapse;font-size:10px;}
    th{padding:5px 5px;text-align:left;font-size:8.5px;font-weight:700;letter-spacing:.4px;white-space:nowrap;}
    td{padding:5px 5px;border-bottom:1px solid #f0f0f0;vertical-align:top;}
    tr:last-child td{border-bottom:none;}
    .num{text-align:right;}
    .sub{font-size:8px;color:#999;margin-top:1px;}
    .red{color:#c0392b;}
    .blue{color:#2980b9;}
    .green{color:#27ae60;}
    .muted{color:#bbb;}
    .net-cell{min-width:80px;}
    .thead-group th{padding:4px 5px;font-size:8px;}
    .th-postpaid{background:#fff0f0;color:#c0392b;border-bottom:2px solid #e05252;}
    .th-prepaid{background:#f0f5fd;color:#2980b9;border-bottom:2px solid #5b9bd5;}
    .th-credits{background:#f0faf5;color:#27ae60;border-bottom:2px solid #4caf82;}
    .th-plain{background:#f7f7f7;color:#555;border-bottom:2px solid #ccc;}
    .totals-row td{background:#f7f7f7;font-weight:700;border-top:2px solid #ddd;}
    .legend{display:flex;gap:14px;font-size:9px;color:#888;margin-top:8px;}
    .legend span{display:flex;align-items:center;gap:4px;}
    .dot{width:8px;height:8px;border-radius:2px;display:inline-block;}

    /* ── Page break before cards ── */
    .page-break{page-break-before:always;}

    /* ── Member receipt cards ── */
    .cards-page{padding:12px 14px;}
    .cards-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:2px dashed #ccc;}
    .cards-title{font-size:14px;font-weight:800;}
    .cards-meta{font-size:10px;color:#888;}
    .member-card{border:1px solid #ddd;border-radius:10px;overflow:hidden;margin-bottom:14px;page-break-inside:avoid;}
    .card-header{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f7f7f7;border-bottom:1px solid #eee;}
    .card-name{font-size:15px;font-weight:800;color:#111;}
    .card-badges{display:flex;gap:5px;margin-top:4px;}
    .cbadge{font-size:8.5px;font-weight:700;padding:2px 7px;border-radius:20px;border:1px solid;text-transform:uppercase;letter-spacing:.4px;}
    .card-body{display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #eee;}
    .card-col{padding:10px 14px;}
    .card-col:first-child{border-right:1px solid #eee;}
    .card-section-lbl{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #eee;}
    .card-row{display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:11px;color:#555;}
    .card-val{font-weight:600;font-size:12px;color:#222;}
    .card-val.red{color:#c0392b;}
    .card-val.blue{color:#2980b9;}
    .card-val.green{color:#27ae60;}
    .total-row{border-top:1px solid #eee;margin-top:4px;padding-top:5px !important;}
    .card-net{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-top:2px solid;}

    @media print {
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .stat{background:#f0f0f0 !important;-webkit-print-color-adjust:exact;}
      .totals-row td{background:#f7f7f7 !important;}
      @page{margin:6mm;size:A4 landscape;}
      @page :first{size:A4 landscape;}
      .page-break{page-break-before:always;}
      .member-card{page-break-inside:avoid;}
    }
  </style>
</head>
<body>

<!-- ══ PAGE 1: Settlement Table ══ -->
<div class="page1">

  <div class="head">
    <div class="head-icon">🏠</div>
    <div class="head-name">${eh(messName)}</div>
    <div class="head-sub">Monthly Settlement Statement</div>
    <div class="head-period">${MONTHS[month]} ${year} &nbsp;&mdash;&nbsp; Meal &amp; Bazar data from ${MONTHS[prev.month]} ${prev.year}</div>
  </div>

  <div class="meta">
    <div class="ml"><span class="ml-lbl">Document No.</span><span class="ml-val" style="font-family:monospace">${receiptNo}</span></div>
    <div class="ml"><span class="ml-lbl">Generated</span><span class="ml-val">${genDate}</span></div>
    <div class="ml"><span class="ml-lbl">Manager</span><span class="ml-val">${eh(managerName)}</span></div>
    <div class="ml"><span class="ml-lbl">Members</span><span class="ml-val">${members.length} members</span></div>
  </div>

  <div class="stat-row">
    <div class="stat plain">
      <div class="stat-lbl">Total meals (${MONTHS[prev.month].slice(0,3)})</div>
      <div class="stat-val">${totalMeals}</div>
    </div>
    <div class="stat plain">
      <div class="stat-lbl">Meal rate</div>
      <div class="stat-val">${fP(mealRate)}</div>
      <div class="stat-sub">${fP(totalBazar)} &divide; ${totalMeals} meals</div>
    </div>
    <div class="stat plain">
      <div class="stat-lbl">Total bazar (${MONTHS[prev.month].slice(0,3)})</div>
      <div class="stat-val">${fP(totalBazar)}</div>
    </div>
    <div class="stat blue">
      <div class="stat-lbl">Prepaid bills (${MONTHS[month].slice(0,3)})</div>
      <div class="stat-val" style="color:#5b9bd5">${fP(prepaidTotal)}</div>
      <div class="stat-sub">Elec ${fP(elecAmt)} + Gas ${fP(gasAmt)} + WiFi ${fP(wifiAmt)}</div>
    </div>
    <div class="stat red">
      <div class="stat-lbl">Postpaid bills (${MONTHS[prev.month].slice(0,3)})</div>
      <div class="stat-val" style="color:#e05252">${fP(postpaidTotal)}</div>
      <div class="stat-sub">Khala ${fP(khalaTotal)} + Other ${fP(otherTotal)}</div>
    </div>
    <div class="stat plain">
      <div class="stat-lbl">Prepaid per member</div>
      <div class="stat-val">${fP(prepaidShare)}</div>
      <div class="stat-sub">${fP(prepaidTotal)} &divide; ${members.length} members</div>
    </div>
  </div>

  <div style="font-size:11px;font-weight:700;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
    <span>MEMBER SETTLEMENT &mdash; ${MONTHS[month].toUpperCase()} ${year}</span>
    <span class="legend">
      <span><span class="dot" style="background:#e05252"></span>Postpaid from ${MONTHS[prev.month]} ${prev.year}</span>
      <span><span class="dot" style="background:#5b9bd5"></span>Prepaid for ${MONTHS[month]} ${year}</span>
      <span><span class="dot" style="background:#4caf82"></span>Credits</span>
    </span>
  </div>

  <div class="tbl-wrap">
    <table>
      <thead>
        <tr class="thead-group">
          <th class="th-plain" rowspan="2">MEMBER</th>
          <th class="th-plain" rowspan="2" style="text-align:right">MEALS<br><span style="font-weight:400">${MONTHS[prev.month].slice(0,3)}</span></th>
          <th class="th-postpaid" colspan="3">&#9679; POSTPAID &mdash; ${MONTHS[prev.month].slice(0,3).toUpperCase()} ${prev.year}</th>
          <th class="th-prepaid"  colspan="2">&#9679; PREPAID &mdash; ${MONTHS[month].slice(0,3).toUpperCase()} ${year}</th>
          <th class="th-credits"  colspan="6">&#10003; CREDITS</th>
          <th class="th-plain" rowspan="2" style="text-align:right">NET</th>
        </tr>
        <tr class="thead-group">
          <th class="th-postpaid" style="text-align:right">MEAL COST</th>
          <th class="th-postpaid" style="text-align:right">KHALA</th>
          <th class="th-postpaid" style="text-align:right">OTHER</th>
          <th class="th-prepaid"  style="text-align:right">UTIL SHARE</th>
          <th class="th-prepaid"  style="text-align:right">RENT</th>
          <th class="th-credits"  style="text-align:right">BAZAR PAID</th>
          <th class="th-credits"  style="text-align:right">MEAL PAID</th>
          <th class="th-credits"  style="text-align:right">RENT PAID</th>
          <th class="th-credits"  style="text-align:right">UTIL PAID</th>
          <th class="th-credits"  style="text-align:right">&#8629; CARRIED FWD</th>
          <th class="th-credits"  style="text-align:right">PREV DUE</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
      <tfoot>
        ${totalsRow}
      </tfoot>
    </table>
  </div>

  <div style="font-size:9px;color:#888;margin-top:8px">
    &#128161; Click <b>Details</b> on any row for a step-by-step breakdown.
    <b style="color:#5b9bd5">&#8629; Carried fwd</b> = credit applied from last month's overpayment or Mess Owes balance &mdash; reduces this month's net payable.
  </div>

</div>

<!-- ══ PAGE 2+: Member Receipt Cards ══ -->
<div class="page-break"></div>
<div class="cards-page">

  <div class="cards-header">
    <div>
      <div class="cards-title">${eh(messName)} &mdash; Individual Settlement Receipts</div>
      <div class="cards-meta">${MONTHS[month]} ${year} &nbsp;|&nbsp; ${payData.length} members &nbsp;|&nbsp; Ref: ${receiptNo}</div>
    </div>
    <div class="cards-meta" style="text-align:right">${genDate}<br>Manager: ${eh(managerName)}</div>
  </div>

  ${memberCards}

</div>

</body>
</html>`;

    /* ── Print using same iframe pattern as payment receipt ── */
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    let w, frame;

    if (isSafari) {
      w = window.open("", "_blank", "width=900,height=700");
      if (!w) { toast("Pop-up blocked — allow pop-ups to print", "error"); return; }
    } else {
      frame = document.getElementById("_settle-print-frame");
      if (frame) frame.remove();
      frame = document.createElement("iframe");
      frame.id = "_settle-print-frame";
      frame.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;";
      document.body.appendChild(frame);
      w = frame.contentWindow;
    }

    w.document.write(html);
    w.document.close();

    if (isSafari) {
      setTimeout(() => { w.focus(); w.print(); }, 300);
    } else {
      frame.onload = function() {
        setTimeout(() => { w.focus(); w.print(); }, 300);
      };
    }

    toast("Print dialog opening...", "success");

  } catch(e) {
    console.error("Print error:", e);
    toast("Print failed: " + e.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🖨️ Print PDF"; }
  }
}
