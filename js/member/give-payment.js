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

/* ── Receipt: the same card the manager gets after Collect Payment → Save (collect-receipt.js) ── */

function paymentReceiptData(p) {
  const sp = p.split;
  const mgr = ["manager", "sub_manager", "superadmin"].includes(currentUser?.role);
  const m = mgr ? (typeof members !== "undefined" ? members : []).find(x => x.id === p.member_id) : null;
  return {
    // member names are HTML-escaped by the receipt, so hand it escaped plain text
    member: { name: escapeHtml(paymentMemberName(p)), phone: m?.phone || "" },
    monthLabel: monthLabelFromKey(p.month_key),
    amountReceived: Number(p.amount),
    allocMeal: sp?.allocMeal || 0, allocUtil: sp?.allocUtil || 0, allocRent: sp?.allocRent || 0,
    allocPrevDue: sp?.allocPrevDue || 0, change: sp?.change || 0,
    hasBreakdown: !!sp,
    newNet: p.status === "confirmed" && p.still_due != null ? Number(p.still_due) : null,
    timestamp: new Date(p.created_at),
    receiptNo: paymentReceiptNo(p.receipt_no),
    status: p.status,
    confirmedBy: p.status === "pending" ? "" : escapeHtml(p.confirmed_by || "manager"),
    confirmedAt: p.confirmed_at ? new Date(p.confirmed_at) : null,
  };
}

function showPaymentReceipt(id) {
  const p = _paymentCache.get(id);
  if (!p) { toast("Receipt not found — refresh and try again", "error"); return; }
  showCollectReceipt(paymentReceiptData(p));
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
    const r = ctx.row;
    const sp = computeSplit3(value, r.mealRem, r.utilRem, r.rentRem, r.prevDue);
    const newMealRem = round2(r.mealRem - sp.allocMeal);
    const newUtilRem = round2(r.utilRem - sp.allocUtil);
    const newRentRem = round2(r.rentRem - sp.allocRent);
    const newNet     = round2(r.total - round2(value - sp.change));
    await loadGivePayment(false);
    /* Same receipt the manager gets after Collect Payment → Save (projected, until confirmed). */
    showCollectReceipt({
      member: { ...ctx.member, phone: "" }, // WhatsApp opens the contact picker, not the member's own number
      monthLabel: monthLabelFromKey(ctx.key),
      amountReceived: value,
      allocMeal: sp.allocMeal, allocUtil: sp.allocUtil, allocRent: sp.allocRent,
      allocPrevDue: sp.allocPrevDue, change: sp.change,
      newUtilRem, newRentRem, newMealRem, newNet,
      timestamp: new Date(payment.created_at || Date.now()),
      status: "pending",
      receiptNo: paymentReceiptNo(payment.receipt_no),
    });
  } catch (e) {
    toast("Error: " + e.message, "error");
  } finally {
    _giveBusy = false;
    const b = document.getElementById("gp-send");
    if (b) b.disabled = false;
  }
}
