/* ═══════════════════════════════════════════════
   MEMBER — Give Payment
   A member tells the manager what they are paying for a month. That files a
   "pending" request in member_payments and notifies the managers; nothing is
   credited to rent / utility / meals until a manager confirms it in Collect
   Payment (js/manager/payment-requests.js), which applies the same
   Prev.Due → Rent → Utility → Meal waterfall as a cash collection.

   This file is loaded for both roles (SCRIPT_GROUPS.shared): it also holds the
   pieces the manager side reuses — loadMemberCollectRow() and the receipt
   builders / modal.
   ═══════════════════════════════════════════════ */

const PAY_STATUS = {
  pending:   { label: "Pending",   cls: "badge-amber" },
  confirmed: { label: "Confirmed", cls: "badge-green" },
  rejected:  { label: "Rejected",  cls: "badge-red"   },
};

let _giveCtx = null;
let _giveBusy = false;
/* id → payment, filled by every list that can open a receipt */
const _paymentCache = new Map();

/* ── Small helpers ─────────────────────────────── */

/* members[] comes through sanitize() (HTML-escaped); receipts want plain text. */
function _decodeEntities(s) {
  return new DOMParser().parseFromString(String(s ?? ""), "text/html").documentElement.textContent || "";
}

/* Resolve the display name from the member list, never trusting the stored copy. */
function paymentMemberName(p) {
  const m = (typeof members !== "undefined" ? members : []).find(x => x.id === p.member_id);
  return m ? _decodeEntities(m.name) : String(p.member_name ?? "Member");
}

function paymentReceiptNo(n) { return "#" + String(n ?? 0).padStart(6, "0"); }

function _payDate(iso) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function _payStatus(p) { return PAY_STATUS[p.status] || PAY_STATUS.pending; }

/* Ids go inside onclick="fn('…')" — only ever let uuid-shaped values through. */
function _safeId(id) { return /^[\w-]+$/.test(String(id)) ? String(id) : ""; }

function _cachePayments(list) { list.forEach(p => _paymentCache.set(p.id, p)); }

/* ── This member's settlement for a month (same numbers Collect Payment shows) ── */
async function loadMemberCollectRow(member, month, year) {
  const key = monthKey(year, month);
  const [allMeals, allBazar, allRent, utilRes] = await Promise.all([
    dbGetAll("meals"),
    dbGetAll("bazar"),
    dbGetAll("rent"),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()),
  ]);
  if (utilRes.error) throw utilRes.error;
  const allUtil = utilRes.data || [];
  const rentRec  = allRent.find(r => r.month_key === key) || null;
  const utilRec  = allUtil.find(u => u.month_key === key) || null;
  const utilPrev = allUtil.find(u => u.month_key === previousMonthFromKey(key).key) || null;

  const p       = calcMemberSettlement(member, allMeals, allBazar, rentRec, utilRec, utilPrev, key);
  const prevDue = round2(calcPrevDueForMember(member, allMeals, allBazar, allRent, allUtil, key));
  const utilDue = round2(Math.max(0, p.prepaidUtility + p.postpaidUtility - p.messCredit));
  return {
    key, month, year,
    mealRem:    round2(p.mealCost - p.memberBazar - p.mealPaid),
    utilRem:    round2(Math.max(0, utilDue - p.utilityPaid)),
    rentRem:    round2(Math.max(0, p.roomRent - p.roomRentPaid)),
    utilDue,    utilPaid: p.utilityPaid,
    rentDue:    p.roomRent, rentPaid: p.roomRentPaid,
    prevDue,
    netPayable: p.netPayable,
    total:      round2(p.netPayable + prevDue),
    pendingChange: round2(Number(((utilRec?.bills || {}).pending_change || {})[member.name] || 0)),
  };
}

/* ── Receipts (shared with the manager's Collect page) ── */

