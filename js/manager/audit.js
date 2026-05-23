/* ═══════════════════════════════════════════════
   MANAGER — Audit Log
   ① Date range filter  ② Actor filter
   ③ Free-text search   ⑤ Group by day
═══════════════════════════════════════════════ */
async function renderAuditLog(el) {
  const today = new Date().toISOString().slice(0,10);
  const monthAgo = new Date(Date.now() - 30*24*3600000).toISOString().slice(0,10);

  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">📋 Audit Log</div><div class="page-sub">Track every data change in your mess</div></div>
  </div>
  <div class="content">
    <!-- Filter bar -->
    <div class="card" style="margin-bottom:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:8px;align-items:end;flex-wrap:wrap">
        <div class="field" style="margin:0">
          <label>From</label>
          <input type="date" class="input" id="audit-from" value="${monthAgo}" onchange="loadAuditEntries(true)"/>
        </div>
        <div class="field" style="margin:0">
          <label>To</label>
          <input type="date" class="input" id="audit-to" value="${today}" onchange="loadAuditEntries(true)"/>
        </div>
        <div class="field" style="margin:0">
          <label>Category</label>
          <select class="input" id="audit-filter" onchange="loadAuditEntries(true)">
            <option value="">All</option>
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
        <div class="field" style="margin:0">
          <label>Actor</label>
          <select class="input" id="audit-actor" onchange="loadAuditEntries(true)">
            <option value="">All members</option>
            ${members.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join("")}
          </select>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('audit-search').value='';loadAuditEntries(true)" style="margin-bottom:0">Reset</button>
      </div>
      <div class="field" style="margin:8px 0 0">
        <label>Search in summary</label>
        <input type="text" class="input" id="audit-search" placeholder="e.g. meals saved, Shahriyar..." oninput="loadAuditEntries(true)"/>
      </div>
    </div>

    <div class="card" id="audit-list"><div class="empty" style="padding:24px">Loading…</div></div>
    <div style="text-align:center;margin-top:12px" id="audit-more-wrap"></div>
  </div>`;
  window._auditOffset = 0;
  window._auditAllLoaded = [];
  await loadAuditEntries(true);
}

async function loadAuditEntries(reset = false) {
  if (reset) { window._auditOffset = 0; window._auditAllLoaded = []; }
  const entityFilter = document.getElementById("audit-filter")?.value || null;
  const actorFilter  = document.getElementById("audit-actor")?.value  || null;
  const searchText   = (document.getElementById("audit-search")?.value || "").trim().toLowerCase();
  const fromDate     = document.getElementById("audit-from")?.value || null;
  const toDate       = document.getElementById("audit-to")?.value   || null;
  const wrap    = document.getElementById("audit-list");
  const moreWrap= document.getElementById("audit-more-wrap");
  if (!wrap) return;
  if (reset) wrap.innerHTML = '<div class="empty" style="padding:16px">Loading…</div>';

  try {
    // Build query with all server-side filters
    let q = getClient().from("audit_log").select("*")
      .eq("mess_id", messId())
      .order("created_at", { ascending: false });
    if (entityFilter) q = q.eq("entity", entityFilter);
    if (actorFilter)  q = q.eq("actor_name", actorFilter);
    if (fromDate)     q = q.gte("created_at", fromDate + "T00:00:00");
    if (toDate)       q = q.lte("created_at", toDate   + "T23:59:59");
    q = q.range(window._auditOffset, window._auditOffset + 59);
    const { data, error } = await q;
    if (error) throw error;

    // Client-side free-text filter on summary
    let entries = data || [];
    if (searchText) {
      entries = entries.filter(e =>
        e.summary.toLowerCase().includes(searchText) ||
        e.actor_name.toLowerCase().includes(searchText) ||
        (e.entity_id || "").toLowerCase().includes(searchText)
      );
    }

    const actionIcon  = { create:"➕", update:"✏️", delete:"🗑️" };
    const entityColor = {
      meal:"var(--accent)", bazar:"var(--green)", rent:"var(--amber)",
      utility:"var(--purple)", member:"var(--blue)", announcement:"var(--text2)",
      attendance:"var(--blue)", broadcast:"var(--red)", mess_rules:"var(--text2)",
    };

    if (!entries.length) {
      if (reset) wrap.innerHTML = '<div class="empty" style="padding:24px">No entries match your filters.</div>';
      if (moreWrap) moreWrap.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:8px">End of log</div>';
      return;
    }

    // ⑤ Group by day
    const groups = {};
    entries.forEach(e => {
      const day = new Date(e.created_at).toLocaleDateString("en-IN", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
      if (!groups[day]) groups[day] = [];
      groups[day].push(e);
    });

    const html = Object.entries(groups).map(([day, dayEntries]) => {
      const rows = dayEntries.map(e => {
        const timeStr = new Date(e.created_at).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", hour12:true });
        const icon  = actionIcon[e.action] || "📝";
        const color = entityColor[e.entity] || "var(--text2)";
        return `<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:16px;flex-shrink:0;margin-top:2px">${icon}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:600">${escapeHtml(e.actor_name)}</span>
              <span style="font-size:10px;color:${color};background:var(--bg3);padding:1px 7px;border-radius:99px">${e.entity}</span>
              <span style="font-size:10px;color:var(--text3)">${e.action}</span>
              <span style="font-size:10px;color:var(--text3);margin-left:auto">${timeStr}</span>
            </div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px">${escapeHtml(e.summary)}</div>
            ${e.entity_id ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">${escapeHtml(e.entity_id)}</div>` : ""}
          </div>
        </div>`;
      }).join("");

      const dayId = "audit-day-" + day.replace(/\s+/g, "-");
      return `
        <div style="margin-bottom:4px">
          <div onclick="toggleAuditDay('${dayId}')" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg3);border-radius:var(--radius-sm);user-select:none">
            <span id="${dayId}-arrow" style="font-size:11px;transition:transform .2s">▼</span>
            <span style="font-size:12px;font-weight:600">${day}</span>
            <span style="font-size:11px;color:var(--text3);margin-left:auto">${dayEntries.length} action${dayEntries.length>1?"s":""}</span>
          </div>
          <div id="${dayId}" style="padding:0 4px">${rows}</div>
        </div>`;
    }).join("");

    if (reset) wrap.innerHTML = html;
    else wrap.innerHTML += html;

    window._auditOffset += (data || []).length;
    if (moreWrap) moreWrap.innerHTML = (data||[]).length >= 60
      ? '<button class="btn btn-ghost btn-sm" onclick="loadAuditEntries(false)">Load more</button>'
      : '<div style="font-size:11px;color:var(--text3);padding:8px">End of log</div>';
  } catch (e) {
    toast("Error loading audit log: " + e.message, "error");
  }
}

function toggleAuditDay(id) {
  const el = document.getElementById(id);
  const arrow = document.getElementById(id + "-arrow");
  if (!el) return;
  const isHidden = el.style.display === "none";
  el.style.display = isHidden ? "" : "none";
  if (arrow) arrow.style.transform = isHidden ? "" : "rotate(-90deg)";
}
