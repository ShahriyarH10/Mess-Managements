/* ═══════════════════════════════════════════════
   MANAGER — Members: manage members, transfer role, settings
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   TRANSFER ROLE
═══════════════════════════════════════════ */
async function renderTransferRole(el) {
  const others=members.filter(m=>m.id!==currentUser.memberId);
  el.innerHTML=`
  <div class="topbar"><div><div class="page-title">Transfer Manager Role</div><div class="page-sub">Hand over management to another member.</div></div></div>
  <div class="content"><div class="card" style="max-width:520px;margin:0 auto">
    <div style="background:var(--accent-bg);border:1px solid rgba(212,168,83,.25);border-radius:var(--radius-sm);padding:14px 16px;margin-bottom:20px;font-size:13px;color:var(--accent)">⚠️ Once you transfer the role, you will lose manager access immediately.</div>
    <div class="card-title">Transfer to</div>
    ${others.length===0?`<div class="empty">No other members to transfer to.</div>`:`
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px" id="transfer-list">
      ${others.map(m=>{ const col=avatarCol(members.indexOf(m)); return`<label style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg3);border:2px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:border-color .15s" class="transfer-option">
        <input type="radio" name="transfer-target" value="${m.id}" style="accent-color:var(--accent)"/>
        <div class="avatar" style="background:${col.bg};color:${col.fg}">${initials(m.name)}</div>
        <div><div style="font-weight:600">${m.name}</div><div style="font-size:12px;color:var(--text3)">@${m.username}</div></div>
      </label>`; }).join("")}
    </div>
    <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="doTransferRole()">👑 Transfer manager role</button>`}
  </div></div>`;
  el.querySelectorAll(".transfer-option").forEach(label=>{ label.querySelector("input").addEventListener("change",()=>{ el.querySelectorAll(".transfer-option").forEach(l=>l.style.borderColor="var(--border)"); label.style.borderColor="var(--accent)"; }); });
}

async function doTransferRole() {
  const selected=document.querySelector('input[name="transfer-target"]:checked');
  if(!selected){ toast("Select a member to transfer to"); return; }
  const target=members.find(m=>m.id===selected.value); if(!target) return;
  if(!confirm(`Transfer manager role to ${target.name}?`)) return;
  try {
    const {error:e1}=await sb.from("members").update({role:"member"}).eq("id",currentUser.memberId); if(e1) throw e1;
    const {error:e2}=await sb.from("members").update({role:"manager"}).eq("id",target.id); if(e2) throw e2;
    toast(`${target.name} is now the manager!`,"success");
    currentUser.role="member"; saveSession(currentUser,currentMess);
    members=await dbGetMembers(); buildNav(); updateSidebarUser(); navigate("my-dashboard");
  } catch(e){ toast("Transfer failed: "+e.message,"error"); }
}

/* ═══════════════════════════════════════════
   MEMBERS MANAGEMENT
═══════════════════════════════════════════ */
function renderMembers(el) {
  el.innerHTML=`<div class="topbar"><div><div class="page-title">Members</div><div class="page-sub">Manage accounts & credentials</div></div><div class="topbar-actions"><button class="btn btn-primary" onclick="openAddMemberModal()">+ Add member</button></div></div>
  <div class="content">
    <div class="info-banner"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>Members sign in using their username & password. The 👑 crown marks the current manager.</div>
    <div class="card"><div class="card-title">Members (${members.length})</div><div class="tbl-wrap" id="mem-table"></div></div>
  </div>`;
  renderMembersTable();
}

