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
      <div class="page-sub">Enter the cash a member hands over — it splits automatically</div>
    </div>
  </div>
  <div class="content">

    <!-- Month picker + how-it-works -->
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <select class="input" id="cp-month" style="width:148px">${opts.monthOptions}</select>
        <select class="input" id="cp-year"  style="width:92px">${opts.yearOptions}</select>
        <button class="btn btn-primary btn-sm" onclick="loadCollectMonth()" style="gap:6px">
          ↻ Load
        </button>
      </div>

      <!-- Compact how-it-works pills -->
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">
        <div class="cp-pill cp-pill-red">
          <span class="cp-pill-num">1</span>
          <div>
            <div class="cp-pill-title">Enter cash received</div>
            <div class="cp-pill-body">Type how much the member handed you</div>
          </div>
        </div>
        <div class="cp-pill cp-pill-amber">
          <span class="cp-pill-num">2</span>
          <div>
            <div class="cp-pill-title">Split previews live</div>
            <div class="cp-pill-body">Auto-fills: Prev.Due → Rent → Utility → Meal</div>
          </div>
        </div>
        <div class="cp-pill cp-pill-green">
          <span class="cp-pill-num">3</span>
          <div>
            <div class="cp-pill-title">Hit Save</div>
            <div class="cp-pill-body">Overpay? Change shown — carry forward if needed</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Member payment cards -->
    <div id="cp-table-wrap">
      <div class="empty" style="padding:32px;text-align:center">
        <div style="font-size:32px;margin-bottom:8px">💵</div>
        <div style="font-size:14px;color:var(--text2)">Pick a month above and click <b>↻ Load</b></div>
      </div>
    </div>

    <!-- Return Amount section — overpaid change + negative balance, merged -->
    <div class="card" id="cp-return-card" style="display:none;margin-top:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="width:34px;height:34px;border-radius:50%;background:var(--green-bg);border:1.5px solid var(--green);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0">💵</div>
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--green)">Return Amount to These Members</div>
          <div style="font-size:12px;color:var(--text3);margin-top:1px">Overpaid change and negative balances — hand cash back now or carry it forward</div>
        </div>
      </div>
      <div id="cp-return-wrap"></div>
    </div>

  </div>

  <style>
    /* ── How-it-works pills ── */
    .cp-pill{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg3);flex:1;min-width:180px;}
    .cp-pill-red{border-color:rgba(224,82,82,.25);background:var(--red-bg);}
    .cp-pill-amber{border-color:rgba(212,168,83,.25);background:var(--accent-bg);}
    .cp-pill-green{border-color:rgba(76,175,130,.25);background:var(--green-bg);}
    .cp-pill-num{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;margin-top:1px;}
    .cp-pill-red .cp-pill-num{background:var(--red);color:#fff;}
    .cp-pill-amber .cp-pill-num{background:var(--accent);color:#0f0f0f;}
    .cp-pill-green .cp-pill-num{background:var(--green);color:#fff;}
    .cp-pill-title{font-size:12px;font-weight:700;color:var(--text);}
    .cp-pill-body{font-size:11px;color:var(--text2);margin-top:2px;line-height:1.4;}

    /* ── Member payment cards grid ── */
    .cp-cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;}

    /* ── Individual member card ── */
    .cp-mcard{background:var(--bg2);border:1.5px solid var(--border);border-radius:var(--radius);padding:16px;transition:border-color .2s,box-shadow .2s;}
    .cp-mcard:hover{border-color:var(--border2);box-shadow:0 4px 20px var(--shadow);}
    .cp-mcard.cp-mcard-active{border-color:var(--accent);box-shadow:0 0 0 3px rgba(212,168,83,.12);}

    /* header row */
    .cp-mcard-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
    .cp-mcard-avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;}
    .cp-mcard-name{font-size:15px;font-weight:700;color:var(--text);}
    .cp-mcard-total{margin-left:auto;text-align:right;}
    .cp-mcard-total-lbl{font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;}
    .cp-mcard-total-val{font-size:18px;font-weight:800;line-height:1.1;}

    /* breakdown bars */
    .cp-breakdown{display:flex;flex-direction:column;gap:6px;margin-bottom:14px;}
    .cp-brow{display:flex;align-items:center;gap:8px;}
    .cp-brow-ico{font-size:13px;width:18px;text-align:center;flex-shrink:0;}
    .cp-brow-lbl{font-size:12px;color:var(--text2);flex:1;}
    .cp-brow-bar-wrap{flex:2;height:5px;background:var(--bg4);border-radius:99px;overflow:hidden;}
    .cp-brow-bar{height:100%;border-radius:99px;transition:width .4s var(--ease-spring);}
    .cp-brow-val{font-size:12px;font-weight:600;width:68px;text-align:right;flex-shrink:0;}

    /* amount input area */
    .cp-input-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
    .cp-amt-input{flex:1;font-size:18px!important;font-weight:700!important;padding:10px 13px!important;border-radius:var(--radius-sm)!important;text-align:right;}
    .cp-amt-input:focus{box-shadow:0 0 0 3px rgba(212,168,83,.18)!important;}
    .cp-save-btn{padding:10px 18px!important;font-size:13px!important;white-space:nowrap;}

    /* live split preview chips */
    .cp-split-preview{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:4px;min-height:26px;}
    .cp-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:600;}
    .cp-chip-pd{background:var(--red-bg);color:var(--red);border:1px solid rgba(224,82,82,.25);}
    .cp-chip-rent{background:var(--accent-bg);color:var(--accent);border:1px solid rgba(212,168,83,.3);}
    .cp-chip-util{background:var(--blue-bg);color:var(--blue);border:1px solid rgba(91,155,213,.3);}
    .cp-chip-meal{background:var(--purple-bg);color:var(--purple);border:1px solid rgba(167,139,250,.3);}
    .cp-chip-change{background:var(--green-bg);color:var(--green);border:1px solid rgba(76,175,130,.3);}

    /* prev-due warning banner */
    .cp-prevdue-banner{display:flex;align-items:center;gap:8px;padding:7px 11px;background:var(--red-bg);border:1px solid rgba(224,82,82,.25);border-radius:var(--radius-sm);margin-bottom:10px;font-size:12px;color:var(--red);font-weight:600;}

    /* credit applied note */
    .cp-credit-note{font-size:11px;color:var(--blue);display:flex;align-items:center;gap:5px;margin-top:4px;}

    /* Mess-owes & Change tables (simplified) */
    .cp-simple-row{display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg3);border-radius:var(--radius-sm);margin-bottom:8px;flex-wrap:wrap;}
    .cp-simple-name{font-weight:700;font-size:14px;color:var(--text);flex:1;min-width:80px;}
    .cp-simple-amt-lbl{font-size:11px;color:var(--text3);}
    .cp-simple-amt-val{font-size:16px;font-weight:800;}
    .cp-simple-input{width:130px!important;}
    .cp-simple-carry{font-size:12px;color:var(--blue);font-weight:600;min-width:90px;text-align:right;}
  </style>`;

  await loadCollectMonth();
}

function getCollectKey() {
  const month = parseInt(document.getElementById("cp-month")?.value ?? new Date().getMonth());
  const year  = parseInt(document.getElementById("cp-year")?.value  ?? new Date().getFullYear());
  return { month, year, key: monthKey(year, month) };
}

async function loadCollectMonth() {
  members = await dbGetMembers(); buildInitialsMap(members);
  const { month, year, key } = getCollectKey();
  const next     = nextMonth(month, year);

  const [allMeals, allBazar, allRentArr, allUtilR, utilNextR] = await Promise.all([
    dbGetAll("meals"),
    dbGetAll("bazar"),
    dbGetAll("rent"),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", next.key).maybeSingle(),
  ]);

  const allUtilArr = allUtilR.data || [];
  const rentByKey = {}; allRentArr.forEach(r => { rentByKey[r.month_key] = r; });
  const utilByKey = {}; allUtilArr.forEach(u => { utilByKey[u.month_key] = u; });
  const prevKey = previousMonthFromKey(key).key;

  const utilRec     = utilByKey[key]     || null;
  const utilRecPrev = utilByKey[prevKey] || null;
  const rentRec     = rentByKey[key]     || null;
  const utilRecNext = utilNextR.data     || null;

  // Existing carry-forward credits stored in NEXT month's bills
  const existingCredits       = utilRecNext?.bills?.mess_credit    || {};
  // Change carry-forward credits (from overpayment) also stored in next month's bills
  const existingChangeCredits = utilRecNext?.bills?.change_credit  || {};
  // Pending change (overpayment not yet resolved) stored in CURRENT month's bills
  const pendingChangeBills    = utilRec?.bills?.pending_change     || {};

  const perMember = {};
  members.forEach(m => {
    const p = calcMemberSettlement(m, allMeals, allBazar, rentRec, utilRec, utilRecPrev, key);

    // Carry-forward: outstanding net due, walked back through every unpaid
    // month (not just the immediately-previous one — see calcPrevDueForMember).
    const prevDue     = calcPrevDueForMember(m, allMeals, allBazar, allRentArr, allUtilArr, key);
    const prevDuePaid = round2(Number((utilRec?.payments || {})[m.name]?.prev_due_paid || 0));

    perMember[m.id] = {
      name:          m.name,
      mealCost:      p.mealCost,
      memberBazar:   p.memberBazar,
      mealPaid:      p.mealPaid,
      utilDue:       round2(Math.max(0, p.prepaidUtility + p.postpaidUtility - p.messCredit)),
      utilPaid:      p.utilityPaid,
      rentDue:       p.roomRent,
      rentPaid:      p.roomRentPaid,
      netPayable:    p.netPayable,
      messCredit:    p.messCredit,
      creditPaid:    p.creditPaid || 0,
      prevDue,
      prevDuePaid,
      existingCarryCredit:  round2(Number(existingCredits[m.name]       || 0)),
      // Persisted pending change — survives page reload
      pendingChange:        round2(Number(pendingChangeBills[m.name]    || 0)),
      existingChangeCredit: round2(Number(existingChangeCredits[m.name] || 0)),
    };
  });

  _collectCtx = { month, year, key, prevKey, nextMonth: next, utilRec, utilRecNext, rentRec, perMember, existingCredits, existingChangeCredits };
  buildCollectTable();
  buildReturnTable();
}

function buildCollectTable() {
  const wrap = document.getElementById("cp-table-wrap");
  if (!wrap) return;
  if (!members.length) { wrap.innerHTML = '<div class="empty">No members in this mess</div>'; return; }

  // Show members who owe this month OR have unpaid dues from last month
  const owing = members.filter(m => {
    const r = _collectCtx.perMember[m.id];
    return r && (r.netPayable > 0 || r.prevDue > 0.01);
  });

  if (!owing.length) {
    wrap.innerHTML = `
      <div style="text-align:center;padding:36px 20px">
        <div style="font-size:40px;margin-bottom:10px">✅</div>
        <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:4px">All settled!</div>
        <div style="font-size:13px;color:var(--text3)">Every member has paid up for this month.</div>
      </div>`;
    return;
  }

  // Avatar colour palette (cycles through members)
  const avatarColors = [
    {bg:'rgba(212,168,83,.15)',color:'var(--accent)'},
    {bg:'rgba(91,155,213,.15)',color:'var(--blue)'},
    {bg:'rgba(76,175,130,.15)',color:'var(--green)'},
    {bg:'rgba(224,82,82,.15)',color:'var(--red)'},
    {bg:'rgba(167,139,250,.15)',color:'var(--purple)'},
  ];

  const cards = owing.map((m, idx) => {
    const r       = _collectCtx.perMember[m.id];
    const mealRem = round2(r.mealCost - r.memberBazar - r.mealPaid);
    const utilRem = round2(Math.max(0, r.utilDue - r.utilPaid));
    const rentRem = round2(Math.max(0, r.rentDue - r.rentPaid));
    const pd      = round2(r.prevDue || 0);
    const total   = round2(r.netPayable + pd);
    const prefill = total > 0 ? total : '';

    // Bar widths (as % of total, for visual)
    const barTotal = Math.max(0.01, pd + Math.max(0, mealRem) + utilRem + rentRem);
    const pctPd   = Math.round((pd / barTotal) * 100);
    const pctMeal = Math.round((Math.max(0, mealRem) / barTotal) * 100);
    const pctUtil = Math.round((utilRem / barTotal) * 100);
    const pctRent = Math.round((rentRem / barTotal) * 100);

    const av = avatarColors[idx % avatarColors.length];
    const initials = m.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

    return `
      <div class="cp-mcard" id="cpr-${m.id}">
        <div class="cp-mcard-head">
          <div class="cp-mcard-avatar" style="background:${av.bg};color:${av.color}">${initials}</div>
          <div>
            <div class="cp-mcard-name">${m.name}</div>
            ${r.messCredit > 0 ? `<div style="font-size:11px;color:var(--blue);margin-top:1px">↩ ${fmtTk(r.messCredit)} credit applied</div>` : ''}
          </div>
          <div class="cp-mcard-total">
            <div class="cp-mcard-total-lbl">Total due</div>
            <div class="cp-mcard-total-val" id="cp-net-${m.id}" style="color:${total > 0 ? 'var(--red)' : 'var(--green)'}">${total > 0 ? fmtTk(total) : '✓ Clear'}</div>
          </div>
        </div>

        ${pd > 0.01 ? `
          <div class="cp-prevdue-banner" id="cp-pd-disp-${m.id}">
            ⚠ ${fmtTk(pd)} unpaid from last month
          </div>
        ` : `<div id="cp-pd-disp-${m.id}" style="display:none"></div>`}

        <div class="cp-breakdown">
          ${pd > 0.01 ? `
          <div class="cp-brow">
            <span class="cp-brow-ico">⏪</span>
            <span class="cp-brow-lbl">Prev. Month Due</span>
            <div class="cp-brow-bar-wrap"><div class="cp-brow-bar" style="width:${pctPd}%;background:var(--red)"></div></div>
            <span class="cp-brow-val" id="cp-pd-bar-${m.id}" style="color:var(--red)">${fmtTk(pd)}</span>
          </div>` : ''}
          <div class="cp-brow">
            <span class="cp-brow-ico">🏠</span>
            <span class="cp-brow-lbl">Rent</span>
            <div class="cp-brow-bar-wrap"><div class="cp-brow-bar" style="width:${pctRent}%;background:var(--accent)"></div></div>
            <span class="cp-brow-val" id="cp-rr-${m.id}" style="color:${rentRem > 0 ? 'var(--red)' : 'var(--green)'}">${rentRem > 0 ? fmtTk(rentRem) : '✓ 0'}</span>
          </div>
          <div class="cp-brow">
            <span class="cp-brow-ico">⚡</span>
            <span class="cp-brow-lbl">Utility</span>
            <div class="cp-brow-bar-wrap"><div class="cp-brow-bar" style="width:${pctUtil}%;background:var(--blue)"></div></div>
            <span class="cp-brow-val" id="cp-ur-${m.id}" style="color:${utilRem > 0 ? 'var(--red)' : 'var(--green)'}">${utilRem > 0 ? fmtTk(utilRem) : '✓ 0'}</span>
          </div>
          <div class="cp-brow">
            <span class="cp-brow-ico">🍽️</span>
            <span class="cp-brow-lbl">Meal Balance</span>
            <div class="cp-brow-bar-wrap"><div class="cp-brow-bar" style="width:${pctMeal}%;background:var(--purple)"></div></div>
            <span class="cp-brow-val" id="cp-mr-${m.id}" style="color:${mealRem > 0 ? 'var(--red)' : mealRem < 0 ? 'var(--green)' : 'var(--text3)'}">${mealRem > 0 ? fmtTk(mealRem) : mealRem < 0 ? '+'+fmtTk(Math.abs(mealRem)) : '✓ 0'}</span>
          </div>
        </div>

        <div class="cp-split-preview" id="cp-split-${m.id}" style="display:none">
          <span class="cp-chip cp-chip-pd"     id="cp-apd-${m.id}" style="display:none">⏪ ৳0</span>
          <span class="cp-chip cp-chip-rent"   id="cp-ar-${m.id}"  style="display:none">🏠 ৳0</span>
          <span class="cp-chip cp-chip-util"   id="cp-au-${m.id}"  style="display:none">⚡ ৳0</span>
          <span class="cp-chip cp-chip-meal"   id="cp-am-${m.id}"  style="display:none">🍽️ ৳0</span>
          <span class="cp-chip cp-chip-change" id="cp-ch-${m.id}"  style="display:none">💸 Change ৳0</span>
        </div>

        <div class="cp-input-row">
          <div style="position:relative;flex:1">
            <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:15px;font-weight:700;color:var(--text3);pointer-events:none">৳</span>
            <input type="number" class="input cp-amt-input" id="cp-amt-${m.id}"
              min="0" step="1" placeholder="0.00"
              style="padding-left:26px!important"
              value="${prefill}"
              oninput="onCollectAmtInput('${m.id}')"
              onfocus="this.closest('.cp-mcard').classList.add('cp-mcard-active')"
              onblur="this.closest('.cp-mcard').classList.remove('cp-mcard-active')"/>
          </div>
          <button class="btn btn-primary cp-save-btn" onclick="saveCollectRow('${m.id}')">
            Save
          </button>
        </div>
      </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="cp-cards-grid">${cards}</div>
    <div style="margin-top:12px;display:flex;gap:8px;">
      <button class="btn btn-ghost btn-sm" onclick="loadCollectMonth()">↻ Refresh</button>
    </div>`;

  // Trigger split calculation for all pre-filled inputs
  owing.forEach(m => {
    const r = _collectCtx.perMember[m.id];
    const total = round2(r.netPayable + (r.prevDue || 0));
    if (total > 0) onCollectAmtInput(m.id);
  });
}
/* ═════════════════════════════════════════════════════════════════
   Return Amount — one section per member, merging two old sources:
     • overpaid change (bills.pending_change)  → carried as change_credit
     • negative settlement the mess owes (netPayable < 0) → carried as mess_credit
   The manager types one cash figure; it fills the overpaid change first,
   then the negative balance, and whatever is left of either carries forward.
   ═════════════════════════════════════════════════════════════════ */

/* Money the mess still has to return to this member, split by source. */
function returnAmountsFor(r) {
  const changeRemaining = round2(Math.max(0, round2(r.pendingChange || 0) - round2(r.existingChangeCredit || 0)));
  const settlementOwed  = round2(Math.abs(Math.min(0, r.netPayable || 0)));
  const owesRemaining   = round2(Math.max(0, settlementOwed - round2(r.existingCarryCredit || 0)));
  return {
    changeRemaining,
    owesRemaining,
    settlementOwed,
    alreadyCarried: round2(round2(r.existingChangeCredit || 0) + round2(r.existingCarryCredit || 0)),
    total: round2(changeRemaining + owesRemaining),
  };
}

function buildReturnTable() {
  const card = document.getElementById("cp-return-card");
  const wrap = document.getElementById("cp-return-wrap");
  if (!wrap || !card) return;

  const rows = members
    .map(m => ({ m, r: _collectCtx.perMember[m.id] }))
    .filter(x => x.r)
    .map(x => ({ ...x, amts: returnAmountsFor(x.r) }))
    .filter(x => x.amts.total > 0.01);

  if (!rows.length) { card.style.display = "none"; return; }

  card.style.display = "";
  const { nextMonth: nm } = _collectCtx;

  const avatarColors = [
    {bg:'rgba(76,175,130,.15)',color:'var(--green)'},
    {bg:'rgba(91,155,213,.15)',color:'var(--blue)'},
    {bg:'rgba(212,168,83,.15)',color:'var(--accent)'},
    {bg:'rgba(167,139,250,.15)',color:'var(--purple)'},
    {bg:'rgba(224,82,82,.15)',color:'var(--red)'},
  ];

  const cards = rows.map(({ m, amts }, idx) => {
    const { changeRemaining, owesRemaining, alreadyCarried, total } = amts;
    const av       = avatarColors[idx % avatarColors.length];
    const initials = m.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const pct = v => (total > 0 ? Math.round((v / total) * 100) : 0);

    const breakdown = [];
    if (changeRemaining > 0.01) breakdown.push(`
          <div class="cp-brow">
            <span class="cp-brow-ico">💸</span>
            <span class="cp-brow-lbl">Overpaid change</span>
            <div class="cp-brow-bar-wrap"><div class="cp-brow-bar" style="width:${pct(changeRemaining)}%;background:var(--accent)"></div></div>
            <span class="cp-brow-val" style="color:var(--accent)">${fmtTk(changeRemaining)}</span>
          </div>`);
    if (owesRemaining > 0.01) breakdown.push(`
          <div class="cp-brow">
            <span class="cp-brow-ico">🏦</span>
            <span class="cp-brow-lbl">Negative balance owed</span>
            <div class="cp-brow-bar-wrap"><div class="cp-brow-bar" style="width:${pct(owesRemaining)}%;background:var(--green)"></div></div>
            <span class="cp-brow-val" style="color:var(--green)">${fmtTk(owesRemaining)}</span>
          </div>`);
    if (alreadyCarried > 0) breakdown.push(`
          <div class="cp-brow">
            <span class="cp-brow-ico">↩</span>
            <span class="cp-brow-lbl">Already carried fwd</span>
            <div class="cp-brow-bar-wrap"><div class="cp-brow-bar" style="width:100%;background:var(--blue)"></div></div>
            <span class="cp-brow-val" style="color:var(--blue)">${fmtTk(alreadyCarried)}</span>
          </div>`);

    return `
      <div class="cp-mcard" id="retr-${m.id}">
        <div class="cp-mcard-head">
          <div class="cp-mcard-avatar" style="background:${av.bg};color:${av.color}">${initials}</div>
          <div>
            <div class="cp-mcard-name">${m.name}</div>
            <div style="font-size:11px;color:var(--green);margin-top:1px">Return money to this member</div>
          </div>
          <div class="cp-mcard-total">
            <div class="cp-mcard-total-lbl">To return</div>
            <div class="cp-mcard-total-val" id="ret-rem-${m.id}" style="color:var(--green)">${fmtTk(total)}</div>
          </div>
        </div>

        <div class="cp-breakdown">${breakdown.join('')}</div>

        <div style="margin-bottom:10px">
          <span id="ret-carry-${m.id}" style="font-size:12px;color:var(--blue);font-weight:600">↩ carry ${fmtTk(total)} → ${MONTHS[nm.month]} ${nm.year}</span>
        </div>

        <div class="cp-input-row">
          <div style="position:relative;flex:1">
            <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:15px;font-weight:700;color:var(--text3);pointer-events:none">৳</span>
            <input type="number" class="input cp-amt-input" id="ret-amt-${m.id}"
              min="0" max="${total}" step="1" placeholder="0.00"
              style="padding-left:26px!important"
              oninput="onReturnAmtInput('${m.id}')"
              onfocus="this.closest('.cp-mcard').classList.add('cp-mcard-active')"
              onblur="this.closest('.cp-mcard').classList.remove('cp-mcard-active')"/>
          </div>
          <button class="btn cp-save-btn" style="background:var(--green-bg);border:1px solid var(--green);color:var(--green)"
            onclick="saveReturnRow('${m.id}')">Save</button>
        </div>
      </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="cp-cards-grid">${cards}</div>
    <div style="margin-top:10px;padding:8px 12px;background:var(--bg3);border-radius:8px;font-size:12px;color:var(--text3)">
      💡 Enter ৳0 and Save to carry the whole amount to ${MONTHS[nm.month]} ${nm.year} — it auto-deducts from utility dues.
    </div>`;
}

/* Live carry / "to return" preview as the manager types. */
function onReturnAmtInput(memberId) {
  if (!_collectCtx) return;
  const r = _collectCtx.perMember[memberId];
  if (!r) return;
  const { total } = returnAmountsFor(r);

  const raw      = parseFloat(document.getElementById("ret-amt-" + memberId)?.value || 0);
  const cashNow  = round2(Math.min(Math.max(0, raw), total));
  const carryFwd = round2(total - cashNow);

  const carryEl = document.getElementById("ret-carry-" + memberId);
  if (carryEl) {
    carryEl.textContent = carryFwd > 0 ? "↩ carry " + fmtTk(carryFwd) + " → next month" : "✓ fully returned";
    carryEl.style.color = carryFwd > 0 ? "var(--blue)" : "var(--green)";
  }
  const remEl = document.getElementById("ret-rem-" + memberId);
  if (remEl) remEl.textContent = cashNow > 0 ? fmtTk(cashNow) : fmtTk(total);
}

/* ── Portion writers — same DB effects the old Save buttons had, no UI ── */

/* Overpaid change: clear this month's pending_change, carry the unpaid rest
   into next month's bills.change_credit. */
async function _applyChangePortion(ctx, r, m, giveRaw) {
  const totalChange = round2(r.pendingChange || 0);
  const alreadyFwd  = round2(r.existingChangeCredit);
  const remaining   = round2(Math.max(0, totalChange - alreadyFwd));
  const cashNow     = round2(Math.min(Math.max(0, giveRaw), remaining));
  const newCarry    = round2(remaining - cashNow);

  const nm = ctx.nextMonth;
  const { data: latestNext } = await getClient().from("utility_payments")
    .select("*").eq("mess_id", messId()).eq("month_key", nm.key).maybeSingle();
  const nextBills    = { ...(latestNext?.bills    || {}) };
  const nextPayments = { ...(latestNext?.payments || {}) };
  const changeCredits = { ...(nextBills.change_credit || {}) };
  if (newCarry > 0) changeCredits[m.name] = newCarry;
  else delete changeCredits[m.name];
  nextBills.change_credit = changeCredits;
  await dbUpsertUtility(nm.month, nm.year, nm.key, nextBills, nextPayments);

  const { data: curUtil } = await getClient().from("utility_payments")
    .select("*").eq("mess_id", messId()).eq("month_key", ctx.key).maybeSingle();
  const curBills    = { ...(curUtil?.bills || {}) };
  const curPayments = curUtil?.payments || {};
  const pendingMap  = { ...(curBills.pending_change || {}) };
  delete pendingMap[m.name];
  if (Object.keys(pendingMap).length === 0) delete curBills.pending_change;
  else curBills.pending_change = pendingMap;
  await dbUpsertUtility(ctx.month, ctx.year, ctx.key, curBills, curPayments);

  return { totalChange, cashNow, newCarry };
}

/* Negative balance the mess owes: record cash as credit_paid this month,
   carry the rest into next month's bills.mess_credit. */
async function _applyCreditPortion(ctx, r, m, giveRaw) {
  const messOwes      = round2(Math.abs(r.netPayable));
  const alreadyFwd    = round2(r.existingCarryCredit);
  const remainingCred = round2(Math.max(0, messOwes - alreadyFwd));
  const cashNow       = round2(Math.min(Math.max(0, giveRaw), remainingCred));
  const newCarry      = round2(remainingCred - cashNow);

  if (cashNow > 0) {
    const { data: curUtil } = await getClient().from("utility_payments")
      .select("*").eq("mess_id", messId()).eq("month_key", ctx.key).maybeSingle();
    const curBills    = curUtil?.bills || {};
    const curPayments = { ...(curUtil?.payments || {}) };
    const curPay      = { ...(curPayments[m.name] || {}) };
    curPay.credit_paid = round2(Number(curPay.credit_paid || 0) + cashNow);
    curPayments[m.name] = curPay;
    await dbUpsertUtility(ctx.month, ctx.year, ctx.key, curBills, curPayments);
  }

  const nm = ctx.nextMonth;
  const { data: latestNext } = await getClient().from("utility_payments")
    .select("*").eq("mess_id", messId()).eq("month_key", nm.key).maybeSingle();
  const nextBills    = { ...(latestNext?.bills    || {}) };
  const nextPayments = { ...(latestNext?.payments || {}) };
  const existCredit = { ...(nextBills.mess_credit || {}) };
  if (newCarry > 0) existCredit[m.name] = newCarry;
  else delete existCredit[m.name];
  nextBills.mess_credit = existCredit;
  await dbUpsertUtility(nm.month, nm.year, nm.key, nextBills, nextPayments);

  return { messOwes, cashNow, newCarry };
}

/* One Save button: fill overpaid change first, then the negative balance. */
async function saveReturnRow(memberId) {
  if (!requireManager('saveReturnRow')) return;
  if (!_collectCtx) return;
  const ctx = _collectCtx;
  const r   = ctx.perMember[memberId];
  const m   = members.find(x => x.id === memberId);
  if (!r || !m) return;

  const { changeRemaining, owesRemaining } = returnAmountsFor(r);
  const raw = parseFloat(document.getElementById("ret-amt-" + memberId)?.value || 0);
  let cashLeft = round2(Math.max(0, raw));

  try {
    let chgRes = null, credRes = null;
    if (changeRemaining > 0.01) {
      chgRes = await _applyChangePortion(ctx, r, m, Math.min(cashLeft, changeRemaining));
      cashLeft = round2(Math.max(0, cashLeft - chgRes.cashNow));
    }
    if (owesRemaining > 0.01) {
      credRes = await _applyCreditPortion(ctx, r, m, Math.min(cashLeft, owesRemaining));
      cashLeft = round2(Math.max(0, cashLeft - credRes.cashNow));
    }

    await loadCollectMonth();

    const nm         = ctx.nextMonth;
    const cashTotal  = round2((chgRes?.cashNow  || 0) + (credRes?.cashNow  || 0));
    const carryTotal = round2((chgRes?.newCarry || 0) + (credRes?.newCarry || 0));
    const parts = [];
    if (cashTotal  > 0) parts.push(`Cash returned: ${fmtTk(cashTotal)}`);
    if (carryTotal > 0) parts.push(`Carry to ${MONTHS[nm.month]} ${nm.year}: ${fmtTk(carryTotal)}`);
    toast("Return saved ✓  " + (parts.join("  ·  ") || "Nothing to return"), "success");

    const nextMonthLabel = MONTHS[nm.month] + " " + nm.year;
    if (chgRes) {
      showChangeReceipt({
        member: m, monthLabel: monthLabelFromKey(ctx.key), nextMonthLabel,
        totalChange: chgRes.totalChange, cashNow: chgRes.cashNow, newCarry: chgRes.newCarry,
        timestamp: new Date(),
      });
    } else if (credRes) {
      showCreditReceipt({
        member: m, monthLabel: monthLabelFromKey(ctx.key), nextMonthLabel,
        cashNow: credRes.cashNow, newCarry: credRes.newCarry, messOwes: credRes.messOwes,
        timestamp: new Date(),
      });
    }
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}


/* ── Change receipt ── */
function buildChangeReceiptText(d) {
  const messName = currentMess?.name || "Mess";
  const dt = d.timestamp.toLocaleString("en-IN", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", hour12:true
  });
  const lines = [];
  lines.push(`💸 CHANGE RECEIPT`);
  lines.push(`─────────────────────`);
  lines.push(`Mess:    ${messName}`);
  lines.push(`Member:  ${d.member.name}`);
  lines.push(`Month:   ${d.monthLabel}`);
  lines.push(`Date:    ${dt}`);
  lines.push(``);
  lines.push(`Overpaid (change):  ${fmtTk(d.totalChange)}`);
  lines.push(`─────────────────────`);
  if (d.cashNow  > 0) lines.push(`💵 Cash returned now:  ${fmtTk(d.cashNow)}`);
  if (d.newCarry > 0) lines.push(`↩ Carried to ${d.nextMonthLabel}:  ${fmtTk(d.newCarry)}`);
  lines.push(`─────────────────────`);
  lines.push(d.newCarry > 0
    ? `Remaining carried forward: ${fmtTk(d.newCarry)}`
    : `✓ Change fully returned`);
  lines.push(``);
  lines.push(`— sent from ${messName} manager`);
  return lines.join("\n");
}

function showChangeReceipt(d) {
  const messName = currentMess?.name || "Mess";
  const dt = d.timestamp.toLocaleString("en-IN", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", hour12:true
  });

  const receiptNo = "CHG-"
    + d.timestamp.getFullYear()
    + String(d.timestamp.getMonth()+1).padStart(2,"0")
    + String(d.timestamp.getDate()).padStart(2,"0")
    + "-" + String(d.timestamp.getHours()).padStart(2,"0")
    + String(d.timestamp.getMinutes()).padStart(2,"0");

  const isFullyReturned = d.newCarry === 0;
  const text   = buildChangeReceiptText(d);
  const phoneRaw = (d.member.phone || "").replace(/[^\d]/g, "");
  const phone  = phoneRaw.length === 11 && phoneRaw.startsWith("0") ? "880" + phoneRaw.slice(1) : phoneRaw;
  const waUrl  = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  const html = `
  <style>
    #chg-modal{font-family:var(--font);max-width:420px;margin:0 auto;}
    .chg-head{text-align:center;padding:4px 0 16px;border-bottom:2px dashed var(--border2);margin-bottom:16px;}
    .chg-head-icon{font-size:30px;line-height:1;margin-bottom:6px;}
    .chg-head-name{font-family:var(--font-serif);font-size:21px;font-weight:700;color:var(--text);}
    .chg-head-sub{font-size:10px;color:var(--text3);letter-spacing:.8px;text-transform:uppercase;margin-top:3px;}
    .chg-badge{display:inline-block;margin-top:8px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;}
    .chg-badge-ok{background:var(--green-bg);color:var(--green);border:1px solid rgba(76,175,130,.3);}
    .chg-badge-fwd{background:var(--amber-bg,rgba(243,156,18,.1));color:var(--amber);border:1px solid rgba(243,156,18,.3);}
    .chg-meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;background:var(--bg3);border-radius:8px;padding:10px 14px;margin-bottom:14px;}
    .chg-ml{display:flex;flex-direction:column;gap:1px;}
    .chg-ml span:first-child{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--text3);}
    .chg-ml span:last-child{font-size:12px;font-weight:600;color:var(--text);}
    .chg-hero{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:var(--amber-bg,rgba(243,156,18,.08));border:2px solid var(--amber);border-radius:10px;margin-bottom:14px;}
    .chg-hero-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--amber);}
    .chg-hero-sub{font-size:11px;color:var(--text3);margin-top:2px;}
    .chg-hero-amt{font-size:26px;font-weight:800;color:var(--amber);}
    .chg-sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:var(--text3);display:flex;align-items:center;gap:8px;margin:14px 0 7px;}
    .chg-sec::after{content:'';flex:1;height:1px;background:var(--border2);}
    .chg-row{display:flex;justify-content:space-between;align-items:center;padding:10px 13px;background:var(--bg3);border-radius:7px;margin-bottom:6px;}
    .chg-row-left{display:flex;align-items:center;gap:10px;}
    .chg-row-ico{font-size:18px;line-height:1;}
    .chg-row-lbl{font-size:13px;font-weight:600;color:var(--text);}
    .chg-row-sub{font-size:10px;color:var(--text3);margin-top:1px;}
    .chg-row-val{font-size:15px;font-weight:800;}
    .chg-hr{border:none;border-top:2px dashed var(--border2);margin:14px 0;}
    .chg-net{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-radius:10px;margin-top:12px;font-weight:800;font-size:15px;}
    .chg-net-ok{background:var(--green-bg);border:2px solid rgba(76,175,130,.45);}
    .chg-net-fwd{background:var(--amber-bg,rgba(243,156,18,.08));border:2px solid var(--amber);}
    .chg-foot{text-align:center;padding:12px 0 2px;border-top:2px dashed var(--border2);margin-top:14px;}
    .chg-foot-txt{font-size:10px;color:var(--text3);letter-spacing:.4px;}
    .chg-btns{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px;}
    .chg-btns .btn{flex:1;min-width:90px;justify-content:center;}
  </style>

  <div id="chg-modal">
    <div class="chg-head">
      <div class="chg-head-icon">💸</div>
      <div class="chg-head-name">${messName}</div>
      <div class="chg-head-sub">Change & Carry Forward Receipt</div>
      <span class="chg-badge ${isFullyReturned ? 'chg-badge-ok' : 'chg-badge-fwd'}">
        ${isFullyReturned ? "✓ Fully Returned" : "↩ Partially Carried"}
      </span>
    </div>

    <div class="chg-meta">
      <div class="chg-ml"><span>Receipt No.</span><span style="font-family:monospace;font-size:11px">${receiptNo}</span></div>
      <div class="chg-ml"><span>Date &amp; Time</span><span style="font-size:11px">${dt}</span></div>
      <div class="chg-ml" style="margin-top:5px"><span>Member</span><span>${d.member.name}</span></div>
      <div class="chg-ml" style="margin-top:5px"><span>Settlement Month</span><span>${d.monthLabel}</span></div>
    </div>

    <div class="chg-hero">
      <div>
        <div class="chg-hero-lbl">Overpaid (Change Owed)</div>
        <div class="chg-hero-sub">Member paid more than net payable</div>
      </div>
      <div class="chg-hero-amt">${fmtTk(d.totalChange)}</div>
    </div>

    <div class="chg-sec">Breakdown</div>

    ${d.cashNow > 0 ? `
    <div class="chg-row">
      <div class="chg-row-left">
        <span class="chg-row-ico">💵</span>
        <div>
          <div class="chg-row-lbl">Cash Returned Now</div>
          <div class="chg-row-sub">Handed back to ${d.member.name}</div>
        </div>
      </div>
      <span class="chg-row-val" style="color:var(--green)">${fmtTk(d.cashNow)}</span>
    </div>` : ""}

    ${d.newCarry > 0 ? `
    <div class="chg-row" style="border:1px solid var(--blue)">
      <div class="chg-row-left">
        <span class="chg-row-ico">↩</span>
        <div>
          <div class="chg-row-lbl">Carried to ${d.nextMonthLabel}</div>
          <div class="chg-row-sub">Reduces utility total due next month</div>
        </div>
      </div>
      <span class="chg-row-val" style="color:var(--blue)">${fmtTk(d.newCarry)}</span>
    </div>` : ""}

    ${d.cashNow === 0 && d.newCarry === 0 ? `
    <div class="chg-row" style="color:var(--text3);font-size:12px;justify-content:center">No action recorded.</div>` : ""}

    <hr class="chg-hr">

    <div class="chg-net ${isFullyReturned ? 'chg-net-ok' : 'chg-net-fwd'}">
      <span>Change Status</span>
      <span style="color:${isFullyReturned ? 'var(--green)' : 'var(--blue)'}">
        ${isFullyReturned ? "✓ Fully returned" : `↩ ${fmtTk(d.newCarry)} carried forward`}
      </span>
    </div>

    <div class="chg-foot">
      <div class="chg-foot-txt">— Generated by ${messName} Manager —</div>
      ${d.member.phone ? "" : `<div style="font-size:10px;color:var(--text3);margin-top:4px">💡 Add ${d.member.name}'s phone to enable direct WhatsApp</div>`}
    </div>

    <div class="chg-btns">
      <button class="btn btn-primary btn-sm" onclick="copyChangeReceipt(this)">📋 Copy</button>
      <a class="btn btn-sm" href="${waUrl}" target="_blank" rel="noopener"
         style="background:#25D366;border:1px solid #1fb759;color:#fff;display:flex;align-items:center;justify-content:center;gap:4px;text-decoration:none;border-radius:var(--radius-sm)">
        💬 WhatsApp
      </a>
      <button class="btn btn-ghost btn-sm" onclick="printChangeReceipt()">🖨 Print</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()" style="margin-left:auto">✕ Close</button>
    </div>
  </div>`;

  window._lastChangeReceiptText = text;
  window._lastChangeReceiptData = d;
  document.getElementById("modal-content").innerHTML = html;
  document.querySelector(".modal").classList.remove("modal-wide");
  openModal();
}

async function copyChangeReceipt(btn) {
  const text = window._lastChangeReceiptText || "";
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

function printChangeReceipt() {
  const d = window._lastChangeReceiptData;
  if (!d) { toast("No receipt data", "error"); return; }

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  let w, frame;
  if (isSafari) {
    w = window.open("", "_blank", "width:480,height:700");
    if (!w) { toast("Pop-up blocked — allow pop-ups to print", "error"); return; }
  } else {
    frame = document.getElementById("_chg-print-frame");
    if (frame) frame.remove();
    frame = document.createElement("iframe");
    frame.id = "_chg-print-frame";
    frame.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;";
    document.body.appendChild(frame);
    w = frame.contentWindow;
  }

  const messName = currentMess?.name || "Mess";
  const dt = d.timestamp.toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true });
  const receiptNo = "CHG-" + d.timestamp.getFullYear() + String(d.timestamp.getMonth()+1).padStart(2,"0") + String(d.timestamp.getDate()).padStart(2,"0") + "-" + String(d.timestamp.getHours()).padStart(2,"0") + String(d.timestamp.getMinutes()).padStart(2,"0");
  const isFullyReturned = d.newCarry === 0;
  const fmtTkP = v => "৳" + Number(v).toLocaleString("en-IN", { minimumFractionDigits:0, maximumFractionDigits:2 });

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Change Receipt — ${d.member.name}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#222;padding:28px 24px;max-width:440px;margin:0 auto;}
  .head{text-align:center;padding-bottom:16px;border-bottom:2px dashed #ccc;margin-bottom:16px;}.head-icon{font-size:32px;line-height:1;margin-bottom:6px;}.head-name{font-size:22px;font-weight:700;}.head-sub{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.8px;margin-top:3px;}
  .badge{display:inline-block;margin-top:8px;padding:3px 12px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;}.badge-ok{background:#e8f8f0;color:#27ae60;border:1px solid #b2dfce;}.badge-fwd{background:#fef9ee;color:#d4950a;border:1px solid #f5d78a;}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;background:#f7f7f7;border-radius:8px;padding:10px 14px;margin-bottom:14px;border:1px solid #eee;}.ml{display:flex;flex-direction:column;gap:1px;}.ml-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#999;}.ml-val{font-size:12px;font-weight:600;color:#222;}
  .hero{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#fef9ee;border:2px solid #d4950a;border-radius:10px;margin-bottom:14px;}.hero-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#d4950a;}.hero-sub{font-size:11px;color:#999;margin-top:2px;}.hero-amt{font-size:26px;font-weight:800;color:#d4950a;}
  .sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:#aaa;display:flex;align-items:center;gap:8px;margin:14px 0 7px;}.sec::after{content:'';flex:1;height:1px;background:#ddd;}
  .row{display:flex;justify-content:space-between;align-items:center;padding:10px 13px;background:#f7f7f7;border-radius:7px;margin-bottom:6px;}.row-left{display:flex;align-items:center;gap:10px;}.row-ico{font-size:18px;line-height:1;}.row-lbl{font-size:13px;font-weight:600;color:#222;}.row-sub{font-size:10px;color:#888;margin-top:1px;}.row-val{font-size:15px;font-weight:800;}
  .divider{border:none;border-top:2px dashed #ccc;margin:14px 0;}.net{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-radius:10px;margin-top:12px;font-weight:800;font-size:15px;}.net-ok{background:#e8f8f0;border:2px solid #b2dfce;}.net-fwd{background:#fef9ee;border:2px solid #d4950a;}
  .foot{text-align:center;padding:12px 0 2px;border-top:2px dashed #ccc;margin-top:16px;}.foot-txt{font-size:10px;color:#aaa;letter-spacing:.4px;}
  @media print{body{padding:16px 14px;}@page{margin:10mm;size:A5;}}</style></head><body>
  <div class="head"><div class="head-icon">💸</div><div class="head-name">${messName}</div><div class="head-sub">Change &amp; Carry Forward Receipt</div>
  <span class="badge ${isFullyReturned ? 'badge-ok' : 'badge-fwd'}">${isFullyReturned ? "✓ Fully Returned" : "↩ Partially Carried"}</span></div>
  <div class="meta">
    <div class="ml"><span class="ml-lbl">Receipt No.</span><span class="ml-val" style="font-family:monospace;font-size:11px">${receiptNo}</span></div>
    <div class="ml"><span class="ml-lbl">Date &amp; Time</span><span class="ml-val" style="font-size:11px">${dt}</span></div>
    <div class="ml" style="margin-top:5px"><span class="ml-lbl">Member</span><span class="ml-val">${d.member.name}</span></div>
    <div class="ml" style="margin-top:5px"><span class="ml-lbl">Settlement Month</span><span class="ml-val">${d.monthLabel}</span></div>
  </div>
  <div class="hero"><div><div class="hero-lbl">Overpaid (Change Owed)</div><div class="hero-sub">Member paid more than net payable</div></div><div class="hero-amt">${fmtTkP(d.totalChange)}</div></div>
  <div class="sec">Breakdown</div>
  ${d.cashNow > 0 ? `<div class="row"><div class="row-left"><span class="row-ico">💵</span><div><div class="row-lbl">Cash Returned Now</div><div class="row-sub">Handed back to ${d.member.name}</div></div></div><span class="row-val" style="color:#27ae60">${fmtTkP(d.cashNow)}</span></div>` : ""}
  ${d.newCarry > 0 ? `<div class="row" style="border:1px solid #aed6f1"><div class="row-left"><span class="row-ico">↩</span><div><div class="row-lbl">Carried to ${d.nextMonthLabel}</div><div class="row-sub">Reduces utility total due next month</div></div></div><span class="row-val" style="color:#2980b9">${fmtTkP(d.newCarry)}</span></div>` : ""}
  <hr class="divider">
  <div class="net ${isFullyReturned ? 'net-ok' : 'net-fwd'}"><span>Change Status</span><span style="color:${isFullyReturned ? '#27ae60' : '#d4950a'}">${isFullyReturned ? "✓ Fully returned" : `↩ ${fmtTkP(d.newCarry)} carried forward`}</span></div>
  <div class="foot"><div class="foot-txt">— Generated by ${messName} Manager —</div></div>
  </body></html>`);
  w.document.close();
  if (isSafari) { setTimeout(() => { w.focus(); w.print(); }, 250); }
  else { frame.onload = () => setTimeout(() => { w.focus(); w.print(); }, 250); }
}

