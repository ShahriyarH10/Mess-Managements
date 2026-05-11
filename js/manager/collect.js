/* ═══════════════════════════════════════════════
   MANAGER — Collect Payment (Quick Settle)
   Member hands over cash → auto-split proportionally
   between Meal-balance, Utility and Room Rent for the
   selected settlement month. Excess → "Change to return".

   NEW: Mess Owes Credit
   When netPayable < 0, the mess owes the member money.
   Manager can draw a custom amount from that credit.
   Any remaining credit carries forward to the next
   month's utility record as bills.mess_credit[memberName].
   calcMemberSettlement picks that up to offset next month.

   Writes to existing tables only:
     • utility_payments.payments[name].paid       (utility cash)
     • utility_payments.payments[name].meal_paid  (meal cash)
     • utility_payments.bills.mess_credit[name]   (carry-fwd credit)
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
      <div class="page-sub">Quick settle · Draw from Mess Owes credit · Remainder carries forward</div>
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
        goes into <code>meal_paid</code>, utility into <code>paid</code>, rent into <code>rent.entries.paid</code>.<br><br>
        <b>💡 Mess Owes Credit:</b> When the mess owes a member (negative net), use the
        <b>Take Credit</b> panel to draw a custom cash amount. Any leftover credit automatically
        carries forward to next month's utility bills as a deduction.
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

    <div class="card" id="cp-credit-card" style="display:none">
      <div class="card-title">🏦 Mess Owes — Credit Drawdown</div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:12px">
        These members have a <b>negative net payable</b> — the mess owes them money.
        Enter how much cash to hand back now. Any unpaid remainder will
        <b>carry forward</b> to next month's utility deduction automatically.
      </div>
      <div id="cp-credit-wrap"></div>
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
  const next = nextMonth(month, year);

  const [allMeals, allBazar, utilCurR, utilPrevR, rentR, utilNextR] = await Promise.all([
    dbGetAll("meals"),
    dbGetAll("bazar"),
    sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle(),
    sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", prev.key).maybeSingle(),
    sb.from("rent").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle(),
    sb.from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", next.key).maybeSingle(),
  ]);

  const utilRec     = utilCurR.data  || null;
  const utilRecPrev = utilPrevR.data || null;
  const rentRec     = rentR.data     || null;
  const utilRecNext = utilNextR.data || null;

  // Existing carry-forward credits stored in NEXT month's bills
  const existingCredits = utilRecNext?.bills?.mess_credit || {};

  const perMember = {};
  members.forEach(m => {
    const p = calcMemberSettlement(m, allMeals, allBazar, rentRec, utilRec, utilRecPrev, key);
    perMember[m.id] = {
      name:          m.name,
      mealCost:      p.mealCost,
      memberBazar:   p.memberBazar,
      mealPaid:      p.mealPaid,
      utilDue:       round2(p.prepaidUtility + p.postpaidUtility),
      utilPaid:      p.utilityPaid,
      rentDue:       p.roomRent,
      rentPaid:      p.roomRentPaid,
      netPayable:    p.netPayable,
      // Carry-forward credit applied FROM last month INTO this month
      messCredit:    p.messCredit,
      // Credit already stored in next month for this member
      existingCarryCredit: round2(Number(existingCredits[m.name] || 0)),
    };
  });

  _collectCtx = { month, year, key, prevKey: prev.key, nextMonth: next, utilRec, utilRecNext, rentRec, perMember, existingCredits };
  buildCollectTable();
  buildCreditTable();
}

function buildCollectTable() {
  const wrap = document.getElementById("cp-table-wrap");
  if (!wrap) return;
  if (!members.length) { wrap.innerHTML = '<div class="empty">No members in this mess</div>'; return; }

  // Only show members who owe money (net > 0) in this table
  const owing = members.filter(m => (_collectCtx.perMember[m.id]?.netPayable || 0) > 0);

  if (!owing.length) {
    wrap.innerHTML = '<div class="empty" style="padding:18px;text-align:center">✅ All members are settled for this month!</div>';
    return;
  }

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
          ${owing.map(m => {
            const r = _collectCtx.perMember[m.id];
            const mealRem = round2(r.mealCost - r.memberBazar - r.mealPaid);
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
                    value="${r.messCredit > 0 && net > 0 ? net : ''}"
                    oninput="onCollectAmtInput('${m.id}')"/>
                  ${r.messCredit > 0 ? `<div style="font-size:10px;color:var(--blue);margin-top:3px">↩ ৳${r.messCredit} credit applied</div>` : ''}
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

  // Trigger split calculation for any pre-filled inputs (carry-forward applied members)
  owing.forEach(m => {
    const r = _collectCtx.perMember[m.id];
    if (r.messCredit > 0 && r.netPayable > 0) onCollectAmtInput(m.id);
  });
}

function buildCreditTable() {
  const card = document.getElementById("cp-credit-card");
  const wrap = document.getElementById("cp-credit-wrap");
  if (!wrap || !card) return;

  // Members where mess owes them (netPayable <= 0, with some meaningful credit)
  const creditMembers = members.filter(m => {
    const r = _collectCtx.perMember[m.id];
    return r && r.netPayable < 0;
  });

  if (!creditMembers.length) {
    card.style.display = "none";
    return;
  }

  card.style.display = "";
  const { nextMonth: nm } = _collectCtx;

  wrap.innerHTML = `
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Member</th>
            <th>Mess Owes Total</th>
            <th>Already Carried Fwd</th>
            <th>Remaining Credit</th>
            <th>Cash to Hand Back Now (৳)</th>
            <th>Will Carry to ${MONTHS[nm.month]} ${nm.year}</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${creditMembers.map(m => {
            const r = _collectCtx.perMember[m.id];
            const messOwes      = round2(Math.abs(r.netPayable)); // total mess owes
            const alreadyFwd    = round2(r.existingCarryCredit);
            const remainingCred = round2(messOwes - alreadyFwd);

            return `
              <tr id="ccr-${m.id}">
                <td><b>${m.name}</b></td>
                <td style="color:var(--green);font-weight:700">${fmtTk(messOwes)}</td>
                <td style="color:var(--blue);font-weight:600" id="cc-fwd-${m.id}">
                  ${alreadyFwd > 0 ? fmtTk(alreadyFwd) : '—'}
                </td>
                <td style="color:var(--amber);font-weight:700" id="cc-rem-${m.id}">
                  ${fmtTk(Math.max(0, remainingCred))}
                </td>
                <td>
                  <input type="number" class="input input-sm" id="cc-amt-${m.id}"
                    min="0" max="${Math.max(0, remainingCred)}" step="1"
                    placeholder="0" style="width:120px"
                    oninput="onCreditAmtInput('${m.id}')"/>
                </td>
                <td style="color:var(--blue);font-weight:600" id="cc-carry-${m.id}">
                  ${fmtTk(Math.max(0, remainingCred))}
                </td>
                <td>
                  <button class="btn btn-sm" style="background:var(--green-bg);border:1px solid var(--green);color:var(--green)"
                    onclick="saveCreditRow('${m.id}')">💸 Save</button>
                </td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
    <div style="margin-top:10px;padding:10px 14px;background:var(--bg3);border-radius:8px;font-size:12px;color:var(--text3)">
      💡 <b>Tip:</b> Enter ৳0 and Save to carry the full amount to next month. The carry-forward
      credit will automatically reduce ${MONTHS[nm.month]} ${nm.year} utility dues for that member.
    </div>`;
}

/* ── Live preview for credit drawdown ── */
function onCreditAmtInput(memberId) {
  if (!_collectCtx) return;
  const r = _collectCtx.perMember[memberId];
  if (!r) return;
  const messOwes      = round2(Math.abs(r.netPayable));
  const alreadyFwd    = round2(r.existingCarryCredit);
  const remainingCred = round2(Math.max(0, messOwes - alreadyFwd));

  const raw     = parseFloat(document.getElementById("cc-amt-" + memberId)?.value || 0);
  const cashNow = round2(Math.min(Math.max(0, raw), remainingCred));
  const carryFwd = round2(remainingCred - cashNow);

  const carry = document.getElementById("cc-carry-" + memberId);
  if (carry) {
    carry.textContent = fmtTk(carryFwd);
    carry.style.color = carryFwd > 0 ? "var(--blue)" : "var(--green)";
  }
}

