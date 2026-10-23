/* ═══════════════════════════════════════════════
   MANAGER — Notifications: member update activity only
   No approve / reject system
   ═══════════════════════════════════════════════ */

let _notifAll = [], _notifFilter = "all", _notifLimit = 50;
const NOTIF_PAGE = 50;
const NOTIF_GROUPS = {
  meals:    ["meal_update", "meal_request"],
  bazar:    ["bazar_update", "bazar_request"],
  payments: ["utility_update", "rent_update", "payment_request", "payment_confirmed", "payment_rejected", "bill_payment"],
};
const _isNewNotif = n => n.status === "new" || n.status === "pending";

async function renderNotifications(el) {
  _notifAll = await dbGetNotifications();
  _notifLimit = NOTIF_PAGE;
  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Member Updates</div>
      <div class="page-sub" id="nt-sub"></div>
    </div>
    <div class="topbar-actions">
      <button class="btn btn-ghost btn-sm" data-on-click="markAllNotificationsSeen()">✓ Mark all seen</button>
    </div>
  </div>
  <div class="content dk">
    <div class="nt-bar"><div class="an-seg" id="nt-seg"></div></div>
    <div class="card" id="nt-list"></div>
  </div>`;
  drawNotifications();
}

function setNotifFilter(f) { _notifFilter = f; _notifLimit = NOTIF_PAGE; drawNotifications(); }
function showMoreNotifications() { _notifLimit += NOTIF_PAGE; drawNotifications(); }

function drawNotifications() {
  const all = _notifAll, fresh = all.filter(_isNewNotif);
  const sub = document.getElementById("nt-sub");
  if (sub) sub.textContent = fresh.length ? `${fresh.length} new update${fresh.length === 1 ? "" : "s"} from members` : "You're all caught up";
  const count = f => f === "all" ? all.length : f === "new" ? fresh.length : all.filter(n => NOTIF_GROUPS[f].includes(n.type)).length;
  const seg = document.getElementById("nt-seg");
  if (seg) seg.innerHTML = [["all", "All"], ["new", "New"], ["meals", "🍽️ Meals"], ["bazar", "🛒 Bazar"], ["payments", "💵 Payments"]]
    .map(([f, t]) => `<button class="an-seg-btn${_notifFilter === f ? " on" : ""}" data-on-click="setNotifFilter('${f}')">${t} <span class="nt-c">${count(f)}</span></button>`).join("");

  const list = document.getElementById("nt-list");
  if (!list) return;
  // filter first, then page — so the list always matches the tab's count
  const matching = all.filter(n => _notifFilter === "all" ? true : _notifFilter === "new" ? _isNewNotif(n) : NOTIF_GROUPS[_notifFilter].includes(n.type));
  const shown = matching.slice(0, _notifLimit);
  if (!shown.length) {
    list.innerHTML = `<div class="empty" style="padding:30px"><div>🔔</div><div>${all.length ? "Nothing here with this filter." : "No member updates yet — they appear when members change their own meals, bazar or payments."}</div></div>`;
    return;
  }
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const tKey = ymd(new Date()), yKey = ymd(new Date(Date.now() - 86400000));
  const groups = [];
  shown.forEach(n => { const d = new Date(n.created_at), k = ymd(d); let g = groups.find(x => x.k === k); if (!g) groups.push(g = { k, d, items: [] }); g.items.push(n); });
  list.innerHTML = groups.map(g => `
    <div class="nt-day">${g.k === tKey ? "Today" : g.k === yKey ? "Yesterday" : g.d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
    ${g.items.map(notifCard).join("")}`).join("") + `
    <div class="nt-more">${matching.length > shown.length
      ? `<span>Showing ${shown.length} of ${matching.length}</span><button class="btn btn-ghost btn-sm" data-on-click="showMoreNotifications()">Show ${Math.min(NOTIF_PAGE, matching.length - shown.length)} more</button>`
      : `<span>All ${matching.length} shown</span>`}</div>`;
}

function notifCard(n) {
  const typeMap = {
    meal_update:    { icon: "🍽️", label: "updated meal" },
    bazar_update:   { icon: "🛒", label: "updated bazar" },
    utility_update: { icon: "⚡", label: "updated utility payment" },
    rent_update:    { icon: "🏠", label: "updated room rent payment" },

    // Give Payment flow (member request → manager confirm / reject)
    payment_request:   { icon: "💵", label: "wants to give a payment — confirm in Collect" },
    payment_confirmed: { icon: "✅", label: "confirmed a member payment" },
    payment_rejected:  { icon: "✖️", label: "rejected a member payment" },

    // old rows support
    meal_request:   { icon: "🍽️", label: "meal entry" },
    bazar_request:  { icon: "🛒", label: "bazar entry" },
    bill_payment:   { icon: "💡", label: "utility / room rent entry" },
  };

  const { icon, label } = typeMap[n.type] || {
    icon: "📋",
    label: n.type,
  };

  const isNew = n.status === "new" || n.status === "pending";
  const statusCls = isNew ? "badge-amber" : "badge-green";
  const statusLabel = isNew ? "New" : "Seen";

  const data = n.data || {};

  const billTypeLabel = {
    elec: "⚡ Electricity",
    wifi: "📶 WiFi",
    gas: "🔥 Gas",
    khala: "👩 Khala",
    other: "📦 Other",
    rent: "🏠 Rent",
  };

  let dataHtml = "";

  if (n.type === "meal_update" || n.type === "meal_request") {
    const name = data.member || n.from_name;
    const day = data.day ?? data[name + "_day"] ?? "—";
    const night = data.night ?? data[name + "_night"] ?? "—";
    const total = data.total ?? data[name] ?? "—";

    dataHtml = `
      <span class="nt-chip">Day: <b>${day}</b></span>
      <span class="nt-chip">Night: <b>${night}</b></span>
      <span class="nt-chip">Total: <b>${total}</b></span>`;
  }

  else if (n.type === "bazar_update" || n.type === "bazar_request") {
    const amount = data.amount ?? Object.values(data)[0] ?? 0;

    dataHtml = `
      <span class="nt-chip nt-money">
        ${fmtTk(amount)}
      </span>`;
  }

  else if (n.type === "utility_update") {
    dataHtml = `
      <span class="nt-chip">
        ${billTypeLabel[data.billType] || data.billLabel || "Utility"}
      </span>

      <span class="nt-chip nt-money">
        ${fmtTk(data.amount || 0)}
      </span>

      <span class="nt-chip">
        ${data.monthName || ""} ${data.year || ""}
      </span>`;
  }

  else if (n.type === "rent_update") {
    dataHtml = `
      <span class="nt-chip">
        🏠 Room Rent
      </span>

      <span class="nt-chip nt-money">
        ${fmtTk(data.amount || 0)}
      </span>

      <span class="nt-chip">
        ${data.monthName || ""} ${data.year || ""}
      </span>`;
  }

  else if (n.type === "payment_request" || n.type === "payment_confirmed" || n.type === "payment_rejected") {
    const tag = n.type === "payment_request" ? "Pending" : n.type === "payment_confirmed" ? "Confirmed" : "Rejected";
    dataHtml = `
      <span class="nt-chip">💵 ${tag}</span>

      <span class="nt-chip nt-money">
        ${fmtTk(data.amount || 0)}
      </span>

      <span class="nt-chip">
        ${data.monthName || ""} ${data.year || ""}
      </span>`;
  }

  else if (n.type === "bill_payment") {
    dataHtml = `
      <span class="nt-chip">
        ${billTypeLabel[data.billType] || data.billType}
      </span>

      <span class="nt-chip nt-money">
        ${fmtTk(data.amount || 0)}
      </span>

      <span class="nt-chip">
        ${data.monthName || ""} ${data.year || ""}
      </span>`;
  }

  const forDay = n.date ? (() => { const [y, m, d] = String(n.date).split("-").map(Number); return y ? new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : n.date; })() : "";
  const time = new Date(n.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `
  <div class="nt-row${isNew ? " nt-new" : ""}" id="nt-${n.id}">
    <span class="dk-av nt-av" style="${avStyle(n.from_name)}">${avFaceByName(n.from_name)}<span class="nt-type">${icon}</span></span>
    <div class="nt-body">
      <div class="nt-line"><b>${n.from_name}</b> ${label}${forDay && /meal|bazar/.test(n.type) ? ` for <b class="nt-for">${forDay}</b>` : ""}</div>
      ${dataHtml.trim() ? `<div class="nt-data">${dataHtml}</div>` : ""}
      ${n.note ? `<div class="nt-note">“${n.note}”</div>` : ""}
    </div>
    <div class="nt-side">
      <span class="nt-time">${time}</span>
      ${n.type === "payment_request" ? `<button class="btn btn-primary btn-sm" data-on-click="navigate('collect')">Review</button>` : ""}
      ${isNew ? `<button class="btn btn-ghost btn-sm nt-seen" data-on-click="markNotificationSeen('${n.id}')" title="Mark as seen">✓ Seen</button>` : ""}
    </div>
  </div>`;
}

async function markNotificationSeen(id) {
  if (!requireManager("markNotificationSeen")) return;
  try {
    await dbUpdateNotifStatus(id, "seen");
    const n = _notifAll.find(x => x.id === id); if (n) n.status = "seen";
    const row = document.getElementById("nt-" + id);
    if (row) { row.classList.add("nt-fade"); setTimeout(drawNotifications, 220); } else drawNotifications();
    refreshNotifBadge();
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

async function markAllNotificationsSeen() {
  if (!requireManager("markAllNotificationsSeen")) return;
  try {
    const all = await dbGetNotifications();
    const fresh = all.filter(n => n.status === "new" || n.status === "pending");

    await Promise.all(
      fresh.map(n => dbUpdateNotifStatus(n.id, "seen"))
    );

    toast("All updates marked as seen", "success");
    _notifAll.forEach(n => { if (_isNewNotif(n)) n.status = "seen"; });
    refreshNotifBadge();
    drawNotifications();
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}