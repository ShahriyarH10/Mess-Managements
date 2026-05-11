/* ═══════════════════════════════════════════════
   MANAGER — Utility: prepaid/postpaid bill entry + smart payment tracking
   ═══════════════════════════════════════════════ */

async function renderUtility(el) {
  const n    = new Date();
  const opts = buildMonthOptions(n.getMonth(), n.getFullYear());

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Utility Entry</div>
      <div class="page-sub">Bills entry and member payment tracking</div>
    </div>
  </div>
  <div class="content">

    <!-- Bill entry cards -->
    <div class="grid-2" style="margin-bottom:12px">
      <div class="card">
        <div class="card-title">🔵 Prepaid bills — Electricity, Gas, WiFi</div>
        <div class="modal-sub" style="margin-bottom:10px">Enter for the <b>current</b> settlement month</div>
        <div class="month-sel">
          <label>Month</label>
          <select class="input" id="ut-pre-month" style="width:150px">${opts.monthOptions}</select>
          <label>Year</label>
          <select class="input" id="ut-pre-year" style="width:95px">${opts.yearOptions}</select>
          <button class="btn btn-ghost btn-sm" onclick="loadUtilityGroup('prepaid')">Load</button>
        </div>
        <div class="util-fields">
          <div class="field" style="margin:0"><label>Electricity (৳)</label><input type="number" class="input" id="ut-elec" min="0" placeholder="0" oninput="updUtilityPreview()"/></div>
          <div class="field" style="margin:0"><label>Gas (৳)</label><input type="number" class="input" id="ut-gas" min="0" placeholder="0" oninput="updUtilityPreview()"/></div>
          <div class="field" style="margin:0"><label>WiFi (৳)</label><input type="number" class="input" id="ut-wifi" min="0" placeholder="0" oninput="updUtilityPreview()"/></div>
        </div>
        <div class="stat-grid" style="margin-top:14px;margin-bottom:8px">
          <div class="stat-card"><div class="stat-label">Prepaid total</div><div class="stat-value" id="ut-pre-total">৳0</div></div>
          <div class="stat-card"><div class="stat-label">Per member</div><div class="stat-value" id="ut-pre-share">৳0</div></div>
        </div>
        <button class="btn btn-primary" onclick="saveUtilityGroup('prepaid')">Save prepaid bills</button>
      </div>

      <div class="card">
        <div class="card-title">🔴 Postpaid bills — Khala bill, Other cost</div>
        <div class="modal-sub" style="margin-bottom:10px">Enter for the <b>previous</b> month (will charge in next settlement)</div>
        <div class="month-sel">
          <label>Month</label>
          <select class="input" id="ut-post-month" style="width:150px">${opts.monthOptions}</select>
          <label>Year</label>
          <select class="input" id="ut-post-year" style="width:95px">${opts.yearOptions}</select>
          <button class="btn btn-ghost btn-sm" onclick="loadUtilityGroup('postpaid')">Load</button>
        </div>
        <div class="util-fields">
          <div class="field" style="margin:0"><label>Khala bill (৳)</label><input type="number" class="input" id="ut-khala" min="0" placeholder="0" oninput="updUtilityPreview()"/></div>
          <div class="field" style="margin:0"><label>Other cost (৳)</label><input type="number" class="input" id="ut-other" min="0" placeholder="0" oninput="updUtilityPreview()"/></div>
        </div>
        <div class="stat-grid" style="margin-top:14px;margin-bottom:8px">
          <div class="stat-card"><div class="stat-label">Postpaid total</div><div class="stat-value" id="ut-post-total">৳0</div></div>
          <div class="stat-card"><div class="stat-label">Per member</div><div class="stat-value" id="ut-post-share">৳0</div></div>
        </div>
        <button class="btn btn-primary" onclick="saveUtilityGroup('postpaid')">Save postpaid bills</button>
      </div>
    </div>

    <!-- Payment tracking -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">💳 Member utility payment tracking</div>

      <div class="settlement-note" style="margin-bottom:12px">
        <b>How it works:</b> Each member's utility due = current month prepaid (Elec+Gas+WiFi) + previous month postpaid (Khala+Other) ÷ total members.<br>
        Enter how much a member paid — the remaining balance updates automatically.
      </div>

      <div class="month-sel" style="margin-bottom:14px">
        <label>Settlement month</label>
        <select class="input" id="ut-pay-month" style="width:150px">${opts.monthOptions}</select>
        <label>Year</label>
        <select class="input" id="ut-pay-year" style="width:95px">${opts.yearOptions}</select>
        <button class="btn btn-ghost btn-sm" onclick="loadUtilityPayments()">Load</button>
      </div>

      <!-- Summary bar -->
      <div id="ut-summary-bar" style="display:none;background:var(--bg3);border-radius:var(--radius);padding:12px 16px;margin-bottom:14px">
        <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:13px">
          <div><span style="color:var(--text3)">Per member due: </span><b id="ut-per-head">৳0</b></div>
          <div><span style="color:var(--text3)">Prepaid (current): </span><span style="color:var(--blue)" id="ut-cur-prepaid">৳0</span></div>
          <div><span style="color:var(--text3)">Postpaid (prev month): </span><span style="color:var(--red)" id="ut-prev-postpaid">৳0</span></div>
          <div><span style="color:var(--text3)">Total collected: </span><span style="color:var(--green)" id="ut-total-collected">৳0</span></div>
        </div>
      </div>

      <div id="ut-payment-table">
        <div class="empty" style="padding:24px;text-align:center">
          <div style="font-size:24px;margin-bottom:6px">💳</div>
          Select a month and click <b>Load</b> to manage payments
        </div>
      </div>

      <div id="ut-payment-actions" style="display:none;margin-top:12px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="saveUtilityPayments()">💾 Save payments</button>
          <button class="btn btn-ghost" onclick="markAllUtilPaid()">✓ Mark all fully paid</button>
        </div>
      </div>
    </div>

    <!-- History -->
    <div class="card">
      <div class="card-title">📋 Utility history</div>
      <div class="tbl-wrap" id="ut-history"><div class="loading"><div class="spinner"></div>Loading…</div></div>
    </div>
  </div>`;

  await loadUtilityGroup("prepaid");
  await loadUtilityGroup("postpaid");
  await loadUtilityPayments();
  await loadUtilHistory();
}

function getUtilityGroupKey(type) {
  const prefix = type === "postpaid" ? "ut-post" : "ut-pre";
  const month = parseInt(document.getElementById(prefix + "-month")?.value ?? new Date().getMonth());
  const year  = parseInt(document.getElementById(prefix + "-year")?.value  ?? new Date().getFullYear());
  return { month, year, key: monthKey(year, month) };
}

function getPaymentKey() {
  const month = parseInt(document.getElementById("ut-pay-month")?.value ?? new Date().getMonth());
  const year  = parseInt(document.getElementById("ut-pay-year")?.value  ?? new Date().getFullYear());
  return { month, year, key: monthKey(year, month) };
}

function updUtilityPreview() {
  const preTotal  = utilTotalFromBills({
    elec: parseFloat(document.getElementById("ut-elec")?.value || 0),
    gas:  parseFloat(document.getElementById("ut-gas")?.value  || 0),
    wifi: parseFloat(document.getElementById("ut-wifi")?.value || 0),
  }, UTIL_PREPAID_KEYS);
  const postTotal = utilTotalFromBills({
    khala: parseFloat(document.getElementById("ut-khala")?.value || 0),
    other: parseFloat(document.getElementById("ut-other")?.value || 0),
  }, UTIL_POSTPAID_KEYS);
  const preShare  = members.length > 0 ? round2(preTotal  / members.length) : 0;
  const postShare = members.length > 0 ? round2(postTotal / members.length) : 0;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmtTk(v); };
  set("ut-pre-total",  preTotal);  set("ut-pre-share",  preShare);
  set("ut-post-total", postTotal); set("ut-post-share", postShare);
}

async function loadUtilityGroup(type) {
  const { key } = getUtilityGroupKey(type);
  const { data: rec } = await sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle();
  const bills = rec?.bills || {};
  if (type === "prepaid") {
    ["elec", "gas", "wifi"].forEach(k => { const i = document.getElementById("ut-" + k); if (i) i.value = bills[k] || ""; });
  } else {
    ["khala", "other"].forEach(k => { const i = document.getElementById("ut-" + k); if (i) i.value = bills[k] || ""; });
  }
  updUtilityPreview();
}

async function saveUtilityGroup(type) {
  const { month, year, key } = getUtilityGroupKey(type);
  const { data: rec } = await sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle();
  const bills = { ...(rec?.bills || {}) };
  if (type === "prepaid") {
    bills.elec = parseFloat(document.getElementById("ut-elec")?.value || 0);
    bills.gas  = parseFloat(document.getElementById("ut-gas")?.value  || 0);
    bills.wifi = parseFloat(document.getElementById("ut-wifi")?.value || 0);
  } else {
    bills.khala = parseFloat(document.getElementById("ut-khala")?.value || 0);
    bills.other = parseFloat(document.getElementById("ut-other")?.value || 0);
  }
  try {
    await dbUpsertUtility(month, year, key, bills, rec?.payments || {});
    if (type === "postpaid") {
      const target = nextMonth(month, year);
      setPaymentMonth(target.month, target.year);
    } else {
      setPaymentMonth(month, year);
    }
    toast(type === "prepaid" ? "Prepaid utility saved" : "Postpaid utility saved for next month settlement", "success");
    await loadUtilityPayments();
    await loadUtilHistory();
  } catch (e) { toast("Error: " + e.message, "error"); }
}

/* ── Payment tracking ──────────────────────────────────────────────────────
   perHead = (current prepaid + previous postpaid) / members
   Manager enters how much a member paid → remaining shown instantly
   ───────────────────────────────────────────────────────────────────────── */
let _utPerHead = 0; // module-level so oninput can access it

function buildUtilPaymentTable(perHead, payments = {}, messCredit = {}) {
  _utPerHead = perHead;
  const wrap = document.getElementById("ut-payment-table");
  const actions = document.getElementById("ut-payment-actions");
  const summary = document.getElementById("ut-summary-bar");
  if (!wrap) return;

  if (!members.length) {
    wrap.innerHTML = '<div class="empty">No members in this mess</div>';
    return;
  }

  wrap.innerHTML = `
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Member</th>
            <th>Total due</th>
            <th>Amount paid (৳)</th>
            <th>Status</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody id="ut-tbody">
          ${members.map(m => {
            const p       = payments[m.name] || {};
            const credit  = round2(Number(messCredit[m.name] || 0));
            const paid    = Number(p.paid || 0);
            // Pre-fill with carry-forward credit if no manual payment recorded yet
            const prefill = paid === 0 && credit > 0 ? credit : paid;
            const status  = p.status || (credit > 0 && paid === 0 ? (credit >= perHead ? "paid" : "partial") : "unpaid");

            return `
              <tr id="utr-${m.id}">
                <td><b>${m.name}</b></td>
                <td><b>${fmtTk(perHead)}</b></td>
                <td>
                  <input
                    type="number"
                    class="input input-sm"
                    id="up-${m.id}"
                    value="${prefill}"
                    min="0"
                    step="1"
                    style="width:100px"
                    oninput="onUtilPaidInput('${m.id}', ${perHead})"
                  />
                  ${credit > 0 ? `<div style="font-size:10px;color:var(--blue);margin-top:3px">↩ ${fmtTk(credit)} carried fwd</div>` : ''}
                </td>
                <td>
                  <select class="input input-sm" id="ust-${m.id}" style="width:110px">
                    <option value="unpaid" ${status === "unpaid" ? "selected" : ""}>⏳ Not paid</option>
                    <option value="partial" ${status === "partial" ? "selected" : ""}>⚠️ Partial</option>
                    <option value="paid" ${status === "paid" ? "selected" : ""}>✅ Paid</option>
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    class="input input-sm"
                    id="un-${m.id}"
                    placeholder="—"
                    value="${p.notes || ""}"
                    style="width:110px"
                  />
                </td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;

  if (actions)  actions.style.display  = "block";
  if (summary)  summary.style.display  = "block";

  // Merge carry-forward credits into payments for accurate summary display
  const effectivePayments = {};
  members.forEach(m => {
    const p      = payments[m.name] || {};
    const credit = round2(Number(messCredit[m.name] || 0));
    const paid   = Number(p.paid || 0);
    effectivePayments[m.name] = { ...p, paid: paid === 0 && credit > 0 ? credit : paid };
  });
  updateSummaryBar(perHead, effectivePayments);
}

function onUtilPaidInput(memberId, perHead) {
  const paidEl = document.getElementById("up-" + memberId);
  const statEl = document.getElementById("ust-" + memberId);
  if (!paidEl) return;

  const paid = parseFloat(paidEl.value || 0);

  // Auto-set status based on amount
  if (statEl) {
    if (paid <= 0)             statEl.value = "unpaid";
    else if (paid >= perHead)  statEl.value = "paid";
    else                       statEl.value = "partial";
  }

  // Update summary totals
  updateSummaryTotals(perHead);
}

function updateSummaryTotals(perHead) {
  let totalCollected = 0;
  members.forEach(m => {
    const v = parseFloat(document.getElementById("up-" + m.id)?.value || 0);
    totalCollected += v;
  });
  totalCollected = round2(totalCollected);

  const set = (id, v, color) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = fmtTk(v); if (color) el.style.color = color; }
  };
  set("ut-total-collected", totalCollected, "var(--green)");
}

function updateSummaryBar(perHead, payments) {
  updateSummaryTotals(perHead);
}

async function loadUtilityPayments() {
  const { key } = getPaymentKey();
  const prev = previousMonthFromKey(key);

  const [currentRes, previousRes] = await Promise.all([
    sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle(),
    sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", prev.key).maybeSingle(),
  ]);

  const currentUtilRec  = currentRes.data;
  const previousUtilRec = previousRes.data;

  const currentPrepaid   = utilTotalFromBills(currentUtilRec?.bills  || {}, UTIL_PREPAID_KEYS);
  const previousPostpaid = utilTotalFromBills(previousUtilRec?.bills || {}, UTIL_POSTPAID_KEYS);
  const totalPayable     = round2(currentPrepaid + previousPostpaid);
  const perHead          = members.length > 0 ? round2(totalPayable / members.length) : 0;

  // Update summary bar static values
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmtTk(v); };
  set("ut-per-head",       perHead);
  set("ut-cur-prepaid",    currentPrepaid);
  set("ut-prev-postpaid",  previousPostpaid);

  const messCredit = currentUtilRec?.bills?.mess_credit || {};
  buildUtilPaymentTable(perHead, currentUtilRec?.payments || {}, messCredit);
}

function markAllUtilPaid() {
  members.forEach(m => {
    const paidEl = document.getElementById("up-" + m.id);
    const statEl = document.getElementById("ust-" + m.id);
    if (paidEl) paidEl.value = _utPerHead;
    if (statEl) statEl.value = "paid";
  });
  updateSummaryTotals(_utPerHead);
}

async function saveUtilityPayments() {
  const { month, year, key } = getPaymentKey();
  const { data: rec } = await sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle();
  const payments = {};
  members.forEach(m => {
    payments[m.name] = {
      paid:   parseFloat(document.getElementById("up-"  + m.id)?.value || 0),
      status: document.getElementById("ust-" + m.id)?.value || "unpaid",
      notes:  cleanText(document.getElementById("un-"  + m.id)?.value || ""),
    };
  });
  try {
    await dbUpsertUtility(month, year, key, rec?.bills || {}, payments);
    toast("Utility payments saved ✓", "success");
    await loadUtilHistory();
  } catch (e) { toast("Error: " + e.message, "error"); }
}

async function loadUtilHistory() {
  const wrap = document.getElementById("ut-history");
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  const { data: all } = await sb.from("utility_payments").select("*").eq("mess_id", messId()).order("month_key", { ascending: false });
  if (!all?.length) { wrap.innerHTML = '<div class="empty">No utility records yet</div>'; return; }

  const map = {};
  all.forEach(r => { map[r.month_key] = r; });

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
      ${all.slice(0, 12).map(r => {
        const prev      = previousMonthFromKey(r.month_key);
        const prevRec   = map[prev.key];
        const prepaid   = utilTotalFromBills(r.bills || {},          UTIL_PREPAID_KEYS);
        const postpaid  = utilTotalFromBills(prevRec?.bills || {},   UTIL_POSTPAID_KEYS);
        const total     = round2(prepaid + postpaid);
        const perHead   = members.length > 0 ? round2(total / members.length) : 0;
        const payments  = r.payments || {};
        const collected = round2(Object.values(payments).reduce((s, p) => s + Number(p.paid || 0), 0));
        const rate      = total > 0 ? Math.min(100, Math.round((collected / total) * 100)) : 0;

        // Per-member status counts
        const memberStates = members.map(m => (payments[m.name]?.status) || "unpaid");
        const paidCount   = memberStates.filter(s => s === "paid").length;
        const totalCount  = members.length || memberStates.length;
        const allPaid     = totalCount > 0 && memberStates.every(s => s === "paid");
        const anyUnpaid   = memberStates.some(s => s === "unpaid");
        const status      = allPaid
          ? "complete"
          : anyUnpaid && paidCount === 0
            ? "pending"
            : "partial";

        const sCfg = {
          complete: { cls: "badge-green", label: "✓ Complete", bar: "var(--green)", border: "rgba(39,174,96,.35)" },
          partial:  { cls: "badge-amber", label: "⚠ Partial",  bar: "var(--amber)", border: "rgba(243,156,18,.35)" },
          pending:  { cls: "badge-red",   label: "✗ Pending",  bar: "var(--red)",   border: "rgba(231,76,60,.35)"  },
        }[status];

        const unpaidNames = members.filter(m => (payments[m.name]?.status || "unpaid") !== "paid").map(m => m.name);
        const dueList = unpaidNames.length === 0
          ? '<span style="color:var(--green);font-weight:600">All cleared 🎉</span>'
          : `<span style="color:var(--text2)">Pending: ${unpaidNames.slice(0,3).join(", ")}${unpaidNames.length>3?` +${unpaidNames.length-3}`:""}</span>`;

        return `
          <div class="profile-card" style="
            padding:14px 14px 12px;
            border:1px solid ${sCfg.border};
            display:flex;flex-direction:column;gap:10px
          ">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div>
                <div style="font-family:var(--font-serif);font-size:17px;font-weight:700;line-height:1.1">
                  ${monthLabelFromKey(r.month_key)}
                </div>
                <div style="font-size:11px;color:var(--text3);margin-top:2px">
                  postpaid from ${monthLabelFromKey(prev.key)}
                </div>
              </div>
              <span class="badge ${sCfg.cls}" style="font-size:10px;white-space:nowrap">${sCfg.label}</span>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div style="background:var(--bg3);border-radius:6px;padding:7px 9px">
                <div style="font-size:10px;color:var(--blue);text-transform:uppercase;letter-spacing:.5px">🔵 Prepaid</div>
                <div style="font-size:14px;font-weight:700;margin-top:1px">${fmtTk(prepaid)}</div>
              </div>
              <div style="background:var(--bg3);border-radius:6px;padding:7px 9px">
                <div style="font-size:10px;color:var(--red);text-transform:uppercase;letter-spacing:.5px">🔴 Postpaid</div>
                <div style="font-size:14px;font-weight:700;margin-top:1px">${fmtTk(postpaid)}</div>
              </div>
              <div style="background:var(--bg3);border-radius:6px;padding:7px 9px">
                <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Total payable</div>
                <div style="font-size:14px;font-weight:700;margin-top:1px">${fmtTk(total)}</div>
                <div style="font-size:10px;color:var(--text3)">${fmtTk(perHead)} per member</div>
              </div>
              <div style="background:var(--bg3);border-radius:6px;padding:7px 9px">
                <div style="font-size:10px;color:var(--green);text-transform:uppercase;letter-spacing:.5px">Collected</div>
                <div style="font-size:14px;font-weight:700;margin-top:1px;color:var(--green)">${fmtTk(collected)}</div>
                <div style="font-size:10px;color:var(--text3)">${paidCount}/${totalCount} done</div>
              </div>
            </div>

            <div>
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-bottom:3px">
                <span>Collection rate</span><span><b style="color:var(--text2)">${rate}%</b></span>
              </div>
              <div style="height:6px;background:var(--bg3);border-radius:99px;overflow:hidden">
                <div style="height:100%;width:${rate}%;background:${sCfg.bar};transition:width .4s"></div>
              </div>
            </div>

            <div style="font-size:11px;line-height:1.4">
              ${dueList}
            </div>
          </div>`;
      }).join("")}
    </div>`;
}
