/* ═══════════════════════════════════════════════
   MANAGER — Notifications: member update activity only
   No approve / reject system
   ═══════════════════════════════════════════════ */

async function renderNotifications(el) {
  const all = await dbGetNotifications();
  const fresh = all.filter(n => n.status === "new" || n.status === "pending");

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Member Updates</div>
      <div class="page-sub">${fresh.length} new update${fresh.length === 1 ? "" : "s"}</div>
    </div>

    <div class="topbar-actions">
      <button class="btn btn-ghost btn-sm" onclick="markAllNotificationsSeen()">Mark all seen</button>
      <button class="btn btn-ghost btn-sm" onclick="navigate('notifications')">Refresh</button>
    </div>
  </div>

  <div class="content">
    ${
      all.length === 0
        ? `<div class="card" style="text-align:center;padding:32px">
            <div style="font-size:28px;margin-bottom:10px">🔔</div>
            <div style="color:var(--text2);font-size:14px">No member updates yet</div>
          </div>`
        : `<div class="card">
            <div class="card-title">Latest member activity</div>
            <div style="display:flex;flex-direction:column;gap:10px">
              ${all.slice(0, 80).map(n => notifCard(n)).join("")}
            </div>
          </div>`
    }
  </div>`;
}

function notifCard(n) {
  const typeMap = {
    meal_update:    { icon: "🍽️", label: "updated meal" },
    bazar_update:   { icon: "🛒", label: "updated bazar" },
    utility_update: { icon: "⚡", label: "updated utility payment" },
    rent_update:    { icon: "🏠", label: "updated room rent payment" },

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
      <span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">Day: <b>${day}</b></span>
      <span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">Night: <b>${night}</b></span>
      <span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">Total: <b>${total}</b></span>`;
  }

  else if (n.type === "bazar_update" || n.type === "bazar_request") {
    const amount = data.amount ?? Object.values(data)[0] ?? 0;

    dataHtml = `
      <span style="font-size:13px;font-weight:600;color:var(--green)">
        ${fmtTk(amount)}
      </span>`;
  }

  else if (n.type === "utility_update") {
    dataHtml = `
      <span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">
        ${billTypeLabel[data.billType] || data.billLabel || "Utility"}
      </span>

      <span style="font-size:13px;font-weight:600;color:var(--green)">
        ${fmtTk(data.amount || 0)}
      </span>

      <span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">
        ${data.monthName || ""} ${data.year || ""}
      </span>`;
  }

  else if (n.type === "rent_update") {
    dataHtml = `
      <span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">
        🏠 Room Rent
      </span>

      <span style="font-size:13px;font-weight:600;color:var(--green)">
        ${fmtTk(data.amount || 0)}
      </span>

      <span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">
        ${data.monthName || ""} ${data.year || ""}
      </span>`;
  }

  else if (n.type === "bill_payment") {
    dataHtml = `
      <span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">
        ${billTypeLabel[data.billType] || data.billType}
      </span>

      <span style="font-size:13px;font-weight:600;color:var(--green)">
        ${fmtTk(data.amount || 0)}
      </span>

      <span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">
        ${data.monthName || ""} ${data.year || ""}
      </span>`;
  }

  return `
  <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
          <span>${icon}</span>
          <span style="font-weight:600;font-size:14px">${n.from_name}</span>
          <span style="font-size:12px;color:var(--text3)">${label}</span>
          <span class="badge ${statusCls}" style="font-size:10px">${statusLabel}</span>
        </div>

        <div style="font-size:12px;color:var(--text3);margin-bottom:8px">
          📅 ${n.date} · ${new Date(n.created_at).toLocaleString()}
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:${n.note ? "8px" : "0"}">
          ${dataHtml}
        </div>

        ${
          n.note
            ? `<div style="font-size:12px;color:var(--text2);margin-top:6px">💬 "${n.note}"</div>`
            : ""
        }
      </div>

      ${
        isNew
          ? `<button class="btn btn-ghost btn-sm" onclick="markNotificationSeen('${n.id}')">Mark seen</button>`
          : ""
      }
    </div>
  </div>`;
}

async function markNotificationSeen(id) {
  try {
    await dbUpdateNotifStatus(id, "seen");

    toast("Marked as seen", "success");

    refreshNotifBadge();
    navigate("notifications");
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

async function markAllNotificationsSeen() {
  try {
    const all = await dbGetNotifications();
    const fresh = all.filter(n => n.status === "new" || n.status === "pending");

    await Promise.all(
      fresh.map(n => dbUpdateNotifStatus(n.id, "seen"))
    );

    toast("All updates marked as seen", "success");

    refreshNotifBadge();
    navigate("notifications");
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}