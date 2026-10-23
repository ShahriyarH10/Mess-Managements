/* ═══════════════════════════════════════════════
   MANAGER — Mess Fund: petty cash pool tracker
   Stored in utility_payments.bills.fund_entries = [{date,type,amount,note,actor}]
═══════════════════════════════════════════════ */

async function renderMessFund(el) {
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">Mess Fund</div><div class="page-sub">Shared petty cash — money in, money out, and what's left</div></div>
  </div>
  <div class="content dk">
    <div id="fund-tiles"></div>
    <div class="ml-grid">
      <div class="card ml-form">
        <div class="dk-card-title"><span>Add to the fund log</span></div>
        <input type="hidden" id="fund-type" value="deposit"/>
        <div class="an-seg fd-seg" id="fund-type-seg">
          <button class="an-seg-btn on" data-v="deposit" onclick="setFundType('deposit')">↓ Money in</button>
          <button class="an-seg-btn" data-v="withdrawal" onclick="setFundType('withdrawal')">↑ Money out</button>
        </div>
        <div class="field">
          <label>Amount</label>
          <div class="ml-amt"><span>৳</span><input type="number" class="input" id="fund-amount" min="1" step="1" placeholder="0"/></div>
          <div class="ml-quick">${[200, 500, 1000, 6000].map(v => `<button class="ml-chip" onclick="document.getElementById('fund-amount').value='${v}'">${fmtTk(v)}</button>`).join("")}</div>
        </div>
        <div class="field">
          <label>Date</label>
          <div class="ml-date"><input type="date" class="input" id="fund-date" value="${today()}"/>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('fund-date').value='${ymd(new Date())}'">Today</button></div>
        </div>
        <div class="field">
          <label>What for?</label>
          <input type="text" class="input" id="fund-note" placeholder="e.g. Monthly contribution, cleaning supplies…" onkeydown="if(event.key==='Enter') saveFundEntry()"/>
        </div>
        <button class="btn btn-primary ml-save" id="fund-save" onclick="saveFundEntry()">✓ Save money in</button>
      </div>
      <div class="card">
        <div class="dk-card-title"><span>History</span><span class="dk-legend" id="fund-count"></span></div>
        <div id="fund-wrap"><div class="loading"><div class="spinner"></div></div></div>
      </div>
    </div>
  </div>`;
  await loadFund();
}

function setFundType(v) {
  const t = document.getElementById("fund-type"); if (t) t.value = v;
  document.querySelectorAll("#fund-type-seg .an-seg-btn").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  const btn = document.getElementById("fund-save");
  if (btn) btn.textContent = v === "deposit" ? "✓ Save money in" : "✓ Save money out";
}

async function loadFund() {
  const wrap = document.getElementById("fund-wrap"), tiles = document.getElementById("fund-tiles");
  if (!wrap) return;
  try {
    const { data } = await getClient().from("utility_payments").select("bills,month_key")
      .eq("mess_id", messId()).order("month_key", { ascending: false });

    // Collect all fund entries across all months
    const allEntries = [];
    (data || []).forEach(row => (row.bills?.fund_entries || []).forEach(e => allEntries.push({ ...e, month_key: row.month_key })));
    allEntries.sort((a, b) => (b.date + (b.created || "")).localeCompare(a.date + (a.created || "")));

    const sum = (list, t) => round2(list.filter(e => e.type === t).reduce((s, e) => s + Number(e.amount || 0), 0));
    const totalIn = sum(allEntries, "deposit"), totalOut = sum(allEntries, "withdrawal");
    const balance = round2(totalIn - totalOut);
    const curKey = monthKey(new Date().getFullYear(), new Date().getMonth());
    const thisM = allEntries.filter(e => String(e.date).startsWith(curKey));
    const mIn = sum(thisM, "deposit"), mOut = sum(thisM, "withdrawal");
    const tile = (icon, label, value, sub, color) => `<div class="pf-tile"><div class="dk-head"><span class="dk-ico">${icon}</span><span class="dk-label">${label}</span></div>
      <div class="stat-value pf-val" ${color ? `style="color:${color}"` : ""}>${value}</div><div class="dk-sub">${sub}</div></div>`;
    if (tiles) tiles.innerHTML = `<div class="pf-tiles">
      ${tile("💰", "Balance", fmtTk(balance), balance >= 0 ? "cash in the fund now" : "fund is overdrawn", balance >= 0 ? "var(--green)" : "var(--red)")}
      ${tile("🗓️", "This month", (mIn - mOut >= 0 ? "+" : "−") + fmtTk(Math.abs(round2(mIn - mOut))), `in ${fmtTk(mIn)} · out ${fmtTk(mOut)}`, mIn - mOut >= 0 ? "var(--green)" : "var(--red)")}
      ${tile("↓", "Money in", fmtTk(totalIn), `${allEntries.filter(e => e.type === "deposit").length} deposits`, "var(--blue)")}
      ${tile("↑", "Money out", fmtTk(totalOut), `${allEntries.filter(e => e.type === "withdrawal").length} withdrawals`, "var(--accent)")}
    </div>`;
    const cnt = document.getElementById("fund-count"); if (cnt) cnt.textContent = `${allEntries.length} entr${allEntries.length === 1 ? "y" : "ies"}`;

    if (!allEntries.length) {
      wrap.innerHTML = `<div class="empty" style="padding:28px"><div>💰</div><div>No fund entries yet — add the first one on the left.</div></div>`;
      return;
    }

    // Running balance after each entry (entries are newest first)
    let run = balance;
    const withBal = allEntries.map(e => { const after = run; run = round2(run - (e.type === "deposit" ? 1 : -1) * Number(e.amount || 0)); return { ...e, after }; });
    const groups = [];
    withBal.forEach(e => { const k = String(e.date).slice(0, 7); let g = groups.find(x => x.k === k); if (!g) groups.push(g = { k, items: [] }); g.items.push(e); });
    const nice = d => { const [y, m, dd] = String(d).split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); };

    wrap.innerHTML = groups.map(g => {
      const gi = sum(g.items, "deposit"), go = sum(g.items, "withdrawal");
      return `<div class="ml-month"><span>${monthLabelFromKey(g.k)}</span><span class="fd-mtot"><b style="color:var(--green)">+${fmtTk(gi)}</b> <b style="color:var(--red)">−${fmtTk(go)}</b></span></div>
      ${g.items.map(e => {
        const dep = e.type === "deposit";
        return `<div class="fd-row">
          <span class="fd-ico ${dep ? "in" : "out"}">${dep ? "↓" : "↑"}</span>
          <div class="fd-body"><div class="fd-note">${escapeHtml(e.note || (dep ? "Deposit" : "Withdrawal"))}</div>
            <div class="fd-meta">${nice(e.date)} · by ${escapeHtml(e.actor || "—")}</div></div>
          <div class="fd-amt"><b style="color:${dep ? "var(--green)" : "var(--red)"}">${dep ? "+" : "−"}${fmtTk(e.amount)}</b><span>bal ${fmtTk(e.after)}</span></div>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteFundEntry('${e.month_key}','${e.id}')" title="Delete entry">✕</button>
        </div>`;
      }).join("")}`;
    }).join("");
  } catch(e) {
    wrap.innerHTML = `<div class="empty">Error: ${escapeHtml(e.message)}</div>`;
  }
}

function openFundEntryModal() {
  document.getElementById("modal-content").innerHTML = `
    <div class="modal-title">💰 Fund Entry</div>
    <div class="modal-sub">Add a deposit or withdrawal to the mess fund</div>
    <div class="grid-2">
      <div class="field"><label>Type *</label>
        <select class="input" id="fund-type">
          <option value="deposit">↓ Deposit</option>
          <option value="withdrawal">↑ Withdrawal</option>
        </select>
      </div>
      <div class="field"><label>Amount (৳) *</label><input type="number" class="input" id="fund-amount" min="1" step="1" placeholder="e.g. 500"/></div>
    </div>
    <div class="field"><label>Date *</label><input type="date" class="input" id="fund-date" value="${today()}"/></div>
    <div class="field"><label>Note</label><input type="text" class="input" id="fund-note" placeholder="e.g. Cleaning supplies, electricity meter token..."/></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveFundEntry()">Save entry</button>
    </div>`;
  openModal();
}

async function saveFundEntry() {
  if (!requireManager("saveFundEntry")) return;
  const type   = document.getElementById("fund-type")?.value;
  const amount = parseFloat(document.getElementById("fund-amount")?.value || 0);
  const date   = document.getElementById("fund-date")?.value;
  const note   = cleanText(document.getElementById("fund-note")?.value || "");
  if (!amount || amount <= 0) { toast("Enter a valid amount", "error"); return; }
  if (!date) { toast("Select a date", "error"); return; }

  const key = date.slice(0, 7);
  const [y, m] = key.split("-").map(Number);
  const month = m - 1;

  try {
    const { data: cur } = await getClient().from("utility_payments").select("*")
      .eq("mess_id", messId()).eq("month_key", key).maybeSingle();
    const bills = { ...(cur?.bills || {}) };
    if (!bills.fund_entries) bills.fund_entries = [];
    bills.fund_entries.push({
      id: Date.now().toString(36),
      type, amount, date, note,
      actor: currentUser?.name || "Manager",
      created: new Date().toISOString(),
    });
    await dbUpsertUtility(month, year_from_key(key), key, bills, cur?.payments || {});
    await logAudit("create", "fund", date, `Fund ${type}: ${fmtTk(amount)}${note ? " — " + note : ""}`);
    closeModal();
    toast(`Fund ${type} saved ✓`, "success");
    ["fund-amount", "fund-note"].forEach(id => { const i = document.getElementById(id); if (i) i.value = ""; });
    await loadFund();
  } catch(e) { toast("Error: " + e.message, "error"); }
}

function year_from_key(key) { return parseInt(key.slice(0, 4)); }

async function deleteFundEntry(monthKey, entryId) {
  if (!requireManager("deleteFundEntry")) return;
  showConfirm({
    title: "Delete fund entry?",
    body: "This transaction will be removed from the fund history.",
    confirmLabel: "Delete",
    danger: true,
    onConfirm: async () => {
      try {
        const [y, m] = monthKey.split("-").map(Number);
        const { data: cur } = await getClient().from("utility_payments").select("*")
          .eq("mess_id", messId()).eq("month_key", monthKey).maybeSingle();
        if (!cur) return;
        const bills = { ...(cur.bills || {}) };
        bills.fund_entries = (bills.fund_entries || []).filter(e => e.id !== entryId);
        await dbUpsertUtility(m - 1, y, monthKey, bills, cur.payments || {});
        toast("Entry deleted", "success");
        await loadFund();
      } catch(e) { toast("Error: " + e.message, "error"); }
    }
  });
}
