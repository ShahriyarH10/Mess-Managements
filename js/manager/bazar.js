/* ═══════════════════════════════════════════════
   MANAGER — Utility: prepaid/postpaid bill entry + smart payment tracking
   ═══════════════════════════════════════════════ */

async function renderUtility(el) {
  const n    = new Date();
  const opts = buildMonthOptions(n.getMonth(), n.getFullYear());

  const monthPick = (prefix, onLoad) => `
    <div class="ut-pick">
      <select class="input" id="${prefix}-month">${opts.monthOptions}</select>
      <select class="input" id="${prefix}-year">${opts.yearOptions}</select>
      <button class="btn btn-ghost btn-sm" onclick="${onLoad}">Load</button>
    </div>`;
  const billField = (id, icon, label) => `
    <div class="field ut-field"><label>${icon} ${label}</label>
      <div class="ml-amt"><span>৳</span><input type="number" class="input" id="${id}" min="0" placeholder="0" oninput="updUtilityPreview()"/></div></div>`;

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Utility Entry</div>
      <div class="page-sub">Enter the month's bills, then track what each member has paid</div>
    </div>
  </div>
  <div class="content dk">

    <div class="ut-bills">
      <div class="card ut-bill ut-pre">
        <div class="dk-card-title"><span>🔵 Prepaid · this month</span></div>
        <div class="ut-help">Electricity, gas and WiFi for the <b>current</b> settlement month.</div>
        ${monthPick("ut-pre", "loadUtilityGroup('prepaid')")}
        <div class="ut-fields">
          ${billField("ut-elec", "⚡", "Electricity")}
          ${billField("ut-gas", "🔥", "Gas")}
          ${billField("ut-wifi", "📶", "WiFi")}
        </div>
        <div class="ut-foot">
          <div class="ent-pills"><span class="ent-pill">Total <b id="ut-pre-total">৳0</b></span><span class="ent-pill ent-d">Each <b id="ut-pre-share">৳0</b></span></div>
          <button class="btn btn-primary btn-sm" onclick="saveUtilityGroup('prepaid')">Save prepaid</button>
        </div>
      </div>

      <div class="card ut-bill ut-post">
        <div class="dk-card-title"><span>🔴 Postpaid · last month</span></div>
        <div class="ut-help">Khala and other costs for the <b>previous</b> month — charged in the next settlement.</div>
        ${monthPick("ut-post", "loadUtilityGroup('postpaid')")}
        <div class="ut-fields ut-fields-2">
          ${billField("ut-khala", "👩", "Khala")}
          ${billField("ut-other", "📦", "Other")}
        </div>
        <div class="ut-foot">
          <div class="ent-pills"><span class="ent-pill">Total <b id="ut-post-total">৳0</b></span><span class="ent-pill ent-n">Each <b id="ut-post-share">৳0</b></span></div>
          <button class="btn btn-primary btn-sm" onclick="saveUtilityGroup('postpaid')">Save postpaid</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="dk-card-title"><span>💳 Member payments</span>${monthPick("ut-pay", "loadUtilityPayments()")}</div>
      <div class="ut-help">Each member owes this month's prepaid + last month's postpaid, split equally. Type what someone paid and their status updates itself.</div>

      <div id="ut-summary-bar" style="display:none" class="ut-summary">
        <div class="ent-pills">
          <span class="ent-pill">Each owes <b id="ut-per-head">৳0</b></span>
          <span class="ent-pill ent-d">Prepaid <b id="ut-cur-prepaid">৳0</b></span>
          <span class="ent-pill ent-n">Postpaid <b id="ut-prev-postpaid">৳0</b></span>
          <span class="ent-pill ent-g">Collected <b id="ut-total-collected">৳0</b></span>
        </div>
        <div class="dk-bar ut-progress"><i id="ut-progress" style="width:0%;background:var(--green)"></i></div>
      </div>

      <div id="ut-payment-table">
        <div class="empty" style="padding:24px;text-align:center">
          <div style="font-size:24px;margin-bottom:6px">💳</div>
          Pick a month and press <b>Load</b> to manage payments
        </div>
      </div>

      <div id="ut-payment-actions" style="display:none" class="ent-foot">
        <button class="btn btn-ghost" onclick="markAllUtilPaid()">✓ Mark all fully paid</button>
        <button class="btn btn-primary" onclick="saveUtilityPayments()">💾 Save payments</button>
      </div>
    </div>

    <div class="card">
      <div class="dk-card-title"><span>📋 Utility history</span></div>
      <div id="ut-history"><div class="loading"><div class="spinner"></div>Loading…</div></div>
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
  const { data: rec } = await getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle();
  const bills = rec?.bills || {};
  if (type === "prepaid") {
    ["elec", "gas", "wifi"].forEach(k => { const i = document.getElementById("ut-" + k); if (i) i.value = bills[k] || ""; });
  } else {
    ["khala", "other"].forEach(k => { const i = document.getElementById("ut-" + k); if (i) i.value = bills[k] || ""; });
  }
  updUtilityPreview();
}

