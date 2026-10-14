/* ═══════════════════════════════════════════════
   MANAGER — Member payment requests ("Give Payment")
   Lives inside Collect Payment. A member's pending request is listed here;
   Confirm applies it with the same Prev.Due → Rent → Utility → Meal waterfall
   as a cash collection, then stamps the request confirmed (with the split and
   the balance left) so the receipt can be reprinted later. Reject just closes it.

   Writes (same tables as saveCollectRow):
     • utility_payments.payments[name].paid / meal_paid / prev_due_paid
     • utility_payments.bills.pending_change[name]   (overpayment → Return Amount)
     • rent.entries[i].paid
     • member_payments.status / split / still_due
   ═══════════════════════════════════════════════ */

let _pendingPays = [];
const _payBusy = new Set();

async function loadPendingPayments() {
  try {
    _pendingPays = await dbGetMemberPayments({ status: "pending" });
    _cachePayments(_pendingPays);
  } catch (e) {
    // Table not created yet (migration not run) or offline — Collect still works without it.
    console.warn("[Payments] could not load requests:", e.message);
    _pendingPays = [];
  }
  buildPendingPayments();
}

function buildPendingPayments() {
  const wrap = document.getElementById("cp-pending-wrap");
  if (!wrap) return;
  if (!_pendingPays.length) { wrap.innerHTML = ""; return; }

  const rows = _pendingPays.map(p => {
    const id = _safeId(p.id);
    const busy = _payBusy.has(p.id) ? " disabled" : "";
    return `
    <div class="pr-row">
      <div style="min-width:0;flex:1">
        <div style="font-weight:700;font-size:14px">${escapeHtml(paymentMemberName(p))}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">
          ${escapeHtml(monthLabelFromKey(p.month_key))} · ${escapeHtml(_payDate(p.created_at))} · <span style="font-family:monospace">${paymentReceiptNo(p.receipt_no)}</span>
        </div>
        ${p.due_at_submit != null ? `<div style="font-size:11px;color:var(--text3)">Owed when sent: ${fmtTk(Number(p.due_at_submit))}</div>` : ""}
      </div>
      <div class="pr-amt">${fmtTk(Number(p.amount))}</div>
      <div class="pr-actions">
        <button class="btn btn-ghost btn-sm" onclick="rejectPaymentRequest('${id}')"${busy}>Reject</button>
        <button class="btn btn-primary btn-sm" onclick="confirmPaymentRequest('${id}')"${busy}>✓ Confirm received</button>
      </div>
    </div>`;
  }).join("");

  wrap.innerHTML = `
  <div class="card" style="margin-bottom:14px;border-color:var(--accent)">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <div style="width:34px;height:34px;border-radius:50%;background:var(--accent-bg);border:1.5px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🔔</div>
      <div>
        <div style="font-weight:700;font-size:14px;color:var(--accent)">Member payments to confirm
          <span class="badge badge-amber" style="margin-left:6px">${_pendingPays.length}</span></div>
        <div style="font-size:12px;color:var(--text3);margin-top:1px">Members say they've paid — confirm once you have the money. Nothing is credited until then.</div>
      </div>
    </div>
    ${rows}
  </div>
  <style>
    .pr-row{display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg3);border-radius:var(--radius-sm);margin-bottom:8px;flex-wrap:wrap}
    .pr-amt{font-size:18px;font-weight:800;color:var(--green)}
    .pr-actions{display:flex;gap:8px;flex-wrap:wrap}
  </style>`;
}

/* ── Apply a payment to the member's rent / utility / meals ──────────────
   Mirrors the write path of saveCollectRow (which is tied to its card UI).
   `row` must be fresh (loadMemberCollectRow). Throws an error with
   `.partial = true` if it failed after some data had already been written, so
   the caller knows retrying would double-apply. */
async function applyCollectPayment(m, month, year, key, row, amount) {
  const split = computeSplit3(amount, row.mealRem, row.utilRem, row.rentRem, row.prevDue);
  const { allocMeal, allocUtil, allocRent, allocPrevDue, change } = split;
  let wrote = false;
  try {
    if (allocUtil > 0 || allocMeal > 0 || allocPrevDue > 0) {
      const { data: latest } = await getClient().from("utility_payments")
        .select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle();
      const bills    = latest?.bills || {};
      const payments = { ...(latest?.payments || {}) };
      const cur      = payments[m.name] || {};
      const newPaid  = round2(Number(cur.paid || 0) + allocUtil);
      payments[m.name] = {
        ...cur,
        paid:          newPaid,
        meal_paid:     round2(Number(cur.meal_paid     || 0) + allocMeal),
        prev_due_paid: round2(Number(cur.prev_due_paid || 0) + allocPrevDue),
        status:        newPaid <= 0 ? "unpaid" : newPaid >= row.utilDue ? "paid" : "partial",
        notes:         cleanText(cur.notes || ""),
      };
      await dbUpsertUtility(month, year, key, bills, payments);
      wrote = true;
    }

    if (allocRent > 0) {
      const { data: latest } = await getClient().from("rent")
        .select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle();
      const existing = latest?.entries || [];
      const entries = members.map(mm => {
        const e = existing.find(x => x.name === mm.name) || {};
        return { name: mm.name, rent: Number(e.rent || 0), paid: Number(e.paid || 0), status: e.status || "unpaid", notes: e.notes || "" };
      });
      const target = entries.find(x => x.name === m.name);
      target.paid   = round2(Number(target.paid || 0) + allocRent);
      target.status = target.paid <= 0 ? "unpaid" : target.paid >= target.rent ? "paid" : "partial";
      await dbUpsertRent(month, year, key, entries);
      wrote = true;
    }

    if (change > 0) {
      const { data: fresh } = await getClient().from("utility_payments")
        .select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle();
      const bills   = { ...(fresh?.bills || {}) };
      const pending = { ...(bills.pending_change || {}) };
      pending[m.name] = round2(Number(pending[m.name] || 0) + change);
      bills.pending_change = pending;
      await dbUpsertUtility(month, year, key, bills, fresh?.payments || {});
      wrote = true;
    }
  } catch (e) {
    e.partial = wrote;
    throw e;
  }
  await logAudit("update", "collect", key, `Confirmed payment ${amount} from ${m.name}`, split);
  return split;
}