/* Live preview + save for the "Mess owes" drawdown now live in
   saveReturnRow / _applyCreditPortion above (merged Return Amount section). */

/* Priority-ordered split: Rent → Util → Meal.
   Fills each bucket fully before moving to the next.
   Excess (amount > totalRem) → change.
   Negative mealRem (bazar surplus) is clamped to 0 —
   the surplus is already baked into netPayable so the
   member simply pays less. */
/* Priority order: prevDue (old debt) → Rent → Util → Meal */
function computeSplit3(amount, mealRem, utilRem, rentRem, prevDue = 0) {
  amount   = Math.max(0, round2(amount  || 0));
  const m  = Math.max(0, round2(mealRem || 0));
  const u  = Math.max(0, round2(utilRem || 0));
  const r  = Math.max(0, round2(rentRem || 0));
  const pd = Math.max(0, round2(prevDue || 0));
  const totalRem = round2(m + u + r + pd);

  if (amount <= 0)        return { allocMeal: 0, allocUtil: 0, allocRent: 0, allocPrevDue: 0, change: 0 };
  if (totalRem <= 0)      return { allocMeal: 0, allocUtil: 0, allocRent: 0, allocPrevDue: 0, change: amount };
  if (amount >= totalRem) return { allocMeal: m, allocUtil: u, allocRent: r, allocPrevDue: pd, change: round2(amount - totalRem) };

  let remaining = amount;

  const allocPrevDue = round2(Math.min(remaining, pd));
  remaining = round2(remaining - allocPrevDue);

  const allocRent = round2(Math.min(remaining, r));
  remaining = round2(remaining - allocRent);

  const allocUtil = round2(Math.min(remaining, u));
  remaining = round2(remaining - allocUtil);

  const allocMeal = round2(Math.min(remaining, m));

  return { allocMeal, allocUtil, allocRent, allocPrevDue, change: 0 };
}

