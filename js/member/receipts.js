/* ═══════════════════════════════════════════════
   MEMBER — My Receipts + the receipt link page
   Every payment is a row in member_payments, whoever generated it:
     • source "member"  — the member sent it from Give Payment (pending → confirmed / rejected)
     • source "manager" — a manager recorded cash in Collect Payment (stored confirmed)
   "My Receipts" lists them for the signed-in member with this month's live
   balance; #/app/receipt/<id> shows one receipt (members: their own only).

   Loaded for both roles (SCRIPT_GROUPS.shared): managers open receipt links too.
   ═══════════════════════════════════════════════ */

let _rcptList = [];

const _isMgrRole = () => ["manager", "sub_manager", "superadmin"].includes(currentUser?.role);

/* Money actually kept by the mess for a receipt (amount minus change handed back). */
function _rcptKept(p) { return round2(Number(p.amount) - Number(p.split?.change || 0)); }

/* "After this payment" status of one confirmed receipt. */
function _rcptAfter(p) {
  if (p.status !== "confirmed" || p.still_due == null) return "";
  const due = Number(p.still_due);
  return due > 0.01
    ? `<span style="color:var(--red);font-weight:600">Still due ${fmtTk(due)}</span>`
    : due < -0.01
      ? `<span style="color:var(--green);font-weight:600">Mess owes ${fmtTk(Math.abs(due))}</span>`
      : `<span style="color:var(--green);font-weight:600">✓ Fully paid</span>`;
}

async function copyReceiptLinkFor(id) {
  const link = receiptLink(id);
  if (!link) return;
  try { await navigator.clipboard.writeText(link); toast("Receipt link copied", "success"); }
  catch (_) { window.prompt("Copy this receipt link:", link); }
}

/* ═══════════════════════════════════════════════
   My Receipts
   ═══════════════════════════════════════════════ */
