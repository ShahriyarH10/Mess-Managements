/* MANAGER — Announcements & Chores */

/* ── ANNOUNCEMENTS ── */
async function renderAnnouncements(el, isAdmin) {
  if (!isAdmin && currentUser.memberId) {
    localStorage.setItem(`mm_announce_read_${currentUser.memberId}`, new Date().toISOString());
    refreshMemberAnnounceBadge();
  }
  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">Announcements</div><div class="page-sub">Mess-wide notices &amp; updates</div></div>
    ${isAdmin ? `<div class="topbar-actions"><button class="btn btn-primary btn-sm" onclick="openAnnounceModal()">+ Post notice</button></div>` : ""}
  </div>
  <div class="content">
    <div id="announce-list"><div class="loading"><div class="spinner"></div>Loading...</div></div>
  </div>`;
  await loadAnnouncements(isAdmin);
}

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

function _authorInitials(name) {
  return (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

async function loadAnnouncements(isAdmin) {
  const list = document.getElementById("announce-list");
  if (!list) return;
  try {
    const { data, error } = await getClient().from("announcements").select("*").eq("mess_id", messId())
      .order("pinned", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;
    const items = data || [];

    if (!items.length) {
      list.innerHTML = `
        <div style="text-align:center;padding:56px 24px;color:var(--text3)">
          <div style="font-size:44px;margin-bottom:14px">📢</div>
          <div style="font-size:15px;font-weight:700;color:var(--text2);margin-bottom:6px">No announcements yet</div>
          <div style="font-size:13px">Post a notice and all members will see it here.</div>
        </div>`;
      return;
    }

    const pinned  = items.filter(a => a.pinned);
    const regular = items.filter(a => !a.pinned);

    const renderCard = (a) => {
      const initials = _authorInitials(a.author);
      const rel      = _relativeTime(a.created_at);
      const fullDate = new Date(a.created_at).toLocaleString("en-IN", {
        day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true
      });
      return `
        <div class="ac${a.pinned ? " ac-pin" : ""}">
          ${a.pinned ? `<div class="ac-pin-bar"><span class="ac-pin-badge">&#128204; Pinned</span></div>` : ""}
          <div class="ac-body">
            <div class="ac-avatar">${initials}</div>
            <div class="ac-main">
              <div class="ac-title-row">
                <div class="ac-title">${escapeHtml(a.title)}</div>
                ${isAdmin ? `<button class="btn btn-ghost btn-sm btn-icon ac-del" title="Delete" onclick="deleteAnnounce('${a.id}')">&#x2715;</button>` : ""}
              </div>
              <div class="ac-text">${escapeHtml(a.body)}</div>
              <div class="ac-meta">
                <span class="ac-author">${escapeHtml(a.author)}</span>
                <span class="ac-dot">&middot;</span>
                <span class="ac-time" title="${fullDate}">${rel}</span>
              </div>
            </div>
          </div>
        </div>`;
    };

    let html = `
    <style>
      .ac{background:var(--bg);border:0.5px solid var(--border);border-radius:12px;margin-bottom:10px;overflow:hidden;transition:border-color .15s,box-shadow .15s;}
      .ac:hover{border-color:var(--border2);box-shadow:0 2px 14px rgba(0,0,0,.06);}
      .ac-pin{border-color:var(--accent,#b8914a);background:var(--accent-bg,rgba(184,145,74,.05));}
      .ac-pin:hover{border-color:var(--accent,#b8914a);}
      .ac-pin-bar{display:flex;align-items:center;padding:6px 16px;border-bottom:0.5px solid var(--border);background:var(--accent-bg,rgba(184,145,74,.08));}
      .ac-pin-badge{font-size:11px;font-weight:700;color:var(--accent,#b8914a);letter-spacing:.3px;}
      .ac-body{display:flex;gap:14px;padding:16px 18px;}
      .ac-avatar{flex-shrink:0;width:42px;height:42px;border-radius:50%;background:var(--bg3);color:var(--text2);font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;letter-spacing:.5px;border:0.5px solid var(--border);}
      .ac-pin .ac-avatar{background:var(--accent-bg,rgba(184,145,74,.15));color:var(--accent,#b8914a);border-color:var(--accent,#b8914a);}
      .ac-main{flex:1;min-width:0;}
      .ac-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;}
      .ac-title{font-size:15px;font-weight:700;color:var(--text);line-height:1.35;word-break:break-word;}
      .ac-del{opacity:0;transition:opacity .15s;flex-shrink:0;}
      .ac:hover .ac-del{opacity:1;}
      .ac-text{font-size:13px;color:var(--text2);line-height:1.65;word-break:break-word;white-space:pre-wrap;margin-bottom:10px;}
      .ac-meta{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text3);}
      .ac-author{font-weight:600;color:var(--text3);}
      .ac-dot{opacity:.4;}
      .ac-time{cursor:default;}
      .ac-section{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:var(--text3);margin:0 0 8px 2px;}
    </style>`;

    if (pinned.length) {
      html += `<div class="ac-section">&#128204; Pinned</div>` + pinned.map(renderCard).join("");
    }
    if (regular.length) {
      if (pinned.length) html += `<div class="ac-section" style="margin-top:22px">Recent</div>`;
      html += regular.map(renderCard).join("");
    }

    list.innerHTML = html;
  } catch(e) {
    list.innerHTML = `<div class="empty">Error loading announcements: ${e.message}</div>`;
  }
}

function openAnnounceModal() {
  document.getElementById("modal-content").innerHTML = `
    <div class="modal-title">Post announcement</div>
    <div class="modal-sub">Visible to all members of your mess</div>
    <div class="field"><label>Title *</label><input type="text" class="input" id="an-title" placeholder="e.g. Rent due reminder"/></div>
    <div class="field"><label>Message *</label><textarea class="input" id="an-body" rows="4" placeholder="Write your message here..." style="height:auto;resize:vertical"></textarea></div>
    <div class="field"><label><input type="checkbox" id="an-pin" style="margin-right:6px"/>Pin this announcement</label></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="postAnnounce()">Post</button>
    </div>`;
  openModal();
}

async function postAnnounce() {
  if (!requireManager('postAnnounce')) return;
  const title  = cleanText(document.getElementById("an-title")?.value);
  const body   = cleanText(document.getElementById("an-body")?.value);
  const pinned = document.getElementById("an-pin")?.checked || false;
  if (!title || !body) { toast("Title and message required"); return; }
  try {
    await dbSaveAnnouncement({ title, body, pinned });
    localStorage.setItem(`mm_announce_read_${currentUser.memberId}`, new Date().toISOString());
    closeModal();
    toast("Posted — members will be notified", "success");
    navigate("announce");
  } catch(e) { toast("Error: " + e.message, "error"); }
}

async function deleteAnnounce(id) {
  if (!requireManager('deleteAnnounce')) return;
  showConfirm({ title: "Delete announcement?", body: "This announcement will be permanently removed.", confirmLabel: "Delete", danger: true, onConfirm: async () => { try{ await dbDeleteAnnouncement(id); toast("Deleted"); navigate("announce"); }catch(e){ toast("Error","error"); } } }); return;
  try { await dbDeleteAnnouncement(id); toast("Deleted"); navigate("announce"); }
  catch(e) { toast("Error", "error"); }
}

/* ── CHORES ── */
async function renderChores(el,isAdmin) {
  el.innerHTML=`<div class="topbar"><div><div class="page-title">Chore Roster</div><div class="page-sub">Assign &amp; track cleaning duties</div></div>${isAdmin?`<div class="topbar-actions"><button class="btn btn-primary btn-sm" onclick="openChoreModal()">+ Add chore</button></div>`:""}</div>
  <div class="content"><div class="card"><div class="card-title">Current duties</div><div id="chores-list"><div class="loading"><div class="spinner"></div>Loading...</div></div></div></div>`;
  await loadChores(isAdmin);
}
async function loadChores(isAdmin) {
  const items=await dbGetChores();
  const list=document.getElementById("chores-list"); if(!list) return;
  if(!items.length){ list.innerHTML='<div class="empty">No chores assigned yet.</div>'; return; }
  list.innerHTML=items.map(c=>{
    const sc=c.status==="done"?"badge-green":c.status==="inprogress"?"badge-amber":"badge-red";
    return`<div class="chore-row">
      <div class="chore-task">${c.task}</div>
      <div class="chore-assignee">${c.assignee||"—"}</div>
      <span class="badge ${sc}" style="font-size:10px">${{done:"Done",inprogress:"In progress",pending:"Pending"}[c.status]||c.status}</span>
      <span class="badge badge-blue" style="font-size:10px">${c.frequency||"daily"}</span>
      ${isAdmin?`<div style="display:flex;gap:4px"><button class="btn btn-ghost btn-sm btn-icon" onclick="openEditChoreModal('${c.id}')">&#9999;</button><button class="btn btn-ghost btn-sm btn-icon" onclick="deleteChore('${c.id}')">&#x2715;</button></div>`:""}
    </div>`;
  }).join("");
}
function openChoreModal(id,existing) {
  document.getElementById("modal-content").innerHTML=`
    <div class="modal-title">${existing?"Edit chore":"Add chore"}</div>
    <div class="field"><label>Task *</label><input type="text" class="input" id="ch-task" placeholder="e.g. Clean kitchen" value="${existing?.task||""}"/></div>
    <div class="field"><label>Assign to</label><select class="input" id="ch-assignee"><option value="">— Unassigned —</option>${members.map(m=>`<option value="${m.name}"${existing?.assignee===m.name?" selected":""}>${m.name}</option>`).join("")}</select></div>
    <div class="field"><label>Frequency</label><select class="input" id="ch-freq"><option value="daily"${existing?.frequency==="daily"?" selected":""}>Daily</option><option value="weekly"${existing?.frequency==="weekly"?" selected":""}>Weekly</option><option value="monthly"${existing?.frequency==="monthly"?" selected":""}>Monthly</option></select></div>
    <div class="field"><label>Status</label><select class="input" id="ch-status"><option value="pending"${existing?.status==="pending"?" selected":""}>Pending</option><option value="inprogress"${existing?.status==="inprogress"?" selected":""}>In progress</option><option value="done"${existing?.status==="done"?" selected":""}>Done</option></select></div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveChore('${id||""}')">${existing?"Save":"Add chore"}</button></div>`;
  openModal();
}
function openEditChoreModal(id) { dbGetChores().then(items=>{ const c=items.find(x=>x.id===id); if(c) openChoreModal(id,c); }); }
async function saveChore(id) {
  if (!requireManager('saveChore')) return;
  const task=cleanText(document.getElementById("ch-task")?.value); if(!task){ toast("Task is required"); return; }
  const row={id:id||undefined,task,assignee:document.getElementById("ch-assignee")?.value||"",frequency:document.getElementById("ch-freq")?.value||"daily",status:document.getElementById("ch-status")?.value||"pending"};
  try{ await dbSaveChore(row); closeModal(); toast("Saved","success"); navigate("chores"); }catch(e){ toast("Error: "+e.message,"error"); }
}
async function deleteChore(id) { if (!requireManager("deleteChore")) return; showConfirm({ title: "Delete chore?", body: "This chore assignment will be removed.", confirmLabel: "Delete", danger: true, onConfirm: async () => { try{ await dbDeleteChore(id); toast("Deleted"); navigate("chores"); }catch(e){ toast("Error","error"); } } }); }

/* ═══════════════════════════════════════════════
   MESSAGES — merged Announcements + Broadcasts
   Manager: post both. Member: read-only feed.
═══════════════════════════════════════════════ */

async function renderMessages(el, isManager) {
  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Messages</div>
      <div class="page-sub">${isManager ? "Post broadcasts to all members" : "Broadcasts from your manager"}</div>
    </div>
    ${isManager ? `
    <div class="topbar-actions">
      <button class="btn btn-primary btn-sm" onclick="openBroadcastModal()">📢 Broadcast</button>
    </div>` : ""}
  </div>
  <div class="content">
    <div id="msg-broadcasts-wrap"><div class="loading"><div class="spinner"></div>Loading…</div></div>
  </div>`;

  if (!isManager && currentUser.memberId) {
    localStorage.setItem(`mm_announce_read_${currentUser.memberId}`, new Date().toISOString());
    refreshMemberAnnounceBadge?.();
  }

  await loadMessagesPage(isManager);
}

async function loadMessagesPage(isManager) {
  const bWrap = document.getElementById("msg-broadcasts-wrap");
  if (!bWrap) return;

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
      bWrap.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text3)">
        <div style="font-size:40px;margin-bottom:12px">📢</div>
        <div style="font-size:14px">${isManager ? "No broadcasts yet — click 📢 Broadcast to post one." : "No broadcasts from your manager yet."}</div>
      </div>`;
      return;
    }

    bWrap.innerHTML = list.map(b => {
      const isUrgent  = b.priority === "urgent";
      const isPinned  = b.pinned;
      const isExpired = b.expires_at && new Date(b.expires_at) < now;
      const dt = new Date(b.created_at).toLocaleString("en-IN", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit", hour12:true });
      return `<div style="
          background:${isUrgent ? "var(--red-bg)" : isPinned ? "var(--accent-bg)" : "var(--bg2)"};
          border:1.5px solid ${isUrgent ? "rgba(224,82,82,.3)" : isPinned ? "rgba(212,168,83,.3)" : "var(--border)"};
          border-radius:var(--radius);
          padding:14px 16px;
          margin-bottom:10px;
          opacity:${isExpired ? 0.5 : 1};
          transition:border-color .2s;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
              <span style="font-size:16px">${isPinned ? "📌" : isUrgent ? "🔴" : "📢"}</span>
              ${isPinned  ? '<span style="font-size:10px;background:var(--accent);color:#000;padding:2px 7px;border-radius:99px;font-weight:800">PINNED</span>'  : ""}
              ${isUrgent  ? '<span style="font-size:10px;background:var(--red);color:#fff;padding:2px 7px;border-radius:99px;font-weight:800">URGENT</span>'   : ""}
              ${isExpired ? '<span style="font-size:10px;color:var(--text3);border:1px solid var(--border);padding:2px 7px;border-radius:99px">EXPIRED</span>' : ""}
            </div>
            <div style="font-size:14px;color:var(--text);line-height:1.6">${escapeHtml(b.message)}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:6px">${escapeHtml(b.author || "")} · ${dt}</div>
          </div>
          ${isManager ? `<div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn btn-ghost btn-sm" onclick="toggleBroadcastPin('${b.id}',${!isPinned})" title="${isPinned ? "Unpin" : "Pin"}">${isPinned ? "📌" : "📍"}</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteBroadcastMsg('${b.id}')">✕</button>
          </div>` : ""}
        </div>
      </div>`;
    }).join("");
  } catch(e) {
    bWrap.innerHTML = `<div class="empty">Error: ${escapeHtml(e.message)}</div>`;
  }
}

async function deleteBroadcastMsg(id) {
  try { await getClient().from("broadcasts").delete().eq("id", id); toast("Broadcast removed"); await loadMessagesPage(true); }
  catch(e) { toast("Error: " + e.message, "error"); }
}
async function toggleBroadcastPin(id, pinned) {
  try { await getClient().from("broadcasts").update({ pinned }).eq("id", id); toast(pinned ? "📌 Pinned" : "Unpinned", "success"); await loadMessagesPage(true); }
  catch(e) { toast("Error: " + e.message, "error"); }
}