function renderMembersTable() {
  const wrap=document.getElementById("mem-table"); if(!wrap) return;
  if(!members.length){ wrap.innerHTML='<div class="empty">No members yet. Click + Add member.</div>'; return; }
  wrap.innerHTML=`<table><thead><tr><th>#</th><th>Name</th><th>Username</th><th>Role</th><th>Room</th><th>Phone</th><th></th></tr></thead>
  <tbody>${members.map((m,i)=>{ const col=avatarCol(i); const isMgr=m.role==="manager"; return`<tr>
    <td><div class="avatar" style="background:${col.bg};color:${col.fg};width:26px;height:26px;font-size:10px">${initials(m.name)}</div></td>
    <td><b>${m.name}</b></td>
    <td style="font-family:monospace;color:var(--text3)">@${m.username}</td>
    <td>${isMgr?`<span class="badge badge-amber">👑 Manager</span>`:`<span class="badge badge-blue">Member</span>`}</td>
    <td>${m.room||"—"}</td>
    <td style="color:var(--text2)">${m.phone||"—"}</td>
    <td><div style="display:flex;gap:4px">
      <button class="btn btn-ghost btn-sm" onclick="openEditMemberModal('${m.id}')">Edit</button>
      ${isMgr?`<button class="btn btn-ghost btn-sm" disabled style="opacity:.4">Remove</button>`:`<button class="btn btn-danger btn-sm" onclick="deleteMember('${m.id}')">Remove</button>`}
    </div></td>
  </tr>`; }).join("")}</tbody></table>`;
}

function memberModalHTML(m) {
  return `
  <div class="field"><label>Full name *</label><input type="text" class="input" id="mm-name" value="${m?.name||""}" placeholder="e.g. Rakib Hasan"/></div>
  <div class="grid-2">
    <div class="field"><label>Username *</label><input type="text" class="input" id="mm-user" value="${m?.username||""}" placeholder="e.g. rakib"/></div>
    <div class="field"><label>Password *</label><input type="text" class="input" id="mm-pass" value="${m?.password||""}" placeholder="min 4 chars"/></div>
  </div>
  <div class="field"><label>Room</label><input type="text" class="input" id="mm-room" value="${m?.room||""}" placeholder="Room 3A"/></div>
  <div class="grid-2">
    <div class="field"><label>Phone</label><input type="text" class="input" id="mm-phone" value="${m?.phone||""}" placeholder="017xxxxxxxx"/></div>
    <div class="field"><label>Joined date</label><input type="date" class="input" id="mm-joined" value="${m?.joined||""}"/></div>
  </div>`;
}

function openAddMemberModal() {
  document.getElementById("modal-content").innerHTML=`<div class="modal-title">Add member</div><div class="modal-sub">Create account for a new roommate</div>${memberModalHTML(null)}<div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="addMember()">Add member</button></div>`;
  openModal();
}
function openEditMemberModal(id) {
  const m=members.find(x=>x.id===id); if(!m) return;
  document.getElementById("modal-content").innerHTML=`<div class="modal-title">Edit ${m.name}</div><div class="modal-sub">Update account details</div>${memberModalHTML(m)}<div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="updateMember('${id}')">Save changes</button></div>`;
  openModal();
}
function getMemberFormData(existingRole) {
  return {
    name:     cleanText(document.getElementById("mm-name")?.value),
    username: cleanText(document.getElementById("mm-user")?.value),
    password: document.getElementById("mm-pass")?.value||"",
    role:     existingRole||"member",
    room:     cleanText(document.getElementById("mm-room")?.value),
    phone:    cleanText(document.getElementById("mm-phone")?.value),
    joined:   document.getElementById("mm-joined")?.value||null,
  };
}
async function addMember() {
  const d=getMemberFormData("member");
  if(!d.name){ toast("Name required"); return; }
  if(!d.username){ toast("Username required"); return; }
  if(!d.password){ toast("Password required"); return; }
  if(members.find(m=>m.username===d.username)){ toast("Username taken"); return; }
  try{ await dbSaveMember(d); members=await dbGetMembers(); closeModal(); toast(d.name+" added","success"); renderMembersTable(); }catch(e){ toast("Error: "+e.message,"error"); }
}
async function updateMember(id) {
  const existing=members.find(m=>m.id===id);
  const d={...getMemberFormData(existing?.role||"member"),id};
  if(members.find(m=>m.username===d.username&&m.id!==id)){ toast("Username taken"); return; }
  try{ await dbSaveMember(d); members=await dbGetMembers(); closeModal(); toast("Updated","success"); renderMembersTable(); }catch(e){ toast("Error: "+e.message,"error"); }
}
async function deleteMember(id) {
  const m=members.find(x=>x.id===id); if(!m) return;
  if(!confirm(`Remove ${m.name}?`)) return;
  try{ await dbDeleteMember(id); members=await dbGetMembers(); toast(m.name+" removed"); renderMembersTable(); }catch(e){ toast("Error","error"); }
}