function buildPaymentReceiptText(p) {
  const messName = _decodeEntities(currentMess?.name || "Mess");
  const label = monthLabelFromKey(p.month_key);
  const L = [];
  L.push(p.status === "confirmed" ? "💵 PAYMENT RECEIPT" : p.status === "rejected" ? "✖ PAYMENT REJECTED" : "🕓 PAYMENT REQUEST");
  L.push("─────────────────────");
  L.push(`Receipt: ${paymentReceiptNo(p.receipt_no)}`);
  L.push(`Mess:    ${messName}`);
  L.push(`Member:  ${paymentMemberName(p)}`);
  L.push(`Month:   ${label}`);
  L.push(`Date:    ${_payDate(p.created_at)}`);
  L.push("");
  L.push(`Amount ${p.status === "confirmed" ? "received" : "offered"}:  ${fmtTk(Number(p.amount))}`);
  L.push("─────────────────────");
  const by = p.confirmed_by || "manager";
  if (p.status === "confirmed") {
    const sp = p.split;
    if (sp) {
      if (sp.allocPrevDue > 0) L.push(`→ Prev. Due: ${fmtTk(sp.allocPrevDue)}`);
      if (sp.allocMeal    > 0) L.push(`→ Meal:      ${fmtTk(sp.allocMeal)}`);
      if (sp.allocUtil    > 0) L.push(`→ Utility:   ${fmtTk(sp.allocUtil)}`);
      if (sp.allocRent    > 0) L.push(`→ Rent:      ${fmtTk(sp.allocRent)}`);
      if (sp.change       > 0) L.push(`Change returned: ${fmtTk(sp.change)}`);
      L.push("─────────────────────");
    }
    if (p.still_due != null) L.push(_paymentBalanceLine(Number(p.still_due), label));
    L.push(`Confirmed by ${by}${p.confirmed_at ? " · " + _payDate(p.confirmed_at) : ""}`);
  } else if (p.status === "rejected") {
    L.push(`Rejected by ${by} — not counted.`);
  } else {
    L.push("⚠ Not yet confirmed by the manager.");
    L.push("This is NOT proof of payment received.");
  }
  return L.join("\n");
}

function _paymentBalanceLine(stillDue, label) {
  return stillDue > 0.005 ? `Still due: ${fmtTk(stillDue)}`
    : stillDue < -0.005   ? `Mess owes you ${fmtTk(Math.abs(stillDue))}`
    : `Fully settled for ${label}`;
}