/* ── Save credit drawdown + carry-forward ── */
async function saveCreditRow(memberId) {
  if (!_collectCtx) return;
  const ctx = _collectCtx;
  const r   = ctx.perMember[memberId];
  const m   = members.find(x => x.id === memberId);
  if (!r || !m) return;

  const messOwes      = round2(Math.abs(r.netPayable));
  const alreadyFwd    = round2(r.existingCarryCredit);
  const remainingCred = round2(Math.max(0, messOwes - alreadyFwd));

  const raw     = parseFloat(document.getElementById("cc-amt-" + memberId)?.value || 0);
  const cashNow = round2(Math.min(Math.max(0, raw), remainingCred));
  const newCarry = round2(remainingCred - cashNow);

  try {
    // Load the NEXT month's utility record fresh (avoid stale data)
    const nm = ctx.nextMonth;
    const { data: latestNext } = await sb.from("utility_payments")
      .select("*").eq("mess_id", messId()).eq("month_key", nm.key).maybeSingle();

    const nextBills    = { ...(latestNext?.bills    || {}) };
    const nextPayments = { ...(latestNext?.payments || {}) };

    // Update mess_credit map for this member
    const existCredit = { ...(nextBills.mess_credit || {}) };
    if (newCarry > 0) {
      existCredit[m.name] = newCarry;
    } else {
      delete existCredit[m.name]; // zero carry — remove entry
    }
    nextBills.mess_credit = existCredit;

    await dbUpsertUtility(nm.month, nm.year, nm.key, nextBills, nextPayments);

    // Update in-memory
    r.existingCarryCredit = round2(alreadyFwd + newCarry);
    ctx.existingCredits[m.name] = newCarry;

    // Refresh carry-fwd display in table
    const fwdEl = document.getElementById("cc-fwd-" + memberId);
    if (fwdEl) {
      const total = round2(alreadyFwd + newCarry);
      fwdEl.textContent = total > 0 ? fmtTk(total) : "—";
    }
    const remEl = document.getElementById("cc-rem-" + memberId);
    if (remEl) remEl.textContent = fmtTk(Math.max(0, remainingCred - newCarry - alreadyFwd + alreadyFwd));

    const amtEl = document.getElementById("cc-amt-" + memberId);
    if (amtEl) amtEl.value = "";
    onCreditAmtInput(memberId);

    const parts = [];
    if (cashNow > 0)  parts.push(`Cash handed back: ${fmtTk(cashNow)}`);
    if (newCarry > 0) parts.push(`Carry to ${MONTHS[nm.month]} ${nm.year}: ${fmtTk(newCarry)}`);
    toast("Credit saved ✓  " + (parts.join("  ·  ") || "No change"), "success");

    // Show credit receipt
    showCreditReceipt({ member: m, monthLabel: monthLabelFromKey(ctx.key), cashNow, newCarry, nextMonthLabel: MONTHS[nm.month] + " " + nm.year, messOwes, timestamp: new Date() });

  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

/* Proportional split across 3 buckets (only positive remaining counts).
   Excess (amount > sum) → change.            */
function computeSplit3(amount, mealRem, utilRem, rentRem) {
  amount  = Math.max(0, round2(amount  || 0));
  const m = Math.max(0, round2(mealRem || 0));
  const u = Math.max(0, round2(utilRem || 0));
  const r = Math.max(0, round2(rentRem || 0));
  const totalRem = round2(m + u + r);

  if (amount <= 0)        return { allocMeal: 0, allocUtil: 0, allocRent: 0, change: 0 };
  if (totalRem <= 0)      return { allocMeal: 0, allocUtil: 0, allocRent: 0, change: amount };
  if (amount >= totalRem) return { allocMeal: m, allocUtil: u, allocRent: r, change: round2(amount - totalRem) };

  const allocMeal = round2((amount * m) / totalRem);
  const allocUtil = round2((amount * u) / totalRem);
  const allocRent = round2(amount - allocMeal - allocUtil);
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

    /* ── 3) Refresh in-memory ctx ── */
    r.utilPaid   = round2(r.utilPaid   + allocUtil);
    r.rentPaid   = round2(r.rentPaid   + allocRent);
    r.mealPaid   = round2(r.mealPaid   + allocMeal);
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

    // If member is now owed (netPayable < 0), rebuild credit table
    if (r.netPayable < 0) {
      buildCreditTable();
    }

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
   Credit Receipt — compact modal for Mess Owes drawdown
   ═════════════════════════════════════════════════════════════════ */
function buildCreditReceiptText(d) {
  const messName = currentMess?.name || "Mess";
  const dt = d.timestamp.toLocaleString("en-IN", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", hour12:true
  });
  const lines = [];
  lines.push(`🏦 CREDIT DRAWDOWN NOTICE`);
  lines.push(`─────────────────────`);
  lines.push(`Mess:    ${messName}`);
  lines.push(`Member:  ${d.member.name}`);
  lines.push(`Month:   ${d.monthLabel}`);
  lines.push(`Date:    ${dt}`);
  lines.push(``);
  lines.push(`Mess owed total:  ${fmtTk(d.messOwes)}`);
  lines.push(`─────────────────────`);
  if (d.cashNow > 0)  lines.push(`💵 Cash handed back now:  ${fmtTk(d.cashNow)}`);
  if (d.newCarry > 0) lines.push(`↩ Carried to ${d.nextMonthLabel}:  ${fmtTk(d.newCarry)}`);
  lines.push(`─────────────────────`);
  lines.push(d.newCarry > 0
    ? `Remaining credit carried forward: ${fmtTk(d.newCarry)}`
    : `✓ Credit fully settled`);
  lines.push(``);
  lines.push(`— sent from ${messName} manager`);
  return lines.join("\n");
}

function showCreditReceipt(d) {
  const messName = currentMess?.name || "Mess";
  const dt = d.timestamp.toLocaleString("en-IN", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", hour12:true
  });

  const receiptNo = "CRD-"
    + d.timestamp.getFullYear()
    + String(d.timestamp.getMonth()+1).padStart(2,"0")
    + String(d.timestamp.getDate()).padStart(2,"0")
    + "-" + String(d.timestamp.getHours()).padStart(2,"0")
    + String(d.timestamp.getMinutes()).padStart(2,"0");

  const isFullySettled = d.newCarry === 0;

  const phoneRaw = (d.member.phone || "").replace(/[^\d]/g, "");
  const phone = phoneRaw.length === 11 && phoneRaw.startsWith("0")
    ? "880" + phoneRaw.slice(1) : phoneRaw;
  const text = buildCreditReceiptText(d);
  const waUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  const html = `
  <style>
    #crdt-modal{font-family:var(--font);max-width:420px;margin:0 auto;}
    .crdt-head{text-align:center;padding:4px 0 16px;border-bottom:2px dashed var(--border2);margin-bottom:16px;}
    .crdt-head-icon{font-size:30px;line-height:1;margin-bottom:6px;}
    .crdt-head-name{font-family:var(--font-serif);font-size:21px;font-weight:700;color:var(--text);}
    .crdt-head-sub{font-size:10px;color:var(--text3);letter-spacing:.8px;text-transform:uppercase;margin-top:3px;}
    .crdt-badge{display:inline-block;margin-top:8px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;}
    .crdt-badge-ok{background:var(--green-bg);color:var(--green);border:1px solid rgba(76,175,130,.3);}
    .crdt-badge-fwd{background:var(--blue-bg,rgba(52,152,219,.1));color:var(--blue);border:1px solid rgba(52,152,219,.3);}
    .crdt-meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;background:var(--bg3);border-radius:8px;padding:10px 14px;margin-bottom:14px;}
    .crdt-ml{display:flex;flex-direction:column;gap:1px;}
    .crdt-ml span:first-child{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--text3);}
    .crdt-ml span:last-child{font-size:12px;font-weight:600;color:var(--text);}
    .crdt-hero{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:var(--green-bg);border:2px solid rgba(76,175,130,.45);border-radius:10px;margin-bottom:14px;}
    .crdt-hero-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--green);}
    .crdt-hero-sub{font-size:11px;color:var(--text3);margin-top:2px;}
    .crdt-hero-amt{font-size:26px;font-weight:800;color:var(--green);}
    .crdt-sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:var(--text3);display:flex;align-items:center;gap:8px;margin:14px 0 7px;}
    .crdt-sec::after{content:'';flex:1;height:1px;background:var(--border2);}
    .crdt-row{display:flex;justify-content:space-between;align-items:center;padding:10px 13px;background:var(--bg3);border-radius:7px;margin-bottom:6px;}
    .crdt-row-left{display:flex;align-items:center;gap:10px;}
    .crdt-row-ico{font-size:18px;line-height:1;}
    .crdt-row-lbl{font-size:13px;font-weight:600;color:var(--text);}
    .crdt-row-sub{font-size:10px;color:var(--text3);margin-top:1px;}
    .crdt-row-val{font-size:15px;font-weight:800;}
    .crdt-hr{border:none;border-top:2px dashed var(--border2);margin:14px 0;}
    .crdt-net{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-radius:10px;margin-top:12px;font-weight:800;font-size:15px;}
    .crdt-net-ok{background:var(--green-bg);border:2px solid rgba(76,175,130,.45);}
    .crdt-net-fwd{background:var(--bg3);border:2px solid var(--blue);}
    .crdt-foot{text-align:center;padding:12px 0 2px;border-top:2px dashed var(--border2);margin-top:14px;}
    .crdt-foot-txt{font-size:10px;color:var(--text3);letter-spacing:.4px;}
    .crdt-btns{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px;}
    .crdt-btns .btn{flex:1;min-width:90px;justify-content:center;}
  </style>

  <div id="crdt-modal">

    <!-- ── Header ── -->
    <div class="crdt-head">
      <div class="crdt-head-icon">🏦</div>
      <div class="crdt-head-name">${messName}</div>
      <div class="crdt-head-sub">Credit Drawdown Receipt</div>
      <span class="crdt-badge ${isFullySettled ? 'crdt-badge-ok' : 'crdt-badge-fwd'}">
        ${isFullySettled ? "✓ Fully Settled" : "↩ Partially Carried"}
      </span>
    </div>

    <!-- ── Meta grid ── -->
    <div class="crdt-meta">
      <div class="crdt-ml">
        <span>Receipt No.</span>
        <span style="font-family:monospace;font-size:11px">${receiptNo}</span>
      </div>
      <div class="crdt-ml">
        <span>Date &amp; Time</span>
        <span style="font-size:11px">${dt}</span>
      </div>
      <div class="crdt-ml" style="margin-top:5px">
        <span>Member</span>
        <span>${d.member.name}</span>
      </div>
      <div class="crdt-ml" style="margin-top:5px">
        <span>Settlement Month</span>
        <span>${d.monthLabel}</span>
      </div>
    </div>

    <!-- ── Mess owed hero ── -->
    <div class="crdt-hero">
      <div>
        <div class="crdt-hero-lbl">Mess Owed to Member</div>
        <div class="crdt-hero-sub">Total credit for ${d.monthLabel}</div>
      </div>
      <div class="crdt-hero-amt">${fmtTk(d.messOwes)}</div>
    </div>

    <!-- ── Breakdown ── -->
    <div class="crdt-sec">Credit Breakdown</div>

    ${d.cashNow > 0 ? `
    <div class="crdt-row">
      <div class="crdt-row-left">
        <span class="crdt-row-ico">💵</span>
        <div>
          <div class="crdt-row-lbl">Cash Handed Back</div>
          <div class="crdt-row-sub">Given to ${d.member.name} now</div>
        </div>
      </div>
      <span class="crdt-row-val" style="color:var(--green)">${fmtTk(d.cashNow)}</span>
    </div>` : ""}

    ${d.newCarry > 0 ? `
    <div class="crdt-row" style="border:1px solid var(--blue)">
      <div class="crdt-row-left">
        <span class="crdt-row-ico">↩</span>
        <div>
          <div class="crdt-row-lbl">Carried to ${d.nextMonthLabel}</div>
          <div class="crdt-row-sub">Auto-deducted from utility bills</div>
        </div>
      </div>
      <span class="crdt-row-val" style="color:var(--blue)">${fmtTk(d.newCarry)}</span>
    </div>` : ""}

    ${d.cashNow === 0 && d.newCarry === 0 ? `
    <div class="crdt-row" style="color:var(--text3);font-size:12px;justify-content:center">
      No action recorded.
    </div>` : ""}

    <hr class="crdt-hr">

    <!-- ── Final status ── -->
    <div class="crdt-net ${isFullySettled ? 'crdt-net-ok' : 'crdt-net-fwd'}">
      <span>Credit Status</span>
      <span style="color:${isFullySettled ? 'var(--green)' : 'var(--blue)'}">
        ${isFullySettled ? "✓ Fully settled" : `↩ ${fmtTk(d.newCarry)} carried forward`}
      </span>
    </div>

    <!-- ── Footer ── -->
    <div class="crdt-foot">
      <div class="crdt-foot-txt">— Generated by ${messName} Manager —</div>
      ${d.member.phone ? "" : `<div style="font-size:10px;color:var(--text3);margin-top:4px">💡 Add ${d.member.name}'s phone to enable direct WhatsApp</div>`}
    </div>

    <!-- ── Actions ── -->
    <div class="crdt-btns">
      <button class="btn btn-primary btn-sm" onclick="copyCreditReceipt(this)">📋 Copy</button>
      <a class="btn btn-sm" href="${waUrl}" target="_blank" rel="noopener"
         style="background:#25D366;border:1px solid #1fb759;color:#fff;display:flex;align-items:center;justify-content:center;gap:4px;text-decoration:none;border-radius:var(--radius-sm)">
        💬 WhatsApp
      </a>
      <button class="btn btn-ghost btn-sm" onclick="printCreditReceipt()">🖨 Print</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()" style="margin-left:auto">✕ Close</button>
    </div>

  </div>`;

  window._lastCreditReceiptText = text;
  window._lastCreditReceiptData = d;
  document.getElementById("modal-content").innerHTML = html;
  document.querySelector(".modal").classList.remove("modal-wide");
  openModal();
}

async function copyCreditReceipt(btn) {
  const text = window._lastCreditReceiptText || "";
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { const o = btn.textContent; btn.textContent = "✓ Copied"; setTimeout(() => btn.textContent = o, 1600); }
    toast("Receipt copied to clipboard", "success");
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Receipt copied", "success"); }
    catch (_) { toast("Copy failed", "error"); }
    document.body.removeChild(ta);
  }
}

function printCreditReceipt() {
  const d = window._lastCreditReceiptData;
  if (!d) { toast("No receipt data", "error"); return; }

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  let w, frame;
  if (isSafari) {
    w = window.open("", "_blank", "width=480,height=700");
    if (!w) { toast("Pop-up blocked — allow pop-ups to print", "error"); return; }
  } else {
    frame = document.getElementById("_crdt-print-frame");
    if (frame) frame.remove();
    frame = document.createElement("iframe");
    frame.id = "_crdt-print-frame";
    frame.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;";
    document.body.appendChild(frame);
    w = frame.contentWindow;
  }

  const messName = currentMess?.name || "Mess";
  const dt = d.timestamp.toLocaleString("en-IN", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", hour12:true,
  });
  const receiptNo = "CRD-"
    + d.timestamp.getFullYear()
    + String(d.timestamp.getMonth()+1).padStart(2,"0")
    + String(d.timestamp.getDate()).padStart(2,"0")
    + "-" + String(d.timestamp.getHours()).padStart(2,"0")
    + String(d.timestamp.getMinutes()).padStart(2,"0");

  const isFullySettled = d.newCarry === 0;
  const fmtTkP = (v) => "৳" + Number(v).toLocaleString("en-IN", {minimumFractionDigits:0, maximumFractionDigits:2});

  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Credit Receipt — ${d.member.name}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#222;padding:28px 24px;max-width:440px;margin:0 auto;}
    .head{text-align:center;padding-bottom:16px;border-bottom:2px dashed #ccc;margin-bottom:16px;}
    .head-icon{font-size:32px;line-height:1;margin-bottom:6px;}
    .head-name{font-size:22px;font-weight:700;}
    .head-sub{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.8px;margin-top:3px;}
    .badge{display:inline-block;margin-top:8px;padding:3px 12px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;}
    .badge-ok{background:#e8f8f0;color:#27ae60;border:1px solid #b2dfce;}
    .badge-fwd{background:#ebf5fb;color:#2980b9;border:1px solid #aed6f1;}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;background:#f7f7f7;border-radius:8px;padding:10px 14px;margin-bottom:14px;border:1px solid #eee;}
    .ml{display:flex;flex-direction:column;gap:1px;}
    .ml-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#999;}
    .ml-val{font-size:12px;font-weight:600;color:#222;}
    .hero{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#e8f8f0;border:2px solid #b2dfce;border-radius:10px;margin-bottom:14px;}
    .hero-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#27ae60;}
    .hero-sub{font-size:11px;color:#999;margin-top:2px;}
    .hero-amt{font-size:26px;font-weight:800;color:#27ae60;}
    .sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:#aaa;display:flex;align-items:center;gap:8px;margin:14px 0 7px;}
    .sec::after{content:'';flex:1;height:1px;background:#ddd;}
    .row{display:flex;justify-content:space-between;align-items:center;padding:10px 13px;background:#f7f7f7;border-radius:7px;margin-bottom:6px;}
    .row-left{display:flex;align-items:center;gap:10px;}
    .row-ico{font-size:18px;line-height:1;}
    .row-lbl{font-size:13px;font-weight:600;color:#222;}
    .row-sub{font-size:10px;color:#888;margin-top:1px;}
    .row-val{font-size:15px;font-weight:800;}
    .divider{border:none;border-top:2px dashed #ccc;margin:14px 0;}
    .net{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-radius:10px;margin-top:12px;font-weight:800;font-size:15px;}
    .net-ok{background:#e8f8f0;border:2px solid #b2dfce;}
    .net-fwd{background:#ebf5fb;border:2px solid #aed6f1;}
    .foot{text-align:center;padding:12px 0 2px;border-top:2px dashed #ccc;margin-top:16px;}
    .foot-txt{font-size:10px;color:#aaa;letter-spacing:.4px;}
    @media print{body{padding:16px 14px;}@page{margin:10mm;size:A5;}}
  </style>
</head>
<body>
  <div class="head">
    <div class="head-icon">🏦</div>
    <div class="head-name">${messName}</div>
    <div class="head-sub">Credit Drawdown Receipt</div>
    <span class="badge ${isFullySettled ? 'badge-ok' : 'badge-fwd'}">${isFullySettled ? "✓ Fully Settled" : "↩ Partially Carried"}</span>
  </div>

  <div class="meta">
    <div class="ml"><span class="ml-lbl">Receipt No.</span><span class="ml-val" style="font-family:monospace;font-size:11px">${receiptNo}</span></div>
    <div class="ml"><span class="ml-lbl">Date &amp; Time</span><span class="ml-val" style="font-size:11px">${dt}</span></div>
    <div class="ml" style="margin-top:5px"><span class="ml-lbl">Member</span><span class="ml-val">${d.member.name}</span></div>
    <div class="ml" style="margin-top:5px"><span class="ml-lbl">Settlement Month</span><span class="ml-val">${d.monthLabel}</span></div>
  </div>

  <div class="hero">
    <div>
      <div class="hero-lbl">Mess Owed to Member</div>
      <div class="hero-sub">Total credit for ${d.monthLabel}</div>
    </div>
    <div class="hero-amt">${fmtTkP(d.messOwes)}</div>
  </div>

  <div class="sec">Credit Breakdown</div>

  ${d.cashNow > 0 ? `
  <div class="row">
    <div class="row-left">
      <span class="row-ico">💵</span>
      <div>
        <div class="row-lbl">Cash Handed Back</div>
        <div class="row-sub">Given to ${d.member.name} now</div>
      </div>
    </div>
    <span class="row-val" style="color:#27ae60">${fmtTkP(d.cashNow)}</span>
  </div>` : ""}

  ${d.newCarry > 0 ? `
  <div class="row" style="border:1px solid #aed6f1">
    <div class="row-left">
      <span class="row-ico">↩</span>
      <div>
        <div class="row-lbl">Carried to ${d.nextMonthLabel}</div>
        <div class="row-sub">Auto-deducted from utility bills</div>
      </div>
    </div>
    <span class="row-val" style="color:#2980b9">${fmtTkP(d.newCarry)}</span>
  </div>` : ""}

  <hr class="divider">

  <div class="net ${isFullySettled ? 'net-ok' : 'net-fwd'}">
    <span>Credit Status</span>
    <span style="color:${isFullySettled ? '#27ae60' : '#2980b9'}">
      ${isFullySettled ? "✓ Fully settled" : `↩ ${fmtTkP(d.newCarry)} carried forward`}
    </span>
  </div>

  <div class="foot">
    <div class="foot-txt">— Generated by ${messName} Manager —</div>
  </div>
</body>
</html>`);
  w.document.close();
  if (isSafari) {
    setTimeout(() => { w.focus(); w.print(); }, 250);
  } else {
    frame.onload = function() { setTimeout(() => { w.focus(); w.print(); }, 250); };
  }
}

