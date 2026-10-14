/* Shareable payment receipt (modal, copy, WhatsApp, print) — shown after the manager saves a
   collection and after a member sends a payment. Loaded for both roles (SCRIPT_GROUPS.shared). */

/* ═════════════════════════════════════════════════════════════════
   Shareable receipt — opens in modal after a successful save.
   ═════════════════════════════════════════════════════════════════ */
/* d.status: "confirmed" (default — a manager collection) | "pending" | "rejected" — member payment requests.
   Optional: d.receiptNo, d.confirmedBy, d.confirmedAt, d.hasBreakdown === false, newMealRem/newNet == null
   (history rows only store part of the settlement, so the sections they can't fill are hidden). */
function _rcptStatus(d) { return d.status || (d.pending ? "pending" : "confirmed"); }
function _rcptShape(d) {
  const st = _rcptStatus(d), ok = st !== "rejected";
  return {
    st,
    showAlloc: ok && d.hasBreakdown !== false,
    showBal:   ok && d.newMealRem != null && d.newUtilRem != null && d.newRentRem != null,
    showNet:   ok && d.newNet != null,
    isSettled: d.newNet != null && d.newNet <= 0,
    received:  st === "confirmed",
  };
}
function _rcptNo(d) {
  return d.receiptNo || ("RCP-"
    + d.timestamp.getFullYear()
    + String(d.timestamp.getMonth()+1).padStart(2,"0")
    + String(d.timestamp.getDate()).padStart(2,"0")
    + "-" + String(d.timestamp.getHours()).padStart(2,"0")
    + String(d.timestamp.getMinutes()).padStart(2,"0"));
}
function _rcptDate(t) {
  return t.toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true });
}
function _rcptBanner(d, st, color) {
  const [bg, fg] = color;
  const box = txt => `<div style="background:${bg};color:${fg};border-radius:8px;padding:9px 12px;font-size:12px;font-weight:600;margin-bottom:8px">${txt}</div>`;
  if (st === "pending")  return box("⚠ Pending — not official until the manager confirms it.");
  if (st === "rejected") return box(`✖ Rejected${d.confirmedBy ? " by " + d.confirmedBy : ""} — this payment was not counted.`);
  return d.confirmedBy ? box(`✓ Confirmed by ${d.confirmedBy}${d.confirmedAt ? " · " + _rcptDate(d.confirmedAt) : ""}`) : "";
}

function buildReceiptText(d) {
  const messName = currentMess?.name || "Mess";
  const dt = _rcptDate(d.timestamp);
  const sh = _rcptShape(d);
  const lines = [];
  lines.push(sh.st === "rejected" ? `✖ PAYMENT REJECTED` : sh.st === "pending" ? `🕓 PAYMENT REQUEST` : `💵 PAYMENT RECEIPT`);
  lines.push(`─────────────────────`);
  if (d.receiptNo) lines.push(`Receipt: ${d.receiptNo}`);
  lines.push(`Mess:    ${messName}`);
  lines.push(`Member:  ${d.member.name}`);
  lines.push(`Month:   ${d.monthLabel}`);
  lines.push(`Date:    ${dt}`);
  lines.push(``);
  lines.push(`Amount ${sh.received ? "received" : "offered"}:  ${fmtTk(d.amountReceived)}`);
  lines.push(`─────────────────────`);
  if (sh.showAlloc) {
    if (d.allocPrevDue > 0) lines.push(`→ Prev. Due: ${fmtTk(d.allocPrevDue)}`);
    if (d.allocMeal    > 0) lines.push(`→ Meal:      ${fmtTk(d.allocMeal)}`);
    if (d.allocUtil    > 0) lines.push(`→ Utility:   ${fmtTk(d.allocUtil)}`);
    if (d.allocRent    > 0) lines.push(`→ Rent:      ${fmtTk(d.allocRent)}`);
    if (d.change       > 0) lines.push(`Change returned: ${fmtTk(d.change)}`);
    lines.push(`─────────────────────`);
  }
  if (sh.showNet) {
    lines.push(d.newNet > 0
      ? `Still due:  ${fmtTk(d.newNet)}`
      : d.newNet < 0
        ? `Mess owes you: ${fmtTk(Math.abs(d.newNet))}`
        : `✓ Fully settled for ${d.monthLabel}`);
    lines.push(``);
  }
  if (sh.st === "pending") {
    lines.push(`⚠ Not yet confirmed by the manager.`);
    lines.push(`This is NOT proof of payment received.`);
  } else if (sh.st === "rejected") {
    lines.push(`Rejected${d.confirmedBy ? " by " + d.confirmedBy : ""} — not counted.`);
  } else if (d.confirmedBy) {
    lines.push(`Confirmed by ${d.confirmedBy}${d.confirmedAt ? " · " + _rcptDate(d.confirmedAt) : ""}`);
  } else {
    lines.push(`— sent from ${messName} manager`);
  }
  return lines.join("\n");
}

