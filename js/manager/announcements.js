/* MANAGER — Messages (broadcast notices) */

function _relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
}


/* ═══════════════════════════════════════════════
   MESSAGES — merged Announcements + Broadcasts
   Manager: post both. Member: read-only feed.
═══════════════════════════════════════════════ */

async function renderMessages(el, isManager) {
  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Messages</div>
      <div class="page-sub">${isManager ? "Notices every member sees on their dashboard" : "Notices from your manager"}</div>
    </div>
  </div>
  <div class="content dk">
    ${isManager ? `
    <div class="card bc-compose">
      <div class="bc-top">
        <span class="dk-av bc-me" style="${avStyle(currentUser.name)}">${avFace(currentUser.memberId, currentUser.name)}</span>
        <textarea class="input" id="bc-msg" rows="2" maxlength="500" placeholder="Write a notice for everyone… e.g. Pay rent by Friday!" data-on-input="bcCount(this)"></textarea>
      </div>
      <input type="hidden" id="bc-priority" value="normal"/>
      <div class="bc-opts">
        <div class="an-seg" id="bc-pri-seg">
          <button class="an-seg-btn on" data-v="normal" data-on-click="setBcPriority('normal')">📢 Normal</button>
          <button class="an-seg-btn" data-v="urgent" data-on-click="setBcPriority('urgent')">🔴 Urgent</button>
        </div>
        <label class="ma-skip bc-pin"><input type="checkbox" id="bc-pin"/><span>📌 Pin to top</span></label>
        <select class="input input-sm bc-exp" id="bc-expiry" title="Hide it automatically after…">
          <option value="">Never expires</option><option value="6">Expires in 6 h</option><option value="12">Expires in 12 h</option>
          <option value="24">Expires in 1 day</option><option value="72">Expires in 3 days</option><option value="168">Expires in 1 week</option>
        </select>
        <span class="bc-count" id="bc-count">0/500</span>
        <button class="btn btn-primary btn-sm" data-on-click="sendBroadcast()">Send to all</button>
      </div>
    </div>` : ""}
    <div id="msg-broadcasts-wrap"><div class="loading"><div class="spinner"></div>Loading…</div></div>
  </div>`;

  if (!isManager && currentUser.memberId) {
    try { localStorage.setItem(`mm_announce_read_${currentUser.memberId}`, new Date().toISOString()); } catch (_) {}
    refreshMemberAnnounceBadge?.();
  }

  await loadMessagesPage(isManager);
}

function bcCount(t) { const c = document.getElementById("bc-count"); if (c) c.textContent = `${t.value.length}/500`; }
function setBcPriority(v) {
  const h = document.getElementById("bc-priority"); if (h) h.value = v;
  document.querySelectorAll("#bc-pri-seg .an-seg-btn").forEach(b => b.classList.toggle("on", b.dataset.v === v));
}

async function loadMessagesPage(isManager) {
  const bWrap = document.getElementById("msg-broadcasts-wrap");
  if (!bWrap) return;
  isManager = isManager ?? ["manager", "sub_manager"].includes(currentUser?.role);

  try {
    const { data: bcs } = await getClient().from("broadcasts").select("*")
      .eq("mess_id", messId())
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30);

    const now    = new Date();
    const active = (bcs || []).filter(b => !b.expires_at || new Date(b.expires_at) > now);
    const list   = isManager ? (bcs || []) : active;

    if (!list.length) {
      bWrap.innerHTML = `<div class="card"><div class="empty" style="padding:32px"><div>📢</div>
        <div>${isManager ? "No notices yet — write one above." : "No notices from your manager yet."}</div></div></div>`;
      return;
    }

    const card = b => {
      const isUrgent  = b.priority === "urgent";
      const isExpired = b.expires_at && new Date(b.expires_at) < now;
      const when = new Date(b.created_at);
      const dt = when.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
      const exp = b.expires_at && !isExpired ? `expires ${new Date(b.expires_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}` : "";
      return `<div class="bc-card${isUrgent ? " bc-urgent" : ""}${b.pinned ? " bc-pinned" : ""}${isExpired ? " bc-expired" : ""}">
        <span class="dk-av bc-av" style="${avStyle(b.author)}">${avFaceByName(b.author)}</span>
        <div class="bc-body">
          <div class="bc-head">
            <b>${escapeHtml(b.author || "Manager")}</b>
            ${b.pinned ? `<span class="badge badge-amber">📌 Pinned</span>` : ""}
            ${isUrgent ? `<span class="badge badge-red">Urgent</span>` : ""}
            ${isExpired ? `<span class="badge">Expired</span>` : ""}
            <span class="bc-time" title="${escapeHtml(when.toLocaleString())}">${_relativeTime(b.created_at)}</span>
          </div>
          <div class="bc-msg">${escapeHtml(b.message)}</div>
          <div class="bc-foot">${dt}${exp ? ` · ${exp}` : ""}</div>
        </div>
        ${isManager ? `<div class="bc-actions">
          <button class="btn btn-ghost btn-sm" data-on-click="toggleBroadcastPin('${b.id}',${!b.pinned})">${b.pinned ? "Unpin" : "📌 Pin"}</button>
          <button class="btn btn-ghost btn-sm btn-icon" data-on-click="deleteBroadcastMsg('${b.id}')" title="Delete">✕</button>
        </div>` : ""}
      </div>`;
    };
    const pinned = list.filter(b => b.pinned), rest = list.filter(b => !b.pinned);
    bWrap.innerHTML =
      (pinned.length ? `<div class="bc-sec">Pinned</div>${pinned.map(card).join("")}` : "") +
      (rest.length ? `<div class="bc-sec">${pinned.length ? "Recent" : "All notices"}</div>${rest.map(card).join("")}` : "");
  } catch(e) {
    bWrap.innerHTML = `<div class="empty">Error: ${escapeHtml(e.message)}</div>`;
  }
}

function deleteBroadcastMsg(id) {
  if (!requireManager("deleteBroadcastMsg")) return;
  showConfirm({ title: "Delete this notice?", body: "It disappears from every member's dashboard.", confirmLabel: "Delete", danger: true,
    onConfirm: async () => {
      try { await getClient().from("broadcasts").delete().eq("id", id).eq("mess_id", messId()); toast("Notice deleted", "success"); await loadMessagesPage(true); }
      catch(e) { toast("Error: " + e.message, "error"); }
    } });
}
async function toggleBroadcastPin(id, pinned) {
  if (!requireManager("toggleBroadcastPin")) return;
  try { await getClient().from("broadcasts").update({ pinned }).eq("id", id).eq("mess_id", messId()); toast(pinned ? "📌 Pinned" : "Unpinned", "success"); await loadMessagesPage(true); }
  catch(e) { toast("Error: " + e.message, "error"); }
}
