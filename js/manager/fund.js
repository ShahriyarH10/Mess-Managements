/* ═══════════════════════════════════════════════
   MANAGER — Mess Fund: petty cash pool tracker
   Stored in utility_payments.bills.fund_entries = [{date,type,amount,note,actor}]
═══════════════════════════════════════════════ */

async function renderMessFund(el) {
  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">Mess Fund</div><div class="page-sub">Petty cash pool — track deposits, withdrawals, and shared expenses</div></div>
    <div class="topbar-actions">
      <button class="btn btn-primary btn-sm" onclick="openFundEntryModal()">+ Entry</button>
    </div>
  </div>
  <div class="content">
    <div id="fund-wrap"><div class="empty" style="padding:32px;text-align:center"><div class="spinner"></div></div></div>
  </div>`;
  await loadFund();
}

async function loadFund() {
  const wrap = document.getElementById("fund-wrap");
  if (!wrap) return;
  try {
    const { data } = await getClient().from("utility_payments").select("bills,month_key")
      .eq("mess_id", messId()).order("month_key", { ascending: false });
    
    // Collect all fund entries across all months
    const allEntries = [];
    (data || []).forEach(row => {
      const entries = (row.bills?.fund_entries || []);
      entries.forEach(e => allEntries.push({ ...e, month_key: row.month_key }));
    });
    allEntries.sort((a, b) => b.date.localeCompare(a.date));

    // Balance
    const balance = round2(allEntries.reduce((sum, e) => sum + (e.type === 'deposit' ? e.amount : -e.amount), 0));

    if (!allEntries.length) {
      wrap.innerHTML = `
        <div class="card" style="margin-bottom:12px">
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <div class="stat-card" style="flex:1;min-width:120px;border-top:3px solid var(--green)">
              <div class="stat-label">Current balance</div>
              <div class="stat-value" style="color:var(--green);font-size:26px">৳0</div>
            </div>
          </div>
        </div>
        <div class="card"><div class="empty" style="padding:24px;text-align:center">
          <div style="font-size:32px;margin-bottom:8px">💰</div>
          <div>No fund entries yet. Click <b>+ Entry</b> to add a deposit or withdrawal.</div>
        </div></div>`;
      return;
    }

    const totalDeposits    = round2(allEntries.filter(e => e.type === 'deposit').reduce((s, e) => s + e.amount, 0));
    const totalWithdrawals = round2(allEntries.filter(e => e.type === 'withdrawal').reduce((s, e) => s + e.amount, 0));

    wrap.innerHTML = `
      <!-- Balance stats -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:14px">
        <div class="stat-card" style="border-top:3px solid ${balance >= 0 ? 'var(--green)' : 'var(--red)'}">
          <div class="stat-label">Balance</div>
          <div class="stat-value" style="color:${balance >= 0 ? 'var(--green)' : 'var(--red)'};font-size:24px">${fmtTk(balance)}</div>
        </div>
        <div class="stat-card" style="border-top:3px solid var(--blue)">
          <div class="stat-label">Total deposits</div>
          <div class="stat-value" style="color:var(--blue)">${fmtTk(totalDeposits)}</div>
        </div>
        <div class="stat-card" style="border-top:3px solid var(--accent)">
          <div class="stat-label">Total withdrawn</div>
          <div class="stat-value" style="color:var(--accent)">${fmtTk(totalWithdrawals)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Entries</div>
          <div class="stat-value">${allEntries.length}</div>
        </div>
      </div>

      <!-- Entry log -->
      <div class="card">
        <div class="card-title" style="margin-bottom:12px">Transaction history</div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Note</th><th>By</th><th></th></tr></thead>
          <tbody>
            ${allEntries.map(e => `<tr>
              <td>${e.date}</td>
              <td><span class="badge ${e.type === 'deposit' ? 'badge-green' : 'badge-amber'}">${e.type === 'deposit' ? '↓ Deposit' : '↑ Withdrawal'}</span></td>
              <td style="font-weight:700;color:${e.type === 'deposit' ? 'var(--green)' : 'var(--red)'}">${e.type === 'deposit' ? '+' : '-'}${fmtTk(e.amount)}</td>
              <td style="color:var(--text2)">${escapeHtml(e.note || '—')}</td>
              <td style="color:var(--text3)">${escapeHtml(e.actor || '—')}</td>
              <td><button class="btn btn-ghost btn-sm btn-icon" onclick="deleteFundEntry('${e.month_key}','${e.id}')">✕</button></td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;
  } catch(e) {
    wrap.innerHTML = `<div class="card"><div class="empty">Error: ${escapeHtml(e.message)}</div></div>`;
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
