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

  const dt = d.timestamp.toLocaleString("en-IN", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", hour12:true,
  });

  const messName = currentMess?.name || "Mess";

  // Auto-generated receipt number
  const receiptNo = "RCP-"
    + d.timestamp.getFullYear()
    + String(d.timestamp.getMonth()+1).padStart(2,"0")
    + String(d.timestamp.getDate()).padStart(2,"0")
    + "-" + String(d.timestamp.getHours()).padStart(2,"0")
    + String(d.timestamp.getMinutes()).padStart(2,"0");

  // Allocation rows — only when > 0
  const allocItems = [];
  if (d.allocMeal > 0) allocItems.push({ icon:"🍽️", label:"Meal Balance",  val:d.allocMeal, color:"var(--accent)" });
  if (d.allocUtil > 0) allocItems.push({ icon:"⚡",  label:"Utility",       val:d.allocUtil, color:"var(--blue)"   });
  if (d.allocRent > 0) allocItems.push({ icon:"🏠",  label:"Room Rent",     val:d.allocRent, color:"var(--blue)"   });

  // Balance-after rows
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

  // Stash plain text + raw data so Copy/WhatsApp/Print can grab them.
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
    // Fallback for older browsers / non-secure contexts
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

  let frame = document.getElementById("_rcpt-print-frame");
  if (frame) frame.remove();
  frame = document.createElement("iframe");
  frame.id = "_rcpt-print-frame";
  frame.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;";
  document.body.appendChild(frame);
  const w = frame.contentWindow;

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

  // Allocation rows
  const allocItems = [];
  if (d.allocMeal > 0) allocItems.push({ icon:"🍽️", label:"Meal Balance",  val:d.allocMeal, color:"#b8914a" });
  if (d.allocUtil > 0) allocItems.push({ icon:"⚡",  label:"Utility",       val:d.allocUtil, color:"#3a7bd5" });
  if (d.allocRent > 0) allocItems.push({ icon:"🏠",  label:"Room Rent",     val:d.allocRent, color:"#3a7bd5" });

  // Balance-after rows
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
  frame.onload = function() {
    setTimeout(() => { w.focus(); w.print(); }, 250);
  };
}