function showCollectReceipt(d) {
  const text = buildReceiptText(d);
  const phoneRaw = (d.member.phone || "").replace(/[^\d]/g, "");
  const phone = phoneRaw.length === 11 && phoneRaw.startsWith("0")
    ? "880" + phoneRaw.slice(1)
    : phoneRaw;
  const waUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  const dt = _rcptDate(d.timestamp);
  const messName = currentMess?.name || "Mess";
  const receiptNo = _rcptNo(d);
  const sh = _rcptShape(d), st = sh.st;

  const allocItems = [];
  if (d.allocPrevDue > 0) allocItems.push({ icon:"⏪",  label:"Prev. Month Due", val:d.allocPrevDue, color:"var(--red)"    });
  if (d.allocMeal    > 0) allocItems.push({ icon:"🍽️", label:"Meal Balance",     val:d.allocMeal,    color:"var(--accent)" });
  if (d.allocUtil    > 0) allocItems.push({ icon:"⚡",  label:"Utility",          val:d.allocUtil,    color:"var(--blue)"   });
  if (d.allocRent    > 0) allocItems.push({ icon:"🏠",  label:"Room Rent",        val:d.allocRent,    color:"var(--blue)"   });

  const statusItems = [
    { icon:"🍽️", label:"Meal Balance",      val:d.newMealRem, signed:true,
      note: d.newMealRem > 0 ? "Still owing" : d.newMealRem < 0 ? "Owed back to member" : "Cleared" },
    { icon:"⚡",  label:"Utility Remaining", val:d.newUtilRem,
      note: d.newUtilRem > 0 ? "Still pending" : "Cleared" },
    { icon:"🏠",  label:"Rent Remaining",    val:d.newRentRem,
      note: d.newRentRem > 0 ? "Still pending" : "Cleared" },
  ];

  const isSettled = sh.isSettled;
  const netColor  = d.newNet > 0 ? "var(--red)" : "var(--green)";
  const netLabel  = d.newNet > 0
    ? `Pay ${fmtTk(d.newNet)}`
    : d.newNet < 0
      ? `Mess owes ${fmtTk(Math.abs(d.newNet))}`
      : "✓ Fully Settled";

  const html = `
  <style>
    #rcpt-modal{font-family:var(--font);max-width:420px;margin:0 auto;}
    .rcpt-head{text-align:center;padding:4px 0 16px;border-bottom:2px dashed var(--border2);margin-bottom:16px;}
    .rcpt-head-icon{font-size:30px;line-height:1;margin-bottom:6px;}
    .rcpt-head-name{font-family:var(--font-serif);font-size:21px;font-weight:700;color:var(--text);}
    .rcpt-head-sub{font-size:10px;color:var(--text3);letter-spacing:.8px;text-transform:uppercase;margin-top:3px;}
    .rcpt-badge{display:inline-block;margin-top:8px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;}
    .rcpt-badge-settled{background:var(--green-bg);color:var(--green);border:1px solid rgba(76,175,130,.3);}
    .rcpt-badge-due{background:var(--red-bg);color:var(--red);border:1px solid rgba(224,82,82,.3);}
    .rcpt-badge-pend{background:var(--accent-bg);color:var(--accent);border:1px solid var(--accent);}
    .rcpt-meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;background:var(--bg3);border-radius:8px;padding:10px 14px;margin-bottom:14px;}
    .rcpt-ml{display:flex;flex-direction:column;gap:1px;}
    .rcpt-ml span:first-child{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--text3);}
    .rcpt-ml span:last-child{font-size:12px;font-weight:600;color:var(--text);}
    .rcpt-hero{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:var(--accent-bg);border:2px solid var(--accent);border-radius:10px;margin-bottom:14px;}
    .rcpt-hero-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--accent);}
    .rcpt-hero-sub{font-size:11px;color:var(--text3);margin-top:2px;}
    .rcpt-hero-amt{font-size:26px;font-weight:800;color:var(--accent);}
    .rcpt-sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:var(--text3);display:flex;align-items:center;gap:8px;margin:14px 0 7px;}
    .rcpt-sec::after{content:'';flex:1;height:1px;background:var(--border2);}
    .rcpt-alloc-row{display:flex;justify-content:space-between;align-items:center;padding:9px 13px;background:var(--bg3);border-radius:7px;margin-bottom:5px;}
    .rcpt-alloc-left{display:flex;align-items:center;gap:9px;}
    .rcpt-alloc-ico{font-size:16px;line-height:1;}
    .rcpt-alloc-lbl{font-size:13px;font-weight:600;color:var(--text);}
    .rcpt-alloc-val{font-size:14px;font-weight:700;}
    .rcpt-change{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--green-bg);border:1px solid rgba(76,175,130,.3);border-radius:8px;margin:10px 0;}
    .rcpt-hr{border:none;border-top:2px dashed var(--border2);margin:14px 0;}
    .rcpt-stat-row{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-radius:7px;margin-bottom:5px;}
    .rcpt-stat-due{background:var(--bg3);border:1px solid var(--border);}
    .rcpt-stat-ok{background:var(--green-bg);border:1px solid rgba(76,175,130,.25);}
    .rcpt-stat-left{display:flex;align-items:center;gap:9px;}
    .rcpt-net{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-radius:10px;margin-top:12px;font-weight:800;font-size:16px;}
    .rcpt-net-ok{background:var(--green-bg);border:2px solid rgba(76,175,130,.45);}
    .rcpt-net-due{background:var(--red-bg);border:2px solid rgba(224,82,82,.35);}
    .rcpt-foot{text-align:center;padding:12px 0 2px;border-top:2px dashed var(--border2);margin-top:14px;}
    .rcpt-foot-txt{font-size:10px;color:var(--text3);letter-spacing:.4px;}
    .rcpt-btns{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px;}
    .rcpt-btns .btn{flex:1;min-width:90px;justify-content:center;}
  </style>

  <div id="rcpt-modal">

    <!-- ── Header ── -->
    <div class="rcpt-head">
      <div class="rcpt-head-icon">🏠</div>
      <div class="rcpt-head-name">${messName}</div>
      <div class="rcpt-head-sub">Official Payment Receipt</div>
      <span class="rcpt-badge ${st === "pending" ? 'rcpt-badge-pend' : st === "rejected" ? 'rcpt-badge-due' : (!sh.showNet || isSettled) ? 'rcpt-badge-settled' : 'rcpt-badge-due'}">
        ${st === "pending" ? "🕓 Pending" : st === "rejected" ? "✖ Rejected" : !sh.showNet ? "✓ Confirmed" : isSettled ? "✓ Settled" : "Partially Paid"}
      </span>
    </div>

    <!-- ── Meta grid ── -->
    <div class="rcpt-meta">
      <div class="rcpt-ml">
        <span>Receipt No.</span>
        <span style="font-family:monospace;font-size:11px">${receiptNo}</span>
      </div>
      <div class="rcpt-ml">
        <span>Date &amp; Time</span>
        <span style="font-size:11px">${dt}</span>
      </div>
      <div class="rcpt-ml" style="margin-top:5px">
        <span>Member</span>
        <span>${d.member.name}</span>
      </div>
      <div class="rcpt-ml" style="margin-top:5px">
        <span>Settlement Month</span>
        <span>${d.monthLabel}</span>
      </div>
    </div>

    <!-- ── Amount received ── -->
    <div class="rcpt-hero">
      <div>
        <div class="rcpt-hero-lbl">Amount ${sh.received ? "Received" : "Offered"}</div>
        <div class="rcpt-hero-sub">${sh.received ? "Cash handed over by member" : "Offered to the manager"}</div>
      </div>
      <div class="rcpt-hero-amt">${fmtTk(d.amountReceived)}</div>
    </div>

    <!-- ── Payment breakdown ── -->
    ${sh.showAlloc ? `
    <div class="rcpt-sec">Payment Breakdown</div>
    ${allocItems.length ? allocItems.map(r => `
      <div class="rcpt-alloc-row">
        <div class="rcpt-alloc-left">
          <span class="rcpt-alloc-ico">${r.icon}</span>
          <span class="rcpt-alloc-lbl">${r.label}</span>
        </div>
        <span class="rcpt-alloc-val" style="color:${r.color}">+ ${fmtTk(r.val)}</span>
      </div>
    `).join("") : `
      <div class="rcpt-alloc-row" style="color:var(--text3);font-size:12px">
        Member already settled — no allocation needed.
      </div>
    `}` : ""}

    <!-- ── Change to return ── -->
    ${sh.showAlloc && d.change > 0 ? `
      <div class="rcpt-change">
        <div>
          <div style="font-weight:700;color:var(--green);font-size:13px">💸 Change to Return</div>
          <div style="font-size:11px;color:var(--text3)">Hand this back to the member</div>
        </div>
        <div style="font-weight:800;color:var(--green);font-size:18px">${fmtTk(d.change)}</div>
      </div>
    ` : ""}

    ${sh.showAlloc || sh.showBal || sh.showNet ? `<hr class="rcpt-hr">` : ""}

    <!-- ── Balance after ── -->
    ${sh.showBal ? `<div class="rcpt-sec">Balance After This Payment</div>` : ""}
    ${!sh.showBal ? "" : statusItems.map(r => {
      const isDue    = r.signed ? r.val > 0 : r.val > 0;
      const isCredit = r.signed && r.val < 0;
      const cls      = isDue ? "rcpt-stat-due" : "rcpt-stat-ok";
      const valColor = isDue ? "var(--red)" : "var(--green)";
      const valTxt   = isDue ? fmtTk(r.val) : isCredit ? `+ ${fmtTk(Math.abs(r.val))}` : "✓ 0";
      return `
        <div class="rcpt-stat-row ${cls}">
          <div class="rcpt-stat-left">
            <span style="font-size:16px">${r.icon}</span>
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--text)">${r.label}</div>
              <div style="font-size:10px;color:var(--text3)">${r.note}</div>
            </div>
          </div>
          <span style="font-weight:700;font-size:13px;color:${valColor}">${valTxt}</span>
        </div>`;
    }).join("")}

    <!-- ── Final net ── -->
    ${sh.showNet ? `<div class="rcpt-net ${isSettled ? 'rcpt-net-ok' : 'rcpt-net-due'}">
      <span>Total Net Balance</span>
      <span style="color:${netColor}">${netLabel}</span>
    </div>` : ""}

    <!-- ── Footer ── -->
    <div class="rcpt-foot">
      ${_rcptBanner(d, st, st === "confirmed" ? ["var(--green-bg)", "var(--green)"] : st === "rejected" ? ["var(--red-bg)", "var(--red)"] : ["var(--accent-bg)", "var(--accent)"])}
      <div class="rcpt-foot-txt">— Generated by ${messName} Manager —</div>
      ${d.member.phone || st !== "confirmed" ? "" : `<div style="font-size:10px;color:var(--text3);margin-top:4px">💡 Add ${d.member.name}'s phone to enable direct WhatsApp</div>`}
    </div>

    <!-- ── Actions ── -->
    <div class="rcpt-btns">
      <button class="btn btn-primary btn-sm" onclick="copyCollectReceipt(this)">📋 Copy</button>
      <a class="btn btn-sm" href="${waUrl}" target="_blank" rel="noopener"
         style="background:#25D366;border:1px solid #1fb759;color:#fff;display:flex;align-items:center;justify-content:center;gap:4px;text-decoration:none;border-radius:var(--radius-sm)">
        💬 WhatsApp
      </a>
      <button class="btn btn-ghost btn-sm" onclick="printCollectReceipt()">🖨 Print</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()" style="margin-left:auto">✕ Close</button>
    </div>

  </div>`;

  window._lastReceiptText = text;
  window._lastReceiptData = d;
  document.getElementById("modal-content").innerHTML = html;
  document.querySelector(".modal").classList.remove("modal-wide");
  openModal();
}

async function copyCollectReceipt(btn) {
  const text = window._lastReceiptText || "";
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { const o = btn.textContent; btn.textContent = "✓ Copied"; setTimeout(() => btn.textContent = o, 1600); }
    toast("Receipt copied to clipboard", "success");
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Receipt copied", "success"); }
    catch (_) { toast("Copy failed — long-press the receipt to copy", "error"); }
    document.body.removeChild(ta);
  }
}

function printCollectReceipt() {
  const d = window._lastReceiptData;
  if (!d) { toast("No receipt data — save a payment first", "error"); return; }

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  let w, frame;
  if (isSafari) {
    w = window.open("", "_blank", "width=480,height=700");
    if (!w) { toast("Pop-up blocked — allow pop-ups to print", "error"); return; }
  } else {
    frame = document.getElementById("_rcpt-print-frame");
    if (frame) frame.remove();
    frame = document.createElement("iframe");
    frame.id = "_rcpt-print-frame";
    frame.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;";
    document.body.appendChild(frame);
    w = frame.contentWindow;
  }

  const messName = currentMess?.name || "Mess";
  const dt = _rcptDate(d.timestamp);
  const receiptNo = _rcptNo(d);
  const sh = _rcptShape(d), st = sh.st;
  const isSettled = sh.isSettled;

  const fmtTkP = (v) => "৳" + Number(v).toLocaleString("en-IN", {minimumFractionDigits:0, maximumFractionDigits:2});

  const allocItems = [];
  if (d.allocPrevDue > 0) allocItems.push({ icon:"⏪",  label:"Prev. Month Due", val:d.allocPrevDue, color:"#c0392b" });
  if (d.allocMeal > 0) allocItems.push({ icon:"🍽️", label:"Meal Balance",  val:d.allocMeal, color:"#b8914a" });
  if (d.allocUtil > 0) allocItems.push({ icon:"⚡",  label:"Utility",       val:d.allocUtil, color:"#3a7bd5" });
  if (d.allocRent > 0) allocItems.push({ icon:"🏠",  label:"Room Rent",     val:d.allocRent, color:"#3a7bd5" });

  const statusItems = [
    { icon:"🍽️", label:"Meal Balance",      val:d.newMealRem, signed:true,
      note: d.newMealRem > 0 ? "Still owing" : d.newMealRem < 0 ? "Owed back to member" : "Cleared" },
    { icon:"⚡",  label:"Utility Remaining", val:d.newUtilRem,
      note: d.newUtilRem > 0 ? "Still pending" : "Cleared" },
    { icon:"🏠",  label:"Rent Remaining",    val:d.newRentRem,
      note: d.newRentRem > 0 ? "Still pending" : "Cleared" },
  ];

  const netColor = d.newNet > 0 ? "#c0392b" : "#27ae60";
  const netLabel = d.newNet > 0
    ? `Pay ${fmtTkP(d.newNet)}`
    : d.newNet < 0
      ? `Mess owes ${fmtTkP(Math.abs(d.newNet))}`
      : "✓ Fully Settled";

  const allocHtml = allocItems.length
    ? allocItems.map(r => `
        <div class="row-item">
          <div class="row-left"><span class="ico">${r.icon}</span><span class="row-lbl">${r.label}</span></div>
          <span class="row-val" style="color:${r.color}">+ ${fmtTkP(r.val)}</span>
        </div>`).join("")
    : `<div class="row-item" style="color:#888;font-size:12px">Member already settled — no allocation needed.</div>`;

  const changeHtml = d.change > 0 ? `
    <div class="change-box">
      <div>
        <div style="font-weight:700;color:#27ae60;font-size:13px">💸 Change to Return</div>
        <div style="font-size:11px;color:#777;margin-top:1px">Hand this back to the member</div>
      </div>
      <div style="font-weight:800;color:#27ae60;font-size:18px">${fmtTkP(d.change)}</div>
    </div>` : "";

  const statusHtml = statusItems.map(r => {
    const isDue    = r.signed ? r.val > 0 : r.val > 0;
    const isCredit = r.signed && r.val < 0;
    const bg       = isDue ? "#fdf0f0" : "#f0faf5";
    const border   = isDue ? "#f5c6c6" : "#b2dfce";
    const valColor = isDue ? "#c0392b" : "#27ae60";
    const valTxt   = isDue ? fmtTkP(r.val) : isCredit ? `+ ${fmtTkP(Math.abs(r.val))}` : "✓ 0";
    return `
      <div class="row-item" style="background:${bg};border:1px solid ${border}">
        <div class="row-left">
          <span class="ico">${r.icon}</span>
          <div>
            <div style="font-size:13px;font-weight:600;color:#222">${r.label}</div>
            <div style="font-size:10px;color:#888">${r.note}</div>
          </div>
        </div>
        <span class="row-val" style="color:${valColor}">${valTxt}</span>
      </div>`;
  }).join("");

  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt — ${d.member.name}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#222;padding:28px 24px;max-width:440px;margin:0 auto;}
    .head{text-align:center;padding-bottom:16px;border-bottom:2px dashed #ccc;margin-bottom:16px;}
    .head-icon{font-size:32px;line-height:1;margin-bottom:6px;}
    .head-name{font-size:22px;font-weight:700;letter-spacing:.3px;}
    .head-sub{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.8px;margin-top:3px;}
    .badge{display:inline-block;margin-top:8px;padding:3px 12px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;}
    .badge-ok{background:#e8f8f0;color:#27ae60;border:1px solid #b2dfce;}
    .badge-due{background:#fdf0f0;color:#c0392b;border:1px solid #f5c6c6;}
    .badge-pend{background:#fdf3e1;color:#8a5a00;border:1px solid #e8c98a;}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;background:#f7f7f7;border-radius:8px;padding:10px 14px;margin-bottom:14px;border:1px solid #eee;}
    .ml{display:flex;flex-direction:column;gap:1px;}
    .ml-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#999;}
    .ml-val{font-size:12px;font-weight:600;color:#222;}
    .hero{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#fdf8ee;border:2px solid #d4a853;border-radius:10px;margin-bottom:14px;}
    .hero-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#b8914a;}
    .hero-sub{font-size:11px;color:#999;margin-top:2px;}
    .hero-amt{font-size:26px;font-weight:800;color:#b8914a;}
    .sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:#aaa;display:flex;align-items:center;gap:8px;margin:14px 0 7px;}
    .sec::after{content:'';flex:1;height:1px;background:#ddd;}
    .row-item{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f7f7f7;border-radius:7px;margin-bottom:5px;}
    .row-left{display:flex;align-items:center;gap:9px;}
    .ico{font-size:16px;line-height:1;}
    .row-lbl{font-size:13px;font-weight:600;color:#222;}
    .row-val{font-size:14px;font-weight:700;}
    .change-box{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#e8f8f0;border:1px solid #b2dfce;border-radius:8px;margin:10px 0;}
    .divider{border:none;border-top:2px dashed #ccc;margin:14px 0;}
    .net{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-radius:10px;margin-top:12px;font-weight:800;font-size:16px;}
    .net-ok{background:#e8f8f0;border:2px solid #b2dfce;}
    .net-due{background:#fdf0f0;border:2px solid #f5c6c6;}
    .foot{text-align:center;padding:12px 0 2px;border-top:2px dashed #ccc;margin-top:16px;}
    .foot-txt{font-size:10px;color:#aaa;letter-spacing:.4px;}
    @media print{
      body{padding:16px 14px;}
      @page{margin:10mm;size:A5;}
    }
  </style>
</head>
<body>
  <div class="head">
    <div class="head-icon">🏠</div>
    <div class="head-name">${messName}</div>
    <div class="head-sub">Official Payment Receipt</div>
    <span class="badge ${st === "pending" ? 'badge-pend' : st === "rejected" ? 'badge-due' : (!sh.showNet || isSettled) ? 'badge-ok' : 'badge-due'}">${st === "pending" ? "🕓 Pending" : st === "rejected" ? "✖ Rejected" : !sh.showNet ? "✓ Confirmed" : isSettled ? "✓ Settled" : "Partially Paid"}</span>
  </div>

  <div class="meta">
    <div class="ml"><span class="ml-lbl">Receipt No.</span><span class="ml-val" style="font-family:monospace;font-size:11px">${receiptNo}</span></div>
    <div class="ml"><span class="ml-lbl">Date &amp; Time</span><span class="ml-val" style="font-size:11px">${dt}</span></div>
    <div class="ml" style="margin-top:5px"><span class="ml-lbl">Member</span><span class="ml-val">${d.member.name}</span></div>
    <div class="ml" style="margin-top:5px"><span class="ml-lbl">Settlement Month</span><span class="ml-val">${d.monthLabel}</span></div>
  </div>

  <div class="hero">
    <div>
      <div class="hero-lbl">Amount ${sh.received ? "Received" : "Offered"}</div>
      <div class="hero-sub">${sh.received ? "Cash handed over by member" : "Offered to the manager"}</div>
    </div>
    <div class="hero-amt">${fmtTkP(d.amountReceived)}</div>
  </div>

  ${sh.showAlloc ? `<div class="sec">Payment Breakdown</div>
  ${allocHtml}
  ${changeHtml}` : ""}

  ${sh.showAlloc || sh.showBal || sh.showNet ? `<hr class="divider">` : ""}

  ${sh.showBal ? `<div class="sec">Balance After This Payment</div>
  ${statusHtml}` : ""}

  ${sh.showNet ? `<div class="net ${isSettled ? 'net-ok' : 'net-due'}">
    <span>Total Net Balance</span>
    <span style="color:${netColor}">${netLabel}</span>
  </div>` : ""}

  <div class="foot">
    ${_rcptBanner(d, st, st === "confirmed" ? ["#e8f8f0", "#27ae60"] : st === "rejected" ? ["#fdf0f0", "#c0392b"] : ["#fdf3e1", "#8a5a00"])}
    <div class="foot-txt">— Generated by ${messName} Manager —</div>
  </div>

</body>
</html>`);
  w.document.close();
  if (isSafari) {
    setTimeout(() => { w.focus(); w.print(); }, 250);
  } else {
    frame.onload = function() {
      setTimeout(() => { w.focus(); w.print(); }, 250);
    };
  }
}