/* ═════════════════════════════════════════════════════════════════
   Shareable receipt — opens in modal after a successful save.
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
  const phone = phoneRaw.length === 11 && phoneRaw.startsWith("0")
    ? "880" + phoneRaw.slice(1)
    : phoneRaw;
  const waUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  const dt = d.timestamp.toLocaleString("en-IN", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", hour12:true,
  });

  const messName = currentMess?.name || "Mess";

  const receiptNo = "RCP-"
    + d.timestamp.getFullYear()
    + String(d.timestamp.getMonth()+1).padStart(2,"0")
    + String(d.timestamp.getDate()).padStart(2,"0")
    + "-" + String(d.timestamp.getHours()).padStart(2,"0")
    + String(d.timestamp.getMinutes()).padStart(2,"0");

  const allocItems = [];
  if (d.allocMeal > 0) allocItems.push({ icon:"🍽️", label:"Meal Balance",  val:d.allocMeal, color:"var(--accent)" });
  if (d.allocUtil > 0) allocItems.push({ icon:"⚡",  label:"Utility",       val:d.allocUtil, color:"var(--blue)"   });
  if (d.allocRent > 0) allocItems.push({ icon:"🏠",  label:"Room Rent",     val:d.allocRent, color:"var(--blue)"   });

  const statusItems = [
    { icon:"🍽️", label:"Meal Balance",      val:d.newMealRem, signed:true,
      note: d.newMealRem > 0 ? "Still owing" : d.newMealRem < 0 ? "Owed back to member" : "Cleared" },
    { icon:"⚡",  label:"Utility Remaining", val:d.newUtilRem,
      note: d.newUtilRem > 0 ? "Still pending" : "Cleared" },
    { icon:"🏠",  label:"Rent Remaining",    val:d.newRentRem,
      note: d.newRentRem > 0 ? "Still pending" : "Cleared" },
  ];

  const isSettled = d.newNet <= 0;
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
      <span class="rcpt-badge ${isSettled ? 'rcpt-badge-settled' : 'rcpt-badge-due'}">
        ${isSettled ? "✓ Settled" : "Partially Paid"}
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
        <div class="rcpt-hero-lbl">Amount Received</div>
        <div class="rcpt-hero-sub">Cash handed over by member</div>
      </div>
      <div class="rcpt-hero-amt">${fmtTk(d.amountReceived)}</div>
    </div>

    <!-- ── Payment breakdown ── -->
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
    `}

    <!-- ── Change to return ── -->
    ${d.change > 0 ? `
      <div class="rcpt-change">
        <div>
          <div style="font-weight:700;color:var(--green);font-size:13px">💸 Change to Return</div>
          <div style="font-size:11px;color:var(--text3)">Hand this back to the member</div>
        </div>
        <div style="font-weight:800;color:var(--green);font-size:18px">${fmtTk(d.change)}</div>
      </div>
    ` : ""}

    <hr class="rcpt-hr">

    <!-- ── Balance after ── -->
    <div class="rcpt-sec">Balance After This Payment</div>
    ${statusItems.map(r => {
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
    <div class="rcpt-net ${isSettled ? 'rcpt-net-ok' : 'rcpt-net-due'}">
      <span>Total Net Balance</span>
      <span style="color:${netColor}">${netLabel}</span>
    </div>

    <!-- ── Footer ── -->
    <div class="rcpt-foot">
      <div class="rcpt-foot-txt">— Generated by ${messName} Manager —</div>
      ${d.member.phone ? "" : `<div style="font-size:10px;color:var(--text3);margin-top:4px">💡 Add ${d.member.name}'s phone to enable direct WhatsApp</div>`}
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
  const dt = d.timestamp.toLocaleString("en-IN", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", hour12:true,
  });
  const receiptNo = "RCP-"
    + d.timestamp.getFullYear()
    + String(d.timestamp.getMonth()+1).padStart(2,"0")
    + String(d.timestamp.getDate()).padStart(2,"0")
    + "-" + String(d.timestamp.getHours()).padStart(2,"0")
    + String(d.timestamp.getMinutes()).padStart(2,"0");

  const isSettled = d.newNet <= 0;

  const fmtTkP = (v) => "৳" + Number(v).toLocaleString("en-IN", {minimumFractionDigits:0, maximumFractionDigits:2});

  const allocItems = [];
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
    <span class="badge ${isSettled ? 'badge-ok' : 'badge-due'}">${isSettled ? "✓ Settled" : "Partially Paid"}</span>
  </div>

  <div class="meta">
    <div class="ml"><span class="ml-lbl">Receipt No.</span><span class="ml-val" style="font-family:monospace;font-size:11px">${receiptNo}</span></div>
    <div class="ml"><span class="ml-lbl">Date &amp; Time</span><span class="ml-val" style="font-size:11px">${dt}</span></div>
    <div class="ml" style="margin-top:5px"><span class="ml-lbl">Member</span><span class="ml-val">${d.member.name}</span></div>
    <div class="ml" style="margin-top:5px"><span class="ml-lbl">Settlement Month</span><span class="ml-val">${d.monthLabel}</span></div>
  </div>

  <div class="hero">
    <div>
      <div class="hero-lbl">Amount Received</div>
      <div class="hero-sub">Cash handed over by member</div>
    </div>
    <div class="hero-amt">${fmtTkP(d.amountReceived)}</div>
  </div>

  <div class="sec">Payment Breakdown</div>
  ${allocHtml}
  ${changeHtml}

  <hr class="divider">

  <div class="sec">Balance After This Payment</div>
  ${statusHtml}

  <div class="net ${isSettled ? 'net-ok' : 'net-due'}">
    <span>Total Net Balance</span>
    <span style="color:${netColor}">${netLabel}</span>
  </div>

  <div class="foot">
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