/* ── Confirm ─────────────────────────────────── */
async function confirmPaymentRequest(id) {
  if (!requireManager("confirmPaymentRequest")) return;
  const p = _pendingPays.find(x => x.id === id);
  if (!p || _payBusy.has(id)) return;
  _payBusy.add(id); buildPendingPayments();

  let claimed = null;
  try {
    const label = monthLabelFromKey(p.month_key);
    if (await isMonthLocked(p.month_key)) throw new Error(`${label} is locked — unlock it first.`);
    const m = members.find(x => x.id === p.member_id);
    if (!m) throw new Error("Member not found.");

    // Claim first so two managers can't both apply the same payment.
    claimed = await dbClaimMemberPayment(id, "confirmed", currentUser.name);
    if (!claimed) throw new Error("This payment was already confirmed or rejected.");

    const row    = await loadMemberCollectRow(m, p.month, p.year);
    const amount = Number(p.amount);
    const split  = await applyCollectPayment(m, p.month, p.year, p.month_key, row, amount);
    const stillDue = round2(row.total - round2(amount - split.change));
    await dbFinalizeMemberPayment(id, split, stillDue);

    try {
      await dbSaveNotification({
        type: "payment_confirmed", date: today(),
        data: { to_member_id: p.member_id, paymentId: id, amount, monthName: MONTHS[p.month], year: p.year },
        note: "", status: "new",
      });
    } catch (_) { /* the member still sees the status in their list */ }

    const done = { ...claimed, split, still_due: stillDue };
    _paymentCache.set(id, done);
    toast(`Confirmed ${fmtTk(amount)} from ${paymentMemberName(p)} ✓`, "success");
    _payBusy.delete(id);
    try { await loadCollectMonth(); } catch (_) { /* the payment is applied; a manual refresh will show it */ }
    showPaymentReceipt(id);
  } catch (e) {
    _payBusy.delete(id);
    if (claimed && e.partial) {
      // Some of the money was already written — releasing would let a retry apply it twice.
      toast("Payment was only partly applied — check this member's balance in Collect before retrying: " + e.message, "error");
    } else {
      if (claimed) await dbReleaseMemberPayment(id);
      toast("Error: " + e.message, "error");
    }
    try { await loadCollectMonth(); } catch (_) { /* keep the original error toast */ }
  }
}

/* ── Reject ──────────────────────────────────── */
function rejectPaymentRequest(id) {
  if (!requireManager("rejectPaymentRequest")) return;
  const p = _pendingPays.find(x => x.id === id);
  if (!p) return;
  showConfirm({
    title: "Reject payment?",
    body: `${paymentMemberName(p)}'s ${fmtTk(Number(p.amount))} will not be counted.`,
    confirmLabel: "Reject",
    danger: true,
    onConfirm: () => doRejectPaymentRequest(id),
  });
}

async function doRejectPaymentRequest(id) {
  const p = _pendingPays.find(x => x.id === id);
  if (!p || _payBusy.has(id)) return;
  _payBusy.add(id); buildPendingPayments();
  try {
    const claimed = await dbClaimMemberPayment(id, "rejected", currentUser.name);
    if (!claimed) throw new Error("This payment was already confirmed or rejected.");
    await logAudit("update", "collect", p.month_key, `Rejected payment ${p.amount} from ${paymentMemberName(p)}`);
    try {
      await dbSaveNotification({
        type: "payment_rejected", date: today(),
        data: { to_member_id: p.member_id, paymentId: id, amount: Number(p.amount), monthName: MONTHS[p.month], year: p.year },
        note: "", status: "new",
      });
    } catch (_) { /* non-fatal */ }
    toast("Payment rejected", "success");
  } catch (e) {
    toast("Error: " + e.message, "error");
  } finally {
    _payBusy.delete(id);
    await loadPendingPayments();
  }
}
