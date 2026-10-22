/* ═══════════════════════════════════════════════
   MANAGER — Audit Log
   ① Date range filter  ② Actor filter
   ③ Free-text search   ⑤ Group by day
═══════════════════════════════════════════════ */
const AUDIT_CATS = [
  ["meal", "Meals"], ["bazar", "Bazar"], ["rent", "Rent"], ["utility", "Utility"], ["collect", "Payments"],
  ["fund", "Fund"], ["member", "Members"], ["announcement", "Announcements"], ["attendance", "Attendance"],
  ["broadcast", "Broadcasts"], ["mess_rules", "Rules"],
];
const _auditYmd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function renderAuditLog(el) {
  const today = _auditYmd(new Date());
  const monthAgo = _auditYmd(new Date(Date.now() - 30 * 86400000));

  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">Audit Log</div><div class="page-sub">Every change made in your mess, newest first</div></div>
    <div class="topbar-actions"><div class="an-seg" id="audit-range">
      <button class="an-seg-btn" data-days="7" onclick="setAuditRange(7)">7 days</button>
      <button class="an-seg-btn on" data-days="30" onclick="setAuditRange(30)">30 days</button>
      <button class="an-seg-btn" data-days="90" onclick="setAuditRange(90)">90 days</button>
    </div></div>
  </div>
  <div class="content dk">
    <div class="card au-filters">
      <div class="au-search"><span>🔎</span><input type="text" class="input" id="audit-search" placeholder="Search what changed or who did it…" oninput="loadAuditEntries(true)"/></div>
      <select class="input" id="audit-filter" onchange="loadAuditEntries(true)">
        <option value="">All categories</option>
        ${AUDIT_CATS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}
      </select>
      <select class="input" id="audit-actor" onchange="loadAuditEntries(true)">
        <option value="">Everyone</option>
        ${members.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join("")}
      </select>
      <input type="date" class="input" id="audit-from" value="${monthAgo}" onchange="clearAuditRangeSeg();loadAuditEntries(true)" title="From"/>
      <input type="date" class="input" id="audit-to" value="${today}" onchange="clearAuditRangeSeg();loadAuditEntries(true)" title="To"/>
      <button class="btn btn-ghost btn-sm" onclick="resetAuditFilters()">Reset</button>
    </div>

    <div id="audit-summary"></div>
    <div class="card" id="audit-list"><div class="loading"><div class="spinner"></div>Loading…</div></div>
    <div style="text-align:center;margin-top:12px" id="audit-more-wrap"></div>
  </div>`;
  window._auditOffset = 0;
  window._auditAllLoaded = [];
  await loadAuditEntries(true);
}

function setAuditRange(days) {
  const f = document.getElementById("audit-from"), t = document.getElementById("audit-to");
  if (f) f.value = _auditYmd(new Date(Date.now() - days * 86400000));
  if (t) t.value = _auditYmd(new Date());
  document.querySelectorAll("#audit-range .an-seg-btn").forEach(b => b.classList.toggle("on", Number(b.dataset.days) === days));
  loadAuditEntries(true);
}
function clearAuditRangeSeg() { document.querySelectorAll("#audit-range .an-seg-btn").forEach(b => b.classList.remove("on")); }
function resetAuditFilters() {
  ["audit-search", "audit-filter", "audit-actor"].forEach(id => { const e = document.getElementById(id); if (e) e.value = ""; });
  setAuditRange(30);
}
function filterAuditCategory(cat) {
  const sel = document.getElementById("audit-filter");
  if (!sel) return;
  sel.value = sel.value === cat ? "" : cat;
  loadAuditEntries(true);
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
  if (reset) wrap.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

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

    const catLabel = Object.fromEntries(AUDIT_CATS);
    const actionWord = { create: "added", update: "updated", delete: "deleted" };

    if (!entries.length) {
      if (reset) {
        wrap.innerHTML = '<div class="empty" style="padding:28px"><div>🗂️</div><div>No changes match these filters.</div></div>';
        const sm = document.getElementById("audit-summary"); if (sm) sm.innerHTML = "";
      }
      if (moreWrap) moreWrap.innerHTML = "";
      return;
    }

    // Summary chips (this page of results) — click to filter by category
    window._auditAllLoaded = (reset ? [] : window._auditAllLoaded).concat(entries);
    const all = window._auditAllLoaded, cur = entityFilter || "";
    const counts = {};
    all.forEach(e => { counts[e.entity] = (counts[e.entity] || 0) + 1; });
    const sm = document.getElementById("audit-summary");
    if (sm) sm.innerHTML = `<div class="au-sum">
      <span class="au-total"><b>${all.length}${(data || []).length >= 60 ? "+" : ""}</b> change${all.length === 1 ? "" : "s"}</span>
      ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) =>
        `<button class="ml-chip au-cat au-c-${k}${cur === k ? " on" : ""}" onclick="filterAuditCategory('${escapeHtml(k)}')">${escapeHtml(catLabel[k] || k)} <b>${n}</b></button>`).join("")}
    </div>`;

    // ⑤ Group by day
    const groups = [];
    entries.forEach(e => {
      const d = new Date(e.created_at);
      const key = _auditYmd(d);
      let g = groups.find(x => x.key === key);
      if (!g) groups.push(g = { key, d, items: [] });
      g.items.push(e);
    });
    const todayKey = _auditYmd(new Date()), yKey = _auditYmd(new Date(Date.now() - 86400000));

    const html = groups.map(g => {
      const label = g.key === todayKey ? "Today" : g.key === yKey ? "Yesterday"
        : g.d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      const rows = g.items.map(e => {
        const timeStr = new Date(e.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
        const mIdx = members.findIndex(m => m.name === e.actor_name);
        const col = avatarCol(Math.max(0, mIdx));
        return `<div class="au-item au-${e.action || "update"}">
          <span class="au-dot"></span>
          <span class="dk-av" style="background:${col.bg};color:${col.fg}">${initials(e.actor_name || "?")}</span>
          <div class="au-body">
            <div class="au-line"><b>${escapeHtml(e.actor_name)}</b> <span class="au-act">${actionWord[e.action] || e.action}</span> · ${escapeHtml(e.summary)}</div>
            <div class="au-meta"><span class="au-cat-tag au-c-${escapeHtml(e.entity)}">${escapeHtml(catLabel[e.entity] || e.entity)}</span>${e.entity_id ? `<span>${escapeHtml(e.entity_id)}</span>` : ""}</div>
          </div>
          <span class="au-time">${timeStr}</span>
        </div>`;
      }).join("");
      const dayId = "audit-day-" + g.key;
      return `<div class="au-day">
        <button class="au-day-head" onclick="toggleAuditDay('${dayId}')">
          <span id="${dayId}-arrow" class="au-arrow">▾</span><b>${label}</b>${g.key === todayKey || g.key === yKey ? `<span class="au-dsub">${g.d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>` : ""}
          <span class="au-count">${g.items.length}</span>
        </button>
        <div id="${dayId}" class="au-items">${rows}</div>
      </div>`;
    }).join("");

    if (reset) wrap.innerHTML = html;
    else wrap.innerHTML += html;

    window._auditOffset += (data || []).length;
    if (moreWrap) moreWrap.innerHTML = (data||[]).length >= 60
      ? '<button class="btn btn-ghost btn-sm" onclick="loadAuditEntries(false)">Load more</button>'
      : '<div style="font-size:11px;color:var(--text3);padding:8px">— end of log —</div>';
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
