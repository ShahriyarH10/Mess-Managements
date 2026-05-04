/* ═══════════════════════════════════════════════
   MANAGER — Announcements: post, load, delete notices
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   ANNOUNCEMENTS
═══════════════════════════════════════════ */
async function renderAnnouncements(el, isAdmin) {
  if (!isAdmin && currentUser.memberId) {
    localStorage.setItem(`mm_announce_read_${currentUser.memberId}`, new Date().toISOString());
    refreshMemberAnnounceBadge();
  }
  el.innerHTML=`
  <div class="topbar">
    <div><div class="page-title">Announcements</div><div class="page-sub">Mess-wide notices & updates</div></div>
    ${isAdmin?`<div class="topbar-actions"><button class="btn btn-primary btn-sm" onclick="openAnnounceModal()">+ Post notice</button></div>`:""}
  </div>
  <div class="content"><div id="announce-list"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>`;
  await loadAnnouncements(isAdmin);
}

async function loadAnnouncements(isAdmin) {
  const list=document.getElementById("announce-list"); if(!list) return;
  try {
    const {data,error}=await sb.from("announcements").select("*").eq("mess_id",messId())
      .order("pinned",{ascending:false}).order("created_at",{ascending:false});
    if(error) throw error;
    const items=data||[];
    if(!items.length){ list.innerHTML='<div class="empty">No announcements yet.</div>'; return; }
    list.innerHTML=items.map(a=>`
      <div class="announce-item">
        <div class="announce-item-header">
          <div class="announce-item-title">${a.pinned?'<span class="announce-pin">📌 </span>':""}${escapeHtml(a.title)}</div>
          <div style="display:flex;gap:6px;align-items:center">
            <div class="announce-item-meta">${escapeHtml(a.author)} · ${new Date(a.created_at).toLocaleDateString()}</div>
            ${isAdmin?`<button class="btn btn-ghost btn-sm btn-icon" onclick="deleteAnnounce('${a.id}')">✕</button>`:""}
          </div>
        </div>
        <div class="announce-item-body">${escapeHtml(a.body)}</div>
      </div>`).join("");
  } catch(e) {
    list.innerHTML=`<div class="empty">Error loading announcements: ${e.message}</div>`;
  }
}

function openAnnounceModal() {
  document.getElementById("modal-content").innerHTML=`
    <div class="modal-title">Post announcement</div>
    <div class="modal-sub">Visible to all members of your mess</div>
    <div class="field"><label>Title *</label><input type="text" class="input" id="an-title" placeholder="e.g. Rent due reminder"/></div>
    <div class="field"><label>Message *</label><textarea class="input" id="an-body" rows="4" placeholder="Write your message here…" style="height:auto;resize:vertical"></textarea></div>
    <div class="field"><label><input type="checkbox" id="an-pin" style="margin-right:6px"/>Pin this announcement</label></div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="postAnnounce()">Post</button></div>`;
  openModal();
}

async function postAnnounce() {
  const title=cleanText(document.getElementById("an-title")?.value);
  const body=cleanText(document.getElementById("an-body")?.value);
  const pinned=document.getElementById("an-pin")?.checked||false;
  if(!title||!body){ toast("Title and message required"); return; }
  try {
    await dbSaveAnnouncement({title,body,pinned});
    // Mark as already read for the manager who posted it
    localStorage.setItem(`mm_announce_read_${currentUser.memberId}`, new Date().toISOString());
    closeModal();
    toast("Posted — members will be notified 📢","success");
    navigate("announce");
  } catch(e){ toast("Error: "+e.message,"error"); }
}

async function deleteAnnounce(id) {
  if(!confirm("Delete?")) return;
  try{ await dbDeleteAnnouncement(id); toast("Deleted"); navigate("announce"); }catch(e){ toast("Error","error"); }
}

/* ═══════════════════════════════════════════
   CHORES
═══════════════════════════════════════════ */
async function renderChores(el,isAdmin) {
  el.innerHTML=`<div class="topbar"><div><div class="page-title">Chore Roster</div><div class="page-sub">Assign & track cleaning duties</div></div>${isAdmin?`<div class="topbar-actions"><button class="btn btn-primary btn-sm" onclick="openChoreModal()">+ Add chore</button></div>`:""}</div>
  <div class="content"><div class="card"><div class="card-title">Current duties</div><div id="chores-list"><div class="loading"><div class="spinner"></div>Loading…</div></div></div></div>`;
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
      ${isAdmin?`<div style="display:flex;gap:4px"><button class="btn btn-ghost btn-sm btn-icon" onclick="openEditChoreModal('${c.id}')">✏️</button><button class="btn btn-ghost btn-sm btn-icon" onclick="deleteChore('${c.id}')">✕</button></div>`:""}
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
  const task=cleanText(document.getElementById("ch-task")?.value); if(!task){ toast("Task is required"); return; }
  const row={id:id||undefined,task,assignee:document.getElementById("ch-assignee")?.value||"",frequency:document.getElementById("ch-freq")?.value||"daily",status:document.getElementById("ch-status")?.value||"pending"};
  try{ await dbSaveChore(row); closeModal(); toast("Saved","success"); navigate("chores"); }catch(e){ toast("Error: "+e.message,"error"); }
}
async function deleteChore(id) { if(!confirm("Delete?")) return; try{ await dbDeleteChore(id); toast("Deleted"); navigate("chores"); }catch(e){ toast("Error","error"); } }