function onCollectAmtInput(memberId) {
  if (!_collectCtx) return;
  const r = _collectCtx.perMember[memberId];
  if (!r) return;
  const amt     = parseFloat(document.getElementById("cp-amt-" + memberId)?.value || 0);
  const mealRem = round2(r.mealCost - r.memberBazar - r.mealPaid);
  const utilRem = round2(Math.max(0, r.utilDue - r.utilPaid));
  const rentRem = round2(Math.max(0, r.rentDue - r.rentPaid));
  const prevDue = round2(r.prevDue || 0);
  const { allocMeal, allocUtil, allocRent, allocPrevDue, change } = computeSplit3(amt, mealRem, utilRem, rentRem, prevDue);

  // Show/hide the chip row
  const splitEl = document.getElementById("cp-split-" + memberId);
  if (splitEl) splitEl.style.display = amt > 0 ? "flex" : "none";

  // Helper: update a chip — show if value > 0, hide if 0
  const setChip = (id, label, v) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (v > 0) {
      el.textContent = label + " " + fmtTk(v);
      el.style.display = "inline-flex";
    } else {
      el.style.display = "none";
    }
  };
  setChip("cp-apd-" + memberId, "⏪",         allocPrevDue);
  setChip("cp-ar-"  + memberId, "🏠",         allocRent);
  setChip("cp-au-"  + memberId, "⚡",         allocUtil);
  setChip("cp-am-"  + memberId, "🍽️",        allocMeal);
  setChip("cp-ch-"  + memberId, "💸 Change", change);
}