function buildPaymentReceiptHtml(p) {
  const esc = escapeHtml;
  const messName = _decodeEntities(currentMess?.name || "Mess");
  const label = monthLabelFromKey(p.month_key);
  const row = (l, v, color = "#1a1816") =>
    `<tr><td style="padding:6px 0;color:#6b6560">${l}</td><td style="padding:6px 0;text-align:right;font-weight:700;color:${color}">${v}</td></tr>`;
  const title = p.status === "confirmed" ? "Payment Receipt" : p.status === "rejected" ? "Payment Rejected" : "Payment Request";
  const sp = p.split;
  const allocRows = sp ? [
    sp.allocPrevDue > 0 ? row("Previous due", fmtTk(sp.allocPrevDue), "#e05252") : "",
    sp.allocRent    > 0 ? row("Room rent",    fmtTk(sp.allocRent),    "#b8914a") : "",
    sp.allocUtil    > 0 ? row("Utility",      fmtTk(sp.allocUtil),    "#5b9bd5") : "",
    sp.allocMeal    > 0 ? row("Meal balance", fmtTk(sp.allocMeal),    "#9b7fd4") : "",
    sp.change       > 0 ? row("Change returned", fmtTk(sp.change),    "#4caf82") : "",
  ].join("") : "";
  const by = esc(p.confirmed_by || "manager");
  const banner = p.status === "pending"
    ? `<div class="warn">Not yet confirmed by the manager.<br/>This is not proof that the payment was received.</div>`
    : p.status === "rejected"
      ? `<div class="warn">Rejected by ${by} — this payment was not counted.</div>`
      : `<div class="ok">Confirmed by ${by}${p.confirmed_at ? "<br/>" + esc(_payDate(p.confirmed_at)) : ""}</div>`;
  const balance = p.status === "confirmed" && p.still_due != null
    ? `<div class="hr"></div><div class="hero"><span>Balance</span><b>${esc(_paymentBalanceLine(Number(p.still_due), label))}</b></div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title>
  <style>body{font-family:-apple-system,Roboto,Arial,sans-serif;color:#1a1816;padding:28px;max-width:420px;margin:0 auto}
  h1{font-size:20px;margin:0 0 2px}.sub{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#9a9690;margin-bottom:18px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  .hero{background:#f0ede8;border-radius:10px;padding:14px 16px;margin:14px 0;display:flex;justify-content:space-between;align-items:center}
  .hero b{font-size:20px}.hr{border-top:2px dashed #ddd;margin:14px 0}.foot{font-size:10px;color:#9a9690;text-align:center;margin-top:18px}
  .warn{background:#fdf3e1;color:#8a5a00;border-radius:8px;padding:10px 12px;font-size:12px;margin-top:14px}
  .ok{background:#e6f5ee;color:#1d7a4f;border-radius:8px;padding:10px 12px;font-size:12px;margin-top:14px}</style></head>
  <body>
    <h1>${esc(messName)}</h1><div class="sub">${esc(title)}</div>
    <table>
      ${row("Receipt no.", paymentReceiptNo(p.receipt_no))}
      ${row("Member", esc(paymentMemberName(p)))}
      ${row("Month", esc(label))}
      ${row("Date", esc(_payDate(p.created_at)))}
    </table>
    <div class="hero"><span>Amount ${p.status === "confirmed" ? "received" : "offered"}</span><b>${fmtTk(Number(p.amount))}</b></div>
    ${allocRows ? `<div class="sub">Allocation</div><table>${allocRows}</table>` : ""}
    ${balance}
    ${banner}
    <div class="foot">Generated by MessManager</div>
  </body></html>`;
}

function showPaymentReceipt(id) {
  const p = _paymentCache.get(id);
  if (!p) { toast("Receipt not found — refresh and try again", "error"); return; }
  window._lastPayReceipt = p;
  const st = _payStatus(p);
  document.getElementById("modal-content").innerHTML = `
    <div style="max-width:420px;margin:0 auto">
      <div style="text-align:center;padding:4px 0 14px;border-bottom:2px dashed var(--border2);margin-bottom:14px">
        <div style="font-size:30px;line-height:1;margin-bottom:6px">🧾</div>
        <div style="font-family:var(--font-serif);font-size:21px;font-weight:700;color:var(--text)">${escapeHtml(_decodeEntities(currentMess?.name || "Mess"))}</div>
        <span class="badge ${st.cls}" style="margin-top:8px">${st.label}</span>
      </div>
      <pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.55;color:var(--text);background:var(--bg3);border-radius:8px;padding:12px 14px;margin:0">${escapeHtml(buildPaymentReceiptText(p))}</pre>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:14px">
        <button class="btn btn-primary btn-sm" onclick="copyPaymentReceipt(this)" style="flex:1;justify-content:center">📋 Copy</button>
        <button class="btn btn-ghost btn-sm" onclick="printPaymentReceipt()" style="flex:1;justify-content:center">🖨 Print</button>
        <button class="btn btn-ghost btn-sm" onclick="closeModal()" style="flex:1;justify-content:center">✕ Close</button>
      </div>
    </div>`;
  document.querySelector(".modal").classList.remove("modal-wide");
  openModal();
}

async function copyPaymentReceipt(btn) {
  const p = window._lastPayReceipt;
  if (!p) return;
  const text = buildPaymentReceiptText(p);
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { const o = btn.textContent; btn.textContent = "✓ Copied"; setTimeout(() => btn.textContent = o, 1600); }
    toast("Receipt copied to clipboard", "success");
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Receipt copied", "success"); }
    catch (__) { toast("Copy failed — select the receipt text and copy it manually", "error"); }
    document.body.removeChild(ta);
  }
}

