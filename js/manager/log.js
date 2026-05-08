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
          ✅ Credits (deducted): Bazar spent + Meal cash + Rent paid + Utility paid
        </div>
        <div style="margin-top:6px;background:var(--accent-bg);border-radius:6px;padding:8px 12px;font-weight:600;color:var(--accent)">
          Net = Meal cost + Khala + Other + Rent + Elec/Gas/WiFi − Bazar − Meal paid − Rent paid − Util paid
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

  const logContent = document.getElementById("log-content");
  logContent.innerHTML = '<div class="loading"><div class="spinner"></div>Generating settlement report…</div>';

  const [
    allMeals,
    allBazar,
    currentRentRec,
    currentUtilRes,
    previousUtilRes,
  ] = await Promise.all([
    dbGetAll("meals"),
    dbGetAll("bazar"),
    dbGetMonth("rent", settlementKey),
    sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", settlementKey).maybeSingle(),
    sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", sourceKey).maybeSingle(),
  ]);

  const currentUtilRec  = currentUtilRes.data;
  const previousUtilRec = previousUtilRes.data;

  const payData = members.map(m =>
    calcMemberSettlement(m, allMeals, allBazar, currentRentRec, currentUtilRec, previousUtilRec, settlementKey)
  );
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

  const grandNetPayable = round2(payData.reduce((s, p) => s + p.netPayable, 0));
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
              <th colspan="4" style="color:var(--green);background:rgba(39,174,96,.07)">
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
                <td style="background:var(--bg3)">
                  <button
                    class="btn btn-ghost btn-sm"
                    style="font-size:11px;padding:3px 7px;margin-bottom:3px"
                    onclick="showSettlementBreakdown(${payData.indexOf(p)})"
                  >Details</button>
                  <div>
                    <b class="${p.netPayable > 0 ? 'net-neg' : p.netPayable < 0 ? 'net-pos' : ''}" style="font-size:14px">
                      ${p.netPayable > 0 ? 'Pay ' + fmtTk(p.netPayable) : p.netPayable < 0 ? 'Get ' + fmtTk(Math.abs(p.netPayable)) : '✓ Settled'}
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
              <td><b class="${grandNetPayable > 0 ? 'net-neg' : grandNetPayable < 0 ? 'net-pos' : ''}">
                ${grandNetPayable > 0 ? 'Pay ' + fmtTk(grandNetPayable) : grandNetPayable < 0 ? 'Get ' + fmtTk(Math.abs(grandNetPayable)) : '✓ Balanced'}
              </b></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style="font-size:12px;color:var(--text3);margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        💡 Click <b>Details</b> on any member row to see a step-by-step calculation breakdown.
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
                      const v = mealTotalFromObj(r.meals || {}, m.name);
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

    <div style="display:flex;justify-content:space-between;padding:12px 14px;background:var(--accent-bg);border:2px solid var(--accent);border-radius:8px;margin-top:10px;font-size:16px;font-weight:800">
      <span>Net Payable</span>
      <span style="color:${p.netPayable > 0 ? 'var(--red)' : p.netPayable < 0 ? 'var(--green)' : 'var(--text)'}">
        ${p.netPayable > 0 ? 'Pay ' + fmtTk(p.netPayable) : p.netPayable < 0 ? 'Get ' + fmtTk(Math.abs(p.netPayable)) : '✓ Settled'}
      </span>
    </div>

    <div style="font-size:11px;color:var(--text3);margin-top:10px;line-height:1.6;background:var(--bg3);padding:8px 12px;border-radius:6px">
      <b>Formula:</b> ${fmtTk(p.mealCost)} + ${fmtTk(p.khalaShare)} + ${fmtTk(p.otherShare)} + ${fmtTk(p.roomRent)} + ${fmtTk(p.prepaidUtility)} − ${fmtTk(p.memberBazar)} − ${fmtTk(p.mealPaid || 0)} − ${fmtTk(p.roomRentPaid)} − ${fmtTk(p.utilityPaid)} = <b>${fmtTk(p.netPayable)}</b>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    </div>
  `;

  document.querySelector(".modal").classList.remove("modal-wide");
  openModal();
}