async function renderMyReceipts(el) {
  const member = await getMe();
  if (!member) {
    el.innerHTML = `<div class="content"><div class="empty">Profile not found</div></div>`;
    return;
  }
  const n = new Date();
  const [row, list] = await Promise.all([
    loadMemberCollectRow(member, n.getMonth(), n.getFullYear()),
    dbGetMemberPayments({ memberId: member.id, limit: 300 }),
  ]);
  _rcptList = list;
  _cachePayments(list);

  const curKey    = row.key;
  const confirmed = list.filter(p => p.status === "confirmed");
  const paidMonth = round2(confirmed.filter(p => p.month_key === curKey).reduce((s, p) => s + _rcptKept(p), 0));
  const paidAll   = round2(confirmed.reduce((s, p) => s + _rcptKept(p), 0));
  const waiting   = round2(list.filter(p => p.status === "pending").reduce((s, p) => s + Number(p.amount), 0));
  const settled   = row.total <= 0.01;

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">My Receipts</div>
      <div class="page-sub">Every payment you made — whether you sent it or the manager recorded it</div>
    </div>
    <div class="topbar-actions">
      <button class="btn btn-primary btn-sm" onclick="navigate('give-payment')">💵 Give payment</button>
    </div>
  </div>

  <div class="content">
    <div class="card" style="margin-bottom:14px;border-color:${settled ? "rgba(76,175,130,.45)" : "rgba(224,82,82,.35)"};background:${settled ? "var(--green-bg)" : "var(--red-bg)"}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">${escapeHtml(monthLabelFromKey(curKey))}</div>
          <div style="font-size:20px;font-weight:800;margin-top:4px;color:${settled ? "var(--green)" : "var(--red)"}">
            ${row.total < -0.01 ? `Mess owes you ${fmtTk(Math.abs(row.total))}` : settled ? "✓ Fully paid" : `Still due ${fmtTk(row.total)}`}
          </div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px">Live balance — includes rent, utility, meals and any previous due</div>
        </div>
        ${waiting > 0 ? `<span class="badge badge-amber">🕓 ${fmtTk(waiting)} waiting for confirmation</span>` : ""}
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Paid this month</div><div class="stat-value" style="color:var(--green)">${fmtTk(paidMonth)}</div></div>
      <div class="stat-card"><div class="stat-label">Paid in total</div><div class="stat-value">${fmtTk(paidAll)}</div></div>
      <div class="stat-card"><div class="stat-label">Receipts</div><div class="stat-value">${list.length}</div></div>
      <div class="stat-card"><div class="stat-label">Waiting</div><div class="stat-value" style="color:var(--accent)">${fmtTk(waiting)}</div></div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div class="card-title" style="margin:0">All receipts</div>
        <select class="input input-sm" id="rc-filter" style="width:auto" onchange="buildMyReceiptsList()">
          <option value="all">All</option>
          <option value="manager">Recorded by manager</option>
          <option value="member">Sent by me</option>
          <option value="pending">Waiting for confirmation</option>
        </select>
      </div>
      <div id="rc-list"></div>
    </div>
  </div>

  <style>
    .rc-month{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;font-weight:700;color:var(--text2);margin:16px 0 8px;text-transform:uppercase;letter-spacing:.5px}
    .rc-month:first-child{margin-top:0}
    .rc-row{display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;flex-wrap:wrap;transition:border-color .2s,transform .25s var(--ease-spring)}
    .rc-row:hover{border-color:var(--accent);transform:translateX(3px)}
    .rc-amt{font-size:18px;font-weight:800;min-width:96px}
    .rc-mid{flex:1;min-width:160px}
    .rc-meta{font-size:11px;color:var(--text3);margin-top:3px}
    .rc-side{text-align:right;font-size:12px;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
  </style>`;

  buildMyReceiptsList();
}

function buildMyReceiptsList() {
  const wrap = document.getElementById("rc-list");
  if (!wrap) return;
  const f = document.getElementById("rc-filter")?.value || "all";
  const list = _rcptList.filter(p =>
    f === "all" ? true : f === "pending" ? p.status === "pending" : (p.source || "member") === f);

  if (!list.length) {
    wrap.innerHTML = `<div class="empty"><div>🧾</div><div>${_rcptList.length ? "No receipts match this filter" : "No receipts yet — they appear here when you give a payment or the manager records one"}</div></div>`;
    return;
  }

  // group by settlement month, newest first (list is already newest first)
  const groups = [];
  list.forEach(p => {
    let g = groups.find(x => x.key === p.month_key);
    if (!g) groups.push(g = { key: p.month_key, items: [] });
    g.items.push(p);
  });

  wrap.innerHTML = groups.map(g => {
    const paid = round2(g.items.filter(p => p.status === "confirmed").reduce((s, p) => s + _rcptKept(p), 0));
    return `
    <div class="rc-month"><span>${escapeHtml(monthLabelFromKey(g.key))}</span><span style="color:var(--green)">Paid ${fmtTk(paid)}</span></div>
    ${g.items.map(p => {
      const id = _safeId(p.id), st = _payStatus(p), mgr = p.source === "manager";
      return `
      <div class="rc-row">
        <div class="rc-amt" style="color:${p.status === "rejected" ? "var(--text3)" : "var(--text)"}">${fmtTk(Number(p.amount))}</div>
        <div class="rc-mid">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <span class="badge ${mgr ? "badge-blue" : "badge-purple"}">${mgr ? "🧑‍💼 Manager" : "🙋 You sent"}</span>
            <span class="badge ${st.cls}">${st.label}</span>
          </div>
          <div class="rc-meta">
            <span style="font-family:monospace">${paymentReceiptNo(p.receipt_no)}</span> · ${escapeHtml(_payDate(p.created_at))}
            · by ${escapeHtml(paymentGeneratedBy(p))}
          </div>
        </div>
        <div class="rc-side">
          ${_rcptAfter(p) || (p.status === "pending" ? `<span style="color:var(--accent)">Not counted yet</span>` : `<span style="color:var(--text3)">Not counted</span>`)}
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="copyReceiptLinkFor('${id}')" title="Copy receipt link" aria-label="Copy receipt link">🔗 Link</button>
            <button class="btn btn-ghost btn-sm" onclick="showPaymentReceipt('${id}')">View</button>
          </div>
        </div>
      </div>`;
    }).join("")}`;
  }).join("");
}

/* ═══════════════════════════════════════════════
   One receipt by link — #/app/receipt/<id>
   ═══════════════════════════════════════════════ */
async function renderReceiptPage(el, id) {
  const back = _isMgrRole() ? "collect" : "my-receipts";
  const backLbl = _isMgrRole() ? "← Collect Payment" : "← My Receipts";
  const shell = (body, sub) => `
  <div class="topbar">
    <div>
      <div class="page-title">Receipt</div>
      <div class="page-sub">${sub}</div>
    </div>
    <div class="topbar-actions"><button class="btn btn-ghost btn-sm" onclick="navigate('${back}')">${backLbl}</button></div>
  </div>
  <div class="content">${body}</div>`;

  const notFound = (msg) => {
    el.innerHTML = shell(`<div class="card"><div class="empty"><div>🧾</div><div>${msg}</div></div></div>`, "Shared receipt");
  };

  if (!_safeId(id)) return notFound("This receipt link is incomplete.");
  const p = await dbGetMemberPayment(id);
  // Members only ever see their own receipts; managers see any in their mess.
  if (!p || (!_isMgrRole() && p.member_id !== currentUser?.memberId)) {
    return notFound("Receipt not found — it may belong to another member or mess."
      + (MM_MODE === "demo" ? "<br><small>Sandbox receipts only exist in the browser tab that created them.</small>" : ""));
  }
  _cachePayments([p]);

  el.innerHTML = shell(`<div class="card" style="max-width:480px;margin:0 auto" id="rc-page"></div>`,
    `${escapeHtml(paymentReceiptNo(p.receipt_no))} · ${escapeHtml(monthLabelFromKey(p.month_key))}`);
  showCollectReceipt({ ...paymentReceiptData(p), target: document.getElementById("rc-page") });
}
