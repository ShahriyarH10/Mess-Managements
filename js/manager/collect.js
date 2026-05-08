/* ═══════════════════════════════════════════════
   MANAGER — Collect Payment (Quick Settle)
   Member hands over cash → auto-split proportionally
   between Meal-balance, Utility and Room Rent for the
   selected settlement month. Excess → "Change to return".
   Writes to existing tables only:
     • utility_payments.payments[name].paid       (utility cash)
     • utility_payments.payments[name].meal_paid  (meal cash)
     • rent.entries[i].paid                        (rent cash)
   ═══════════════════════════════════════════════ */

let _collectCtx = null;

async function renderCollect(el) {
  const n = new Date();
  const opts = buildMonthOptions(n.getMonth(), n.getFullYear());

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Collect Payment</div>
      <div class="page-sub">Quick settle: enter a lump sum, auto-split between meal, utility &amp; rent</div>
    </div>
  </div>
  <div class="content">
    <div class="card" style="margin-bottom:12px">
      <div class="month-sel">
        <label>Settlement month</label>
        <select class="input" id="cp-month" style="width:150px">${opts.monthOptions}</select>
        <label>Year</label>
        <select class="input" id="cp-year" style="width:95px">${opts.yearOptions}</select>
        <button class="btn btn-ghost btn-sm" onclick="loadCollectMonth()">Load</button>
      </div>
      <div class="settlement-note" style="margin-top:12px">
        <b>How it works:</b> Each row shows the member's <b>Net payable</b> for the chosen settlement
        month — exactly the same number you see in <b>Monthly Log</b>. It's split into:
        <i>Meal balance</i> (meal cost − bazar credit, from previous month) +
        <i>Utility remaining</i> + <i>Rent remaining</i>.
        Type the cash they handed over in <b>Amount received</b> — it auto-splits <b>proportionally</b>
        across the three. Overpayment shows as <b>Change to return</b>. Click <b>Save</b>: meal cash
        goes into <code>meal_paid</code>, utility into <code>paid</code>, rent into <code>rent.entries.paid</code>.
      </div>
    </div>

    <div class="card">
      <div class="card-title">💵 Per-member quick settle</div>
      <div id="cp-table-wrap">
        <div class="empty" style="padding:24px;text-align:center">
          <div style="font-size:24px;margin-bottom:6px">💵</div>
          Pick a month and click <b>Load</b>
        </div>
      </div>
    </div>
  </div>`;

  await loadCollectMonth();
}

function getCollectKey() {
  const month = parseInt(document.getElementById("cp-month")?.value ?? new Date().getMonth());
  const year  = parseInt(document.getElementById("cp-year")?.value  ?? new Date().getFullYear());
  return { month, year, key: monthKey(year, month) };
}

async function loadCollectMonth() {
  members = await dbGetMembers();
  const { month, year, key } = getCollectKey();
  const prev = previousMonthFromKey(key);

  const [allMeals, allBazar, utilCurR, utilPrevR, rentR] = await Promise.all([
    dbGetAll("meals"),
    dbGetAll("bazar"),
    sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle(),
    sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", prev.key).maybeSingle(),
    sb.from("rent").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle(),
  ]);

  const utilRec     = utilCurR.data  || null;
  const utilRecPrev = utilPrevR.data || null;
  const rentRec     = rentR.data     || null;

  // Use canonical settlement so every per-member row matches Monthly Log exactly.
  const perMember = {};
  members.forEach(m => {
    const p = calcMemberSettlement(m, allMeals, allBazar, rentRec, utilRec, utilRecPrev, key);
    perMember[m.id] = {
      name:        m.name,
      mealCost:    p.mealCost,
      memberBazar: p.memberBazar,
      mealPaid:    p.mealPaid,
      utilDue:     round2(p.prepaidUtility + p.postpaidUtility),
      utilPaid:    p.utilityPaid,
      rentDue:     p.roomRent,
      rentPaid:    p.roomRentPaid,
      netPayable:  p.netPayable,
    };
  });

  _collectCtx = { month, year, key, prevKey: prev.key, utilRec, rentRec, perMember };
  buildCollectTable();
}

function buildCollectTable() {
  const wrap = document.getElementById("cp-table-wrap");
  if (!wrap) return;
  if (!members.length) { wrap.innerHTML = '<div class="empty">No members in this mess</div>'; return; }

  wrap.innerHTML = `
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Member</th>
            <th>Meal bal.</th>
            <th>Utility rem.</th>
            <th>Rent rem.</th>
            <th>Net payable</th>
            <th>Amount received (৳)</th>
            <th>→ Meal</th>
            <th>→ Util</th>
            <th>→ Rent</th>
            <th>Change</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="cp-tbody">
          ${members.map(m => {
            const r = _collectCtx.perMember[m.id];
            const mealRem = round2(r.mealCost - r.memberBazar - r.mealPaid); // signed
            const utilRem = round2(Math.max(0, r.utilDue - r.utilPaid));
            const rentRem = round2(Math.max(0, r.rentDue - r.rentPaid));
            const net     = round2(r.netPayable);

            const fmtMeal = mealRem > 0
              ? `<span style="color:var(--red)">${fmtTk(mealRem)}</span>`
              : mealRem < 0
                ? `<span style="color:var(--green)" title="Member is owed back">+${fmtTk(Math.abs(mealRem))}</span>`
                : `<span style="color:var(--green)">✓ 0</span>`;

            const netDisplay = net > 0
              ? `<b style="color:var(--red)">${fmtTk(net)}</b>`
              : net < 0
                ? `<b style="color:var(--green)">Get ${fmtTk(Math.abs(net))}</b>`
                : `<b style="color:var(--green)">✓ Settled</b>`;

            return `
              <tr id="cpr-${m.id}">
                <td><b>${m.name}</b></td>
                <td id="cp-mr-${m.id}">${fmtMeal}</td>
                <td id="cp-ur-${m.id}" style="color:${utilRem>0?'var(--red)':'var(--green)'}">${utilRem>0?fmtTk(utilRem):"✓ 0"}</td>
                <td id="cp-rr-${m.id}" style="color:${rentRem>0?'var(--red)':'var(--green)'}">${rentRem>0?fmtTk(rentRem):"✓ 0"}</td>
                <td id="cp-net-${m.id}">${netDisplay}</td>
                <td>
                  <input type="number" class="input input-sm" id="cp-amt-${m.id}"
                    min="0" step="1" placeholder="0" style="width:120px"
                    oninput="onCollectAmtInput('${m.id}')"/>
                </td>
                <td id="cp-am-${m.id}" style="color:var(--violet,#9b59b6);font-weight:600">৳0</td>
                <td id="cp-au-${m.id}" style="color:var(--blue);font-weight:600">৳0</td>
                <td id="cp-ar-${m.id}" style="color:var(--amber);font-weight:600">৳0</td>
                <td id="cp-ch-${m.id}" style="color:var(--text3);font-weight:700">৳0</td>
                <td>
                  <button class="btn btn-primary btn-sm"
                    onclick="saveCollectRow('${m.id}')">💾 Save</button>
                </td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
      <button class="btn btn-ghost" onclick="loadCollectMonth()">↻ Refresh</button>
    </div>`;
}

/* Proportional split across 3 buckets (only positive remaining counts).
   Excess (amount > sum) → change.            */
function computeSplit3(amount, mealRem, utilRem, rentRem) {
  amount  = Math.max(0, round2(amount  || 0));
  // Only positive remaining can absorb cash. Negative meal balance means
  // the member is owed back — we don't allocate cash there.
  const m = Math.max(0, round2(mealRem || 0));
  const u = Math.max(0, round2(utilRem || 0));
  const r = Math.max(0, round2(rentRem || 0));
  const totalRem = round2(m + u + r);

  if (amount <= 0)        return { allocMeal: 0, allocUtil: 0, allocRent: 0, change: 0 };
  if (totalRem <= 0)      return { allocMeal: 0, allocUtil: 0, allocRent: 0, change: amount };
  if (amount >= totalRem) return { allocMeal: m, allocUtil: u, allocRent: r, change: round2(amount - totalRem) };

  const allocMeal = round2((amount * m) / totalRem);
  const allocUtil = round2((amount * u) / totalRem);
  const allocRent = round2(amount - allocMeal - allocUtil); // remainder absorbs fp drift
  return { allocMeal, allocUtil, allocRent, change: 0 };
}

function onCollectAmtInput(memberId) {
  if (!_collectCtx) return;
  const r = _collectCtx.perMember[memberId];
  if (!r) return;
  const amt     = parseFloat(document.getElementById("cp-amt-" + memberId)?.value || 0);
  const mealRem = round2(r.mealCost - r.memberBazar - r.mealPaid);
  const utilRem = round2(Math.max(0, r.utilDue - r.utilPaid));
  const rentRem = round2(Math.max(0, r.rentDue - r.rentPaid));
  const { allocMeal, allocUtil, allocRent, change } = computeSplit3(amt, mealRem, utilRem, rentRem);

  const set = (id, v, color) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = fmtTk(v); if (color) el.style.color = color; }
  };
  set("cp-am-" + memberId, allocMeal, "var(--violet,#9b59b6)");
  set("cp-au-" + memberId, allocUtil, "var(--blue)");
  set("cp-ar-" + memberId, allocRent, "var(--amber)");
  set("cp-ch-" + memberId, change,    change > 0 ? "var(--green)" : "var(--text3)");
}

async function saveCollectRow(memberId) {
  if (!_collectCtx) return;
  const ctx = _collectCtx;
  const r = ctx.perMember[memberId];
  const m = members.find(x => x.id === memberId);
  if (!r || !m) return;

  const amt = parseFloat(document.getElementById("cp-amt-" + memberId)?.value || 0);
  if (amt <= 0) { toast("Enter an amount first", "error"); return; }

  const mealRem = round2(r.mealCost - r.memberBazar - r.mealPaid);
  const utilRem = round2(Math.max(0, r.utilDue - r.utilPaid));
  const rentRem = round2(Math.max(0, r.rentDue - r.rentPaid));
  const { allocMeal, allocUtil, allocRent, change } = computeSplit3(amt, mealRem, utilRem, rentRem);

  try {
    /* ── 1) Update utility_payments — utility paid + meal_paid both live here ── */
    if (allocUtil > 0 || allocMeal > 0) {
      const { data: latestUtil } = await sb.from("utility_payments")
        .select("*").eq("mess_id", messId()).eq("month_key", ctx.key).maybeSingle();
      const bills    = latestUtil?.bills    || {};
      const payments = { ...(latestUtil?.payments || {}) };
      const cur      = payments[m.name] || {};
      const newPaid  = round2(Number(cur.paid      || 0) + allocUtil);
      const newMeal  = round2(Number(cur.meal_paid || 0) + allocMeal);
      const status   = newPaid <= 0           ? "unpaid"
                     : newPaid >= r.utilDue   ? "paid"
                     : "partial";
      payments[m.name] = {
        paid:      newPaid,
        meal_paid: newMeal,
        status,
        notes:     cleanText(cur.notes || ""),
      };
      await dbUpsertUtility(ctx.month, ctx.year, ctx.key, bills, payments);
    }

    /* ── 2) Update rent ─────────────────────────────────────────── */
    if (allocRent > 0) {
      const { data: latestRent } = await sb.from("rent")
        .select("*").eq("mess_id", messId()).eq("month_key", ctx.key).maybeSingle();
      const existing = latestRent?.entries || [];
      const entries = members.map(mm => {
        const e = existing.find(x => x.name === mm.name) || {};
        return {
          name:   mm.name,
          rent:   Number(e.rent   || 0),
          paid:   Number(e.paid   || 0),
          status: e.status        || "unpaid",
          notes:  e.notes         || "",
        };
      });
      const target = entries.find(x => x.name === m.name);
      target.paid = round2(Number(target.paid || 0) + allocRent);
      target.status = target.paid <= 0           ? "unpaid"
                    : target.paid >= target.rent ? "paid"
                    : "partial";
      await dbUpsertRent(ctx.month, ctx.year, ctx.key, entries);
    }

    /* ── 3) Refresh in-memory ctx so the row updates immediately ── */
    r.utilPaid = round2(r.utilPaid + allocUtil);
    r.rentPaid = round2(r.rentPaid + allocRent);
    r.mealPaid = round2(r.mealPaid + allocMeal);
    r.netPayable = round2(r.netPayable - allocMeal - allocUtil - allocRent);

    const newMealRem = round2(r.mealCost - r.memberBazar - r.mealPaid);
    const newUtilRem = round2(Math.max(0, r.utilDue - r.utilPaid));
    const newRentRem = round2(Math.max(0, r.rentDue - r.rentPaid));

    const setCell = (id, txt, color) => {
      const el = document.getElementById(id);
      if (el) { el.innerHTML = txt; if (color) el.style.color = color; }
    };
    setCell("cp-mr-" + memberId,
      newMealRem > 0
        ? `<span style="color:var(--red)">${fmtTk(newMealRem)}</span>`
        : newMealRem < 0
          ? `<span style="color:var(--green)">+${fmtTk(Math.abs(newMealRem))}</span>`
          : `<span style="color:var(--green)">✓ 0</span>`);
    setCell("cp-ur-" + memberId, newUtilRem > 0 ? fmtTk(newUtilRem) : "✓ 0", newUtilRem > 0 ? "var(--red)" : "var(--green)");
    setCell("cp-rr-" + memberId, newRentRem > 0 ? fmtTk(newRentRem) : "✓ 0", newRentRem > 0 ? "var(--red)" : "var(--green)");
    setCell("cp-net-" + memberId,
      r.netPayable > 0
        ? `<b style="color:var(--red)">${fmtTk(r.netPayable)}</b>`
        : r.netPayable < 0
          ? `<b style="color:var(--green)">Get ${fmtTk(Math.abs(r.netPayable))}</b>`
          : `<b style="color:var(--green)">✓ Settled</b>`);

    const amtEl = document.getElementById("cp-amt-" + memberId);
    if (amtEl) amtEl.value = "";
    onCollectAmtInput(memberId);

    const parts = [];
    if (allocMeal > 0) parts.push(`Meal ${fmtTk(allocMeal)}`);
    if (allocUtil > 0) parts.push(`Util ${fmtTk(allocUtil)}`);
    if (allocRent > 0) parts.push(`Rent ${fmtTk(allocRent)}`);
    const msg = change > 0
      ? `Saved ✓  ${parts.join(" • ") || "—"}  · Change: ${fmtTk(change)}`
      : `Saved ✓  ${parts.join(" • ") || "—"}`;
    toast(msg, "success");

    /* ── 4) Auto-open shareable receipt ─────────────────────────── */
    showCollectReceipt({
      member:        m,
      monthLabel:    monthLabelFromKey(ctx.key),
      amountReceived: amt,
      allocMeal, allocUtil, allocRent, change,
      newUtilRem, newRentRem, newMealRem,
      newNet:        r.netPayable,
      timestamp:     new Date(),
    });
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

/* ═════════════════════════════════════════════════════════════════
   Shareable receipt — opens in modal after a successful save.
   Plain-text format works perfectly in WhatsApp / SMS / clipboard.
   ═════════════════════════════════════════════════════════════════ */
function buildReceiptText(d) {
  const messName = currentMess?.name || "Mess";
  const dt = d.timestamp.toLocaleString("en-IN", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", hour12:true
  });
  const lines = [];
  lines.push(`💵 PAYMENT RECEIPT`);
  lines.push(`─────────────────────`);
  lines.push(`Mess:    ${messName}`);
  lines.push(`Member:  ${d.member.name}`);
  lines.push(`Month:   ${d.monthLabel}`);
  lines.push(`Date:    ${dt}`);
  lines.push(``);
  lines.push(`Amount received:  ${fmtTk(d.amountReceived)}`);
  lines.push(`─────────────────────`);
  if (d.allocMeal > 0) lines.push(`→ Meal:     ${fmtTk(d.allocMeal)}`);
  if (d.allocUtil > 0) lines.push(`→ Utility:  ${fmtTk(d.allocUtil)}`);
  if (d.allocRent > 0) lines.push(`→ Rent:     ${fmtTk(d.allocRent)}`);
  if (d.change   > 0)  lines.push(`Change returned: ${fmtTk(d.change)}`);
  lines.push(`─────────────────────`);
  const netLine = d.newNet > 0
    ? `Still due:  ${fmtTk(d.newNet)}`
    : d.newNet < 0
      ? `Mess owes you: ${fmtTk(Math.abs(d.newNet))}`
      : `✓ Fully settled for ${d.monthLabel}`;
  lines.push(netLine);
  lines.push(``);
  lines.push(`— sent from ${messName} manager`);
  return lines.join("\n");
}

function showCollectReceipt(d) {
  const text = buildReceiptText(d);
  const phoneRaw = (d.member.phone || "").replace(/[^\d]/g, "");
  // Bangladesh local numbers (01xxxxxxxxx) → prefix 880; otherwise pass through.
  const phone = phoneRaw.length === 11 && phoneRaw.startsWith("0")
    ? "880" + phoneRaw.slice(1)
    : phoneRaw;
  const waUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  const html = `
    <div class="modal-title">💵 Payment Receipt</div>
    <div class="modal-sub" style="margin-bottom:12px">
      Saved successfully — share with <b>${d.member.name}</b> instantly.
    </div>

    <div id="cp-receipt-card" style="
      background:var(--bg2);border:1px solid var(--border);border-radius:10px;
      padding:18px 20px;font-family:ui-monospace,Menlo,Consolas,monospace;
      font-size:13px;line-height:1.65;white-space:pre-wrap;margin-bottom:14px
    ">${escapeHtml(text)}</div>

    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="copyCollectReceipt(this)">📋 Copy</button>
      <a class="btn btn-primary" href="${waUrl}" target="_blank" rel="noopener"
         style="background:#25D366;border-color:#25D366">💬 WhatsApp${phone ? "" : " (pick contact)"}</a>
      <button class="btn btn-ghost" onclick="printCollectReceipt()">🖨 Print</button>
      <button class="btn btn-ghost" onclick="closeModal()" style="margin-left:auto">Close</button>
    </div>

    ${d.member.phone ? "" : `
      <div style="font-size:11px;color:var(--text3);margin-top:10px">
        💡 Tip: add a phone number to <b>${d.member.name}</b>'s profile to send WhatsApp directly to them.
      </div>`}
  `;
  // Stash plain text on window so the action buttons can grab it.
  window._lastReceiptText = text;
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
    // Fallback for older browsers / non-secure contexts
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Receipt copied", "success"); }
    catch (_) { toast("Copy failed — long-press the receipt to copy", "error"); }
    document.body.removeChild(ta);
  }
}

function printCollectReceipt() {
  const text = window._lastReceiptText || "";
  const w = window.open("", "_blank", "width=420,height=600");
  if (!w) { toast("Pop-up blocked — allow pop-ups to print", "error"); return; }
  w.document.write(`
    <html><head><title>Receipt</title>
    <style>
      body{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.6;padding:20px;white-space:pre-wrap}
      @media print{body{padding:8px}}
    </style></head>
    <body>${text.replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]))}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 250);
}