async function saveUtilityGroup(type) {
  if (!requireManager('saveUtilityGroup')) return;
  const { month, year, key } = getUtilityGroupKey(type);
  if (await isMonthLocked(key)) { toast("🔒 " + monthLabelFromKey(key) + " is locked — unlock it first", "error"); return; }
  const { data: rec } = await getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle();
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
    <div class="ut-rows">
      <div class="ut-row ut-row-head"><span>Member</span><span>Owes</span><span>Paid</span><span>Status</span><span>Note</span></div>
      ${members.map((m, i) => {
        const p       = payments[m.name] || {};
        const credit  = round2(Number(messCredit[m.name] || 0));
        const paid    = Number(p.paid || 0);
        // Carry-forward reduces what the member owes, not what they paid
        const effectiveDue = round2(Math.max(0, perHead - credit));
        const status  = p.status || "unpaid";
        const col     = avatarCol(i);
        return `
        <div class="ut-row" id="utr-${m.id}" data-status="${status}">
          <div class="dk-who"><span class="dk-av" style="background:${col.bg};color:${col.fg}">${avFace(m.id, m.name)}</span>${m.name}</div>
          <div class="ut-due"><b>${fmtTk(effectiveDue)}</b>${credit > 0 ? `<div class="dk-mini" style="color:var(--blue)">↩ ${fmtTk(credit)} carried</div>` : ""}</div>
          <div class="ml-amt ut-paid"><span>৳</span><input type="number" class="input input-sm" id="up-${m.id}" value="${paid}" min="0" step="1"
            data-due="${effectiveDue}" oninput="onUtilPaidInput('${m.id}', ${effectiveDue})"/></div>
          <select class="input input-sm ut-status" id="ust-${m.id}" onchange="utStatusChanged(this)">
            <option value="unpaid" ${status === "unpaid" ? "selected" : ""}>⏳ Not paid</option>
            <option value="partial" ${status === "partial" ? "selected" : ""}>⚠️ Partial</option>
            <option value="paid" ${status === "paid" ? "selected" : ""}>✅ Paid</option>
          </select>
          <input type="text" class="input input-sm ut-note" id="un-${m.id}" placeholder="Note" value="${p.notes || ""}"/>
        </div>`;
      }).join("")}
    </div>`;

  if (actions)  actions.style.display  = "block";
  if (summary)  summary.style.display  = "block";
  updateSummaryBar(perHead, payments, messCredit);
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
    const row = document.getElementById("utr-" + memberId);
    if (row) row.dataset.status = statEl.value;
  }

  // Update summary totals
  updateSummaryTotals(perHead);
}

function updateSummaryTotals(perHead, messCredit = {}) {
  let totalDue = 0;
  let totalCollected = 0;
  members.forEach(m => {
    const credit = round2(Number((messCredit)[m.name] || 0));
    // Read effective due from the input's data-due attribute if available
    const inputEl = document.getElementById("up-" + m.id);
    const effectiveDue = inputEl
      ? round2(parseFloat(inputEl.dataset.due ?? (perHead - credit)))
      : round2(Math.max(0, perHead - credit));
    totalDue       += effectiveDue;
    totalCollected += parseFloat(inputEl?.value || 0);
  });
  totalDue       = round2(totalDue);
  totalCollected = round2(totalCollected);

  const set = (id, v, color) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = fmtTk(v); if (color) el.style.color = color; }
  };
  set("ut-total-collected", totalCollected, "var(--green)");
  const bar = document.getElementById("ut-progress");
  if (bar) bar.style.width = (totalDue > 0 ? Math.min(100, Math.round((totalCollected / totalDue) * 100)) : 0) + "%";
}

function updateSummaryBar(perHead, payments, messCredit = {}) {
  updateSummaryTotals(perHead, messCredit);
}

async function loadUtilityPayments() {
  const { key } = getPaymentKey();
  const prev = previousMonthFromKey(key);

  const [currentRes, previousRes] = await Promise.all([
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle(),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", prev.key).maybeSingle(),
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

  const rawMessCredit   = currentUtilRec?.bills?.mess_credit   || {};
  const rawChangeCredit = currentUtilRec?.bills?.change_credit || {};

  // Merge both credit sources per member into a single credit map
  const messCredit = {};
  members.forEach(m => {
    messCredit[m.name] = round2(
      Number(rawMessCredit[m.name]   || 0) +
      Number(rawChangeCredit[m.name] || 0)
    );
  });

  buildUtilPaymentTable(perHead, currentUtilRec?.payments || {}, messCredit);
}

function markAllUtilPaid() {
  members.forEach(m => {
    const paidEl = document.getElementById("up-" + m.id);
    const statEl = document.getElementById("ust-" + m.id);
    if (paidEl) {
      // Use the per-member effective due (after credit deduction) stored in data-due
      const due = parseFloat(paidEl.dataset.due ?? _utPerHead);
      paidEl.value = due;
    }
    if (statEl) { statEl.value = "paid"; utStatusChanged(statEl); }
  });
  updateSummaryTotals(_utPerHead);
}

/* Tint the member row by its status (CSS: .ut-row[data-status]). */
function utStatusChanged(sel) {
  const row = sel && sel.closest(".ut-row");
  if (row) row.dataset.status = sel.value;
}

async function saveUtilityPayments() {
  if (!requireManager('saveUtilityPayments')) return;
  const { month, year, key } = getPaymentKey();
  if (await isMonthLocked(key)) { toast("🔒 " + monthLabelFromKey(key) + " is locked — unlock it first", "error"); return; }
  const { data: rec } = await getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle();
  const old = rec?.payments || {};
  const payments = { ...old };
  members.forEach(m => {
    payments[m.name] = {
      ...(old[m.name] || {}),   // keep meal_paid / prev_due_paid written by Collect Payment
      paid:   parseFloat(document.getElementById("up-"  + m.id)?.value || 0),
      status: document.getElementById("ust-" + m.id)?.value || "unpaid",
      notes:  cleanText(document.getElementById("un-"  + m.id)?.value || ""),
    };
  });
  try {
    await dbUpsertUtility(month, year, key, rec?.bills || {}, payments);
    toast("Utility payments saved ✓", "success");
    for (const m of members) {
      const added = round2(Number(payments[m.name].paid || 0) - Number(old[m.name]?.paid || 0));
      if (added > 0.01) await recordCreditedReceipt({ member: m, month, year, amount: added, source: "manager", split: { allocUtil: added } });
    }
    await loadUtilHistory();
  } catch (e) { toast("Error: " + e.message, "error"); }
}

async function loadUtilHistory() {
  const wrap = document.getElementById("ut-history");
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  const { data: all } = await getClient().from("utility_payments").select("*").eq("mess_id", messId()).order("month_key", { ascending: false });
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