function printPaymentReceipt() {
  const p = window._lastPayReceipt;
  if (!p) { toast("No receipt to print", "error"); return; }
  const html = buildPaymentReceiptHtml(p);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  let w, frame;
  if (isSafari) {
    w = window.open("", "_blank", "width=480,height=700");
    if (!w) { toast("Pop-up blocked — allow pop-ups to print", "error"); return; }
  } else {
    frame = document.getElementById("_pay-print-frame");
    if (frame) frame.remove();
    frame = document.createElement("iframe");
    frame.id = "_pay-print-frame";
    frame.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;";
    document.body.appendChild(frame);
    w = frame.contentWindow;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  if (isSafari) setTimeout(() => { w.focus(); w.print(); }, 250);
  else frame.onload = () => setTimeout(() => { w.focus(); w.print(); }, 250);
}

/* ═══════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════ */

async function renderGivePayment(el) {
  const member = await getMe();
  if (!member) {
    el.innerHTML = `<div class="content"><div class="empty">Profile not found</div></div>`;
    return;
  }
  const n = new Date();
  const opts = buildMonthOptions(n.getMonth(), n.getFullYear());
  _giveCtx = { member, sent: null, token: 0 };

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Give Payment</div>
      <div class="page-sub">Tell the manager what you're paying — they confirm it</div>
    </div>
  </div>

  <div class="content">
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <select class="input" id="gp-month" style="width:148px" onchange="loadGivePayment(true)">${opts.monthOptions}</select>
        <select class="input" id="gp-year"  style="width:92px"  onchange="loadGivePayment(true)">${opts.yearOptions}</select>
        <span style="font-size:12px;color:var(--text3)">Settlement month</span>
      </div>
    </div>

    <div id="gp-sent"></div>
    <div id="gp-body" style="margin-bottom:14px"><div class="loading" style="min-height:120px"><div class="spinner"></div>Loading your balance…</div></div>
    <div class="card" id="gp-history"></div>
  </div>

  <style>
    .gp-line{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}
    .gp-line span:first-child{color:var(--text2)}
    .gp-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;min-height:26px}
    .gp-chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700}
    .gp-amt{font-size:18px!important;font-weight:700!important;text-align:right;padding:10px 13px 10px 26px!important}
  </style>`;

  await loadGivePayment(false);
}

async function loadGivePayment(resetSent) {
  const ctx = _giveCtx;
  if (!ctx || !document.getElementById("gp-body")) return;
  const month = parseInt(document.getElementById("gp-month")?.value ?? new Date().getMonth());
  const year  = parseInt(document.getElementById("gp-year")?.value  ?? new Date().getFullYear());
  const token = ++ctx.token;
  if (resetSent) ctx.sent = null;

  try {
    const [row, payments] = await Promise.all([
      loadMemberCollectRow(ctx.member, month, year),
      dbGetMemberPayments({ memberId: ctx.member.id }),
    ]);
    if (token !== ctx.token || !document.getElementById("gp-body")) return; // superseded / navigated away
    _cachePayments(payments);
    Object.assign(ctx, { month, year, key: row.key, row, payments });
    ctx.waiting = round2(payments
      .filter(p => p.status === "pending" && p.month_key === row.key)
      .reduce((s, p) => s + Number(p.amount), 0));
    buildGivePayment();
  } catch (e) {
    if (token !== ctx.token) return;
    const body = document.getElementById("gp-body");
    if (body) body.innerHTML = `<div class="card"><div class="empty">Could not load: ${escapeHtml(e.message)}</div>
      <div style="text-align:center"><button class="btn btn-ghost btn-sm" onclick="loadGivePayment(false)">Retry</button></div></div>`;
  }
}

function _gpLine(label, value, surplus) {
  if (value === 0 && !surplus) return `<div class="gp-line"><span>${label}</span><span style="color:var(--text3)">✓ 0</span></div>`;
  return `<div class="gp-line"><span>${label}</span><span style="font-weight:600;color:${surplus ? "var(--green)" : "var(--red)"}">${surplus ? "+" + fmtTk(Math.abs(value)) : fmtTk(value)}</span></div>`;
}

function buildGivePayment() {
  const ctx = _giveCtx, r = ctx.row;
  const owed    = r.total < -0.01;
  const settled = r.total <= 0.01;
  const left    = round2(r.total - ctx.waiting);

  const sent = document.getElementById("gp-sent");
  sent.innerHTML = ctx.sent ? `
    <div class="card" style="margin-bottom:14px;text-align:center;border-color:var(--green)">
      <div style="font-size:30px">✅</div>
      <div style="font-size:16px;font-weight:800;margin-top:4px">${fmtTk(Number(ctx.sent.amount))} sent to the manager</div>
      <div style="font-size:12px;color:var(--text3);margin-top:5px">Receipt ${paymentReceiptNo(ctx.sent.receipt_no)} is pending. It becomes official once the manager confirms it.</div>
    </div>` : "";

  document.getElementById("gp-body").innerHTML = `
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px">
      <div style="font-size:16px;font-weight:800">${ctx.member.name}</div>
      <div style="text-align:right">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">${owed ? "Mess owes you" : "Total due"}</div>
        <div style="font-size:20px;font-weight:800;color:${settled ? "var(--green)" : "var(--red)"}">${fmtTk(Math.abs(r.total))}</div>
      </div>
    </div>

    ${_gpLine("Previous due", r.prevDue)}
    ${_gpLine("Rent", r.rentRem)}
    ${_gpLine("Utility", r.utilRem)}
    ${_gpLine("Meal balance", r.mealRem, r.mealRem < 0)}

    ${ctx.waiting > 0 ? `<div style="background:var(--accent-bg);border-radius:8px;padding:10px 12px;margin-top:12px;font-size:12px;font-weight:600;color:var(--accent)">
      ${fmtTk(ctx.waiting)} is waiting for the manager to confirm.</div>` : ""}

    ${settled ? `
      <div style="font-size:13px;color:var(--green);margin-top:14px">
        ${owed ? "You have nothing to pay — the manager will return your balance."
               : `✓ You are fully settled for ${escapeHtml(monthLabelFromKey(ctx.key))}.`}
      </div>` : `
      <div class="field" style="margin-top:16px;margin-bottom:0">
        <label>Amount you are giving (৳)</label>
        <div style="position:relative">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:15px;font-weight:700;color:var(--text3);pointer-events:none">৳</span>
          <input type="number" class="input gp-amt" id="gp-amount" min="0" step="1" placeholder="e.g. 1500"
                 value="${left > 0.01 ? left : ""}" oninput="onGiveAmtInput()"
                 onkeydown="if(event.key==='Enter') submitGivePayment()"/>
        </div>
      </div>
      <div class="gp-chips" id="gp-chips"></div>
      <button class="btn btn-primary" id="gp-send" onclick="submitGivePayment()" style="margin-top:14px;width:100%;justify-content:center">Send payment to manager</button>
      <div style="font-size:11px;color:var(--text3);margin-top:8px">
        Nothing is credited until the manager confirms. Split order: previous due → rent → utility → meal.
      </div>`}
  </div>`;

  onGiveAmtInput();
  buildGiveHistory();
}

function onGiveAmtInput() {
  const ctx = _giveCtx, chips = document.getElementById("gp-chips");
  if (!ctx || !ctx.row || !chips) return;
  const v = round2(parseFloat(document.getElementById("gp-amount")?.value) || 0);
  if (v <= 0) { chips.innerHTML = ""; return; }
  const r = ctx.row;
  const s = computeSplit3(v, r.mealRem, r.utilRem, r.rentRem, r.prevDue);
  const chip = (txt, bg, fg) => `<span class="gp-chip" style="background:var(${bg});color:var(${fg})">${txt}</span>`;
  chips.innerHTML = [
    s.allocPrevDue > 0 ? chip("⏪ Prev " + fmtTk(s.allocPrevDue), "--red-bg",    "--red")    : "",
    s.allocRent    > 0 ? chip("🏠 Rent " + fmtTk(s.allocRent),    "--accent-bg", "--accent") : "",
    s.allocUtil    > 0 ? chip("⚡ Util " + fmtTk(s.allocUtil),    "--blue-bg",   "--blue")   : "",
    s.allocMeal    > 0 ? chip("🍽️ Meal " + fmtTk(s.allocMeal),    "--purple-bg", "--purple") : "",
    s.change       > 0 ? chip("💸 Extra " + fmtTk(s.change),      "--green-bg",  "--green")  : "",
  ].join("");
}

function buildGiveHistory() {
  const ctx = _giveCtx, wrap = document.getElementById("gp-history");
  if (!wrap) return;
  const list = ctx.payments;
  wrap.innerHTML = `<div class="card-title">My payments</div>` + (list.length === 0
    ? `<div class="empty">No payments yet</div>`
    : `<div class="tbl-wrap"><table>
        <thead><tr><th>Month</th><th>Receipt</th><th>Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map(p => {
          const st = _payStatus(p);
          return `<tr>
            <td><b>${escapeHtml(monthLabelFromKey(p.month_key))}</b><div style="font-size:11px;color:var(--text3)">${escapeHtml(new Date(p.created_at).toLocaleDateString("en-IN"))}</div></td>
            <td style="font-family:monospace;font-size:12px">${paymentReceiptNo(p.receipt_no)}</td>
            <td style="font-weight:700">${fmtTk(Number(p.amount))}</td>
            <td><span class="badge ${st.cls}">${st.label}</span></td>
            <td style="text-align:right"><button class="btn btn-ghost btn-sm" onclick="showPaymentReceipt('${_safeId(p.id)}')">Receipt</button></td>
          </tr>`;
        }).join("")}</tbody></table></div>`);
}

async function submitGivePayment() {
  const ctx = _giveCtx;
  if (!ctx || !ctx.row || _giveBusy) return;
  const value = round2(parseFloat(document.getElementById("gp-amount")?.value) || 0);
  if (!(value > 0)) { toast("Enter an amount first", "error"); return; }
  if (value > 10000000) { toast("That amount looks too large — check it", "error"); return; }

  _giveBusy = true;
  const btn = document.getElementById("gp-send");
  if (btn) btn.disabled = true;
  try {
    if (await isMonthLocked(ctx.key)) {
      toast(`${monthLabelFromKey(ctx.key)} is closed by the manager — contact them to pay.`, "error");
      return;
    }
    const payment = await dbCreateMemberPayment({
      memberId:    ctx.member.id,
      memberName:  ctx.member.name,
      monthKey:    ctx.key,
      month:       ctx.month,
      year:        ctx.year,
      amount:      value,
      dueAtSubmit: ctx.row.total,
    });
    try {
      await notifyManagerUpdate("payment_request", today(), {
        member: ctx.member.name, paymentId: payment.id, monthKey: ctx.key,
        monthName: MONTHS[ctx.month], year: ctx.year, amount: value,
      }, `Wants to give ${fmtTk(value)} for ${MONTHS[ctx.month]} ${ctx.year} — please confirm`);
    } catch (_) { /* the request itself is saved; the manager still sees it in Collect */ }
    ctx.sent = payment;
    toast("Payment sent to the manager ✓", "success");
    await loadGivePayment(false);
  } catch (e) {
    toast("Error: " + e.message, "error");
  } finally {
    _giveBusy = false;
    const b = document.getElementById("gp-send");
    if (b) b.disabled = false;
  }
}
