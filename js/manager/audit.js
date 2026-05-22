/* ═══════════════════════════════════════════════
   MANAGER — Audit Log: view all data changes
   ═══════════════════════════════════════════════ */
async function renderAuditLog(el) {
  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">📋 Audit Log</div><div class="page-sub">Track every data change in your mess</div></div>
    <div class="topbar-actions">
      <select class="input" id="audit-filter" style="width:130px" onchange="loadAuditEntries(true)">
        <option value="">All actions</option>
        <option value="meal">Meals</option>
        <option value="bazar">Bazar</option>
        <option value="rent">Rent</option>
        <option value="utility">Utility</option>
        <option value="member">Members</option>
        <option value="announcement">Announcements</option>
        <option value="attendance">Attendance</option>
        <option value="broadcast">Broadcasts</option>
      </select>
    </div>
  </div>
  <div class="content">
    <div class="card" id="audit-list"><div class="empty" style="padding:24px">Loading…</div></div>
    <div style="text-align:center;margin-top:12px" id="audit-more-wrap"></div>
  </div>`;
  window._auditOffset = 0;
  await loadAuditEntries(true);
}

async function loadAuditEntries(reset = false) {
  if (reset) window._auditOffset = 0;
  const filter = document.getElementById("audit-filter")?.value || null;
  const wrap = document.getElementById("audit-list");
  const moreWrap = document.getElementById("audit-more-wrap");
  if (!wrap) return;

  if (reset) wrap.innerHTML = '<div class="empty" style="padding:16px">Loading…</div>';

  try {
    const entries = await dbGetAuditLog(30, window._auditOffset, filter || null);

    const actionIcon = { create: "➕", update: "✏️", delete: "🗑️" };
    const entityColor = {
      meal: "var(--accent)", bazar: "var(--green)", rent: "var(--amber)",
      utility: "var(--purple)", member: "var(--blue)", announcement: "var(--text2)",
      attendance: "var(--blue)", broadcast: "var(--red)", mess_rules: "var(--text2)",
    };

    if (!entries.length) {
      if (reset) wrap.innerHTML = '<div class="empty" style="padding:24px">No audit entries yet. Actions will be logged as changes are made.</div>';
      if (moreWrap) moreWrap.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:8px">End of log</div>';
      return;
    }

    const html = entries.map(e => {
      const dt = new Date(e.created_at);
      const timeStr = dt.toLocaleString("en-IN", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit", hour12:true });
      const icon = actionIcon[e.action] || "📝";
      const color = entityColor[e.entity] || "var(--text2)";
      return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:18px;flex-shrink:0;margin-top:2px">${icon}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:13px;font-weight:600">${escapeHtml(e.actor_name)}</span>
            <span style="font-size:11px;color:${color};background:var(--bg3);padding:1px 7px;border-radius:99px">${e.entity}</span>
            <span style="font-size:11px;color:var(--text3)">${e.action}</span>
          </div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px">${escapeHtml(e.summary)}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:3px">${timeStr}${e.entity_id ? ` · ${escapeHtml(e.entity_id)}` : ""}</div>
        </div>
      </div>`;
    }).join("");

    if (reset) wrap.innerHTML = html;
    else wrap.innerHTML += html;

    window._auditOffset += entries.length;
    if (moreWrap) moreWrap.innerHTML = entries.length >= 30
      ? '<button class="btn btn-ghost btn-sm" onclick="loadAuditEntries(false)">Load more</button>'
      : '<div style="font-size:11px;color:var(--text3);padding:8px">End of log</div>';
  } catch (e) {
    toast("Error loading audit log: " + e.message, "error");
  }
}