async function saveCollectRow(memberId) {
  if (!requireManager('saveCollectRow')) return;
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
  const prevDue = round2(r.prevDue || 0);
  const { allocMeal, allocUtil, allocRent, allocPrevDue, change } = computeSplit3(amt, mealRem, utilRem, rentRem, prevDue);

  try {
    /* ── 1) Update utility_payments — utility paid + meal_paid + prev_due_paid live here ── */
    if (allocUtil > 0 || allocMeal > 0 || allocPrevDue > 0) {
      const { data: latestUtil } = await getClient().from("utility_payments")
        .select("*").eq("mess_id", messId()).eq("month_key", ctx.key).maybeSingle();
      const bills    = latestUtil?.bills    || {};
      const payments = { ...(latestUtil?.payments || {}) };
      const cur      = payments[m.name] || {};
      const newPaid         = round2(Number(cur.paid          || 0) + allocUtil);
      const newMeal         = round2(Number(cur.meal_paid     || 0) + allocMeal);
      const newPrevDuePaid  = round2(Number(cur.prev_due_paid || 0) + allocPrevDue);
      const status   = newPaid <= 0           ? "unpaid"
                     : newPaid >= r.utilDue   ? "paid"
                     : "partial";
      payments[m.name] = {
        paid:          newPaid,
        meal_paid:     newMeal,
        prev_due_paid: newPrevDuePaid,
        status,
        notes:         cleanText(cur.notes || ""),
      };
      await dbUpsertUtility(ctx.month, ctx.year, ctx.key, bills, payments);
    }

    /* ── 2) Update rent ─────────────────────────────────────────── */
    if (allocRent > 0) {
      const { data: latestRent } = await getClient().from("rent")
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
    r.utilPaid    = round2(r.utilPaid    + allocUtil);
    r.rentPaid    = round2(r.rentPaid    + allocRent);
    r.mealPaid    = round2(r.mealPaid    + allocMeal);
    r.prevDuePaid = round2(r.prevDuePaid + allocPrevDue);
    r.prevDue     = round2(Math.max(0, r.prevDue - allocPrevDue));
    r.netPayable  = round2(r.netPayable  - allocMeal - allocUtil - allocRent);

    const newMealRem = round2(r.mealCost - r.memberBazar - r.mealPaid);
    const newUtilRem = round2(Math.max(0, r.utilDue - r.utilPaid));
    const newRentRem = round2(Math.max(0, r.rentDue - r.rentPaid));
    const newTotal   = round2(r.netPayable + r.prevDue);

    const setCell = (id, txt, color) => {
      const el = document.getElementById(id);
      if (el) { el.innerHTML = txt; if (color) el.style.color = color; }
    };
    setCell("cp-pd-disp-" + memberId,
      r.prevDue > 0 ? `<span title="Unpaid from last month">${fmtTk(r.prevDue)}</span>` : "—",
      r.prevDue > 0 ? "var(--red)" : "var(--text3)");
    setCell("cp-mr-" + memberId,
      newMealRem > 0
        ? `<span style="color:var(--red)">${fmtTk(newMealRem)}</span>`
        : newMealRem < 0
          ? `<span style="color:var(--green)" title="Bazar credit (৳${fmtTk(Math.abs(mealRem))}) covers meal — no meal payment needed">surplus ${fmtTk(Math.abs(mealRem))}</span>`
          : `<span style="color:var(--green)">✓ 0</span>`);
    setCell("cp-ur-" + memberId, newUtilRem > 0 ? fmtTk(newUtilRem) : "✓ 0", newUtilRem > 0 ? "var(--red)" : "var(--green)");
    setCell("cp-rr-" + memberId, newRentRem > 0 ? fmtTk(newRentRem) : "✓ 0", newRentRem > 0 ? "var(--red)" : "var(--green)");
    setCell("cp-net-" + memberId,
      newTotal > 0
        ? `<b style="color:var(--red)">${fmtTk(newTotal)}</b>`
        : r.netPayable < 0
          ? `<b style="color:var(--green)">Get ${fmtTk(Math.abs(r.netPayable))}</b>`
          : `<b style="color:var(--green)">✓ Settled</b>`);

    const amtEl = document.getElementById("cp-amt-" + memberId);
    if (amtEl) amtEl.value = "";
    onCollectAmtInput(memberId);

    // If member is now owed (netPayable < 0), rebuild the return section
    if (r.netPayable < 0) {
      buildReturnTable();
    }

    // If there's change to return, persist it to DB and show change table
    if (change > 0) {
      r.pendingChange = round2((r.pendingChange || 0) + change);

      // Persist to current month's bills.pending_change so it survives reload
      try {
        const { data: freshUtil } = await getClient().from("utility_payments")
          .select("*").eq("mess_id", messId()).eq("month_key", ctx.key).maybeSingle();
        const freshBills    = { ...(freshUtil?.bills    || {}) };
        const freshPayments = freshUtil?.payments || {};
        const pendingMap    = { ...(freshBills.pending_change || {}) };
        pendingMap[m.name]  = r.pendingChange;
        freshBills.pending_change = pendingMap;
        await dbUpsertUtility(ctx.month, ctx.year, ctx.key, freshBills, freshPayments);
      } catch (_) { /* non-critical — in-memory still works this session */ }

      buildReturnTable();
    }

    const parts = [];
    if (allocPrevDue > 0) parts.push(`Prev.Due ${fmtTk(allocPrevDue)}`);
    if (allocMeal    > 0) parts.push(`Meal ${fmtTk(allocMeal)}`);
    if (allocUtil    > 0) parts.push(`Util ${fmtTk(allocUtil)}`);
    if (allocRent    > 0) parts.push(`Rent ${fmtTk(allocRent)}`);
    const msg = change > 0
      ? `Saved ✓  ${parts.join(" • ") || "—"}  · Change: ${fmtTk(change)}`
      : `Saved ✓  ${parts.join(" • ") || "—"}`;
    toast(msg, "success");

    // ── Re-fetch from DB so the table reflects exactly what was saved ──
    await loadCollectMonth();

    /* ── 4) Auto-open shareable receipt ─────────────────────────── */
    showCollectReceipt({
      member:        m,
      monthLabel:    monthLabelFromKey(ctx.key),
      amountReceived: amt,
      allocMeal, allocUtil, allocRent, allocPrevDue, change,
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
  if (d.allocPrevDue > 0) lines.push(`→ Prev. Due: ${fmtTk(d.allocPrevDue)}`);
  if (d.allocMeal    > 0) lines.push(`→ Meal:      ${fmtTk(d.allocMeal)}`);
  if (d.allocUtil    > 0) lines.push(`→ Utility:   ${fmtTk(d.allocUtil)}`);
  if (d.allocRent    > 0) lines.push(`→ Rent:      ${fmtTk(d.allocRent)}`);
  if (d.change       > 0) lines.push(`Change returned: ${fmtTk(d.change)}`);
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
