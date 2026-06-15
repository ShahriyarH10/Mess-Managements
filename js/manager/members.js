/* ═══════════════════════════════════════════════
   MANAGER — Members: tabbed (Members | Roles | Transfer)
   ═══════════════════════════════════════════════ */

function renderMembers(el) {
  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">Members</div><div class="page-sub">Manage accounts, roles, and transfers</div></div>
    <div class="topbar-actions">
      <div style="display:flex;gap:0;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden">
        <button id="mem-tab-members" onclick="switchMembersTab('members')"
          style="padding:6px 16px;font-size:12px;font-weight:600;border:none;cursor:pointer;transition:all .15s;background:var(--accent);color:#0f0f0f">
          👥 Members
        </button>
        <button id="mem-tab-roles" onclick="switchMembersTab('roles')"
          style="padding:6px 16px;font-size:12px;font-weight:600;border:none;cursor:pointer;transition:all .15s;background:transparent;color:var(--text2)">
          ⚡ Roles
        </button>
        <button id="mem-tab-transfer" onclick="switchMembersTab('transfer')"
          style="padding:6px 16px;font-size:12px;font-weight:600;border:none;cursor:pointer;transition:all .15s;background:transparent;color:var(--text2)">
          👑 Transfer
        </button>
      </div>
      <button class="btn btn-primary btn-sm" id="mem-add-btn" onclick="openAddMemberModal()">+ Add member</button>
    </div>
  </div>
  <div class="content">
    <!-- Members tab -->
    <div id="mem-pane-members">
      <div class="info-banner"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>Members sign in with their username & password. 👑 = current manager.</div>
      <div class="card"><div class="card-title">Members (${members.length})</div><div class="tbl-wrap" id="mem-table"></div></div>
    </div>
    <!-- Roles tab -->
    <div id="mem-pane-roles" style="display:none">
      <div class="card" style="margin-bottom:14px">
        <div class="card-title">Role Permissions</div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Permission</th><th>Manager</th><th>Sub-manager</th><th>Member</th></tr></thead>
          <tbody>
            ${[
              ["Enter meals & bazar",      "✅","✅","❌"],
              ["Enter rent & utility",      "✅","✅","❌"],
              ["View all member profiles",  "✅","✅","❌"],
              ["Post messages",             "✅","✅","❌"],
              ["Collect payment",           "✅","✅","❌"],
              ["Add / remove members",      "✅","❌","❌"],
              ["Change member passwords",   "✅","❌","❌"],
              ["Transfer manager role",     "✅","❌","❌"],
              ["Promote sub-managers",      "✅","❌","❌"],
            ].map(([perm, mgr, sub, mem]) =>
              `<tr><td>${perm}</td><td style="color:var(--green)">${mgr}</td><td style="color:var(--blue)">${sub}</td><td style="color:var(--text3)">${mem}</td></tr>`
            ).join("")}
          </tbody>
        </table></div>
      </div>
      <div class="card" id="roles-member-list">
        <div class="card-title">Manage roles</div>
        <div class="empty">Loading…</div>
      </div>
    </div>
    <!-- Transfer tab -->
    <div id="mem-pane-transfer" style="display:none">
      <div class="card" style="max-width:520px">
        <div style="background:var(--red-bg);border:1px solid rgba(224,82,82,.25);border-radius:var(--radius-sm);padding:14px 16px;margin-bottom:20px;font-size:13px;color:var(--red)">⚠️ Once you transfer the role, you will lose manager access immediately.</div>
        <div class="card-title">Transfer manager role to</div>
        <div id="transfer-list-inner" style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px"></div>
        <button class="btn btn-danger" style="width:100%;justify-content:center" onclick="doTransferRole()">👑 Transfer manager role</button>
      </div>
    </div>
  </div>`;

  renderMembersTable();
  _renderTransferList();
  renderRolesList();
}

function switchMembersTab(tab) {
  ['members','roles','transfer'].forEach(t => {
    document.getElementById('mem-pane-' + t).style.display = t === tab ? '' : 'none';
    const btn = document.getElementById('mem-tab-' + t);
    if (btn) {
      btn.style.background = t === tab ? 'var(--accent)' : 'transparent';
      btn.style.color = t === tab ? '#0f0f0f' : 'var(--text2)';
    }
  });
  const addBtn = document.getElementById('mem-add-btn');
  if (addBtn) addBtn.style.display = tab === 'members' ? '' : 'none';
}

function renderMembersTable() {
  const wrap = document.getElementById("mem-table"); if (!wrap) return;
  if (!members.length) { wrap.innerHTML = '<div class="empty">No members yet. Click + Add member.</div>'; return; }
  wrap.innerHTML = `<table><thead><tr><th>#</th><th>Name</th><th>Username</th><th>Role</th><th>Room</th><th>Phone</th><th></th></tr></thead>
  <tbody>${members.map((m, i) => {
    const col = avatarCol(i); const isMgr = m.role === "manager";
    return `<tr>
      <td><div class="avatar" style="background:${col.bg};color:${col.fg};width:26px;height:26px;font-size:10px">${memberInitials(m.id, m.name)}</div></td>
      <td><b>${m.name}</b></td>
      <td style="font-family:monospace;color:var(--text3)">@${m.username}</td>
      <td>${isMgr ? `<span class="badge badge-amber">👑 Manager</span>` : m.role === 'sub_manager' ? `<span class="badge badge-blue">⚡ Sub</span>` : `<span class="badge">Member</span>`}</td>
      <td>${m.room || "—"}</td>
      <td style="color:var(--text2)">${m.phone || "—"}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" onclick="openEditMemberModal('${m.id}')">Edit</button>
        <button class="btn btn-ghost btn-sm" data-mid="${m.id}" onclick="openManagerResetPasswordModal(this.dataset.mid)" title="Reset password">🔑</button>
        ${isMgr ? `<button class="btn btn-ghost btn-sm" disabled style="opacity:.4">Remove</button>` : `<button class="btn btn-danger btn-sm" onclick="openLeavingFlow('${m.id}')">Remove</button>`}
      </div></td>
    </tr>`;
  }).join("")}</tbody></table>`;
}

/* ── Roles tab ── */
function renderRolesList() {
  const wrap = document.getElementById("roles-member-list");
  if (!wrap) return;
  const others = members.filter(m => m.id !== currentUser.memberId);
  wrap.innerHTML = `<div class="card-title">Members</div>` + (others.length ? others.map(m => {
    const col = avatarCol(members.indexOf(m));
    const isSubMgr = m.role === "sub_manager";
    const isMgr = m.role === "manager";
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div class="avatar" style="background:${col.bg};color:${col.fg};width:34px;height:34px;font-size:11px;flex-shrink:0">${memberInitials(m.id, m.name)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600">${escapeHtml(m.name)}</div>
        <div style="font-size:11px;color:var(--text3)">@${escapeHtml(m.username)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        ${isMgr ? `<span class="badge badge-amber">👑 Manager</span>` :
          isSubMgr ? `<span class="badge badge-blue">⚡ Sub-manager</span>
                      <button class="btn btn-ghost btn-sm" onclick="setSubManager('${m.id}', false)">Demote</button>` :
          `<span class="badge">Member</span>
           <button class="btn btn-ghost btn-sm" onclick="setSubManager('${m.id}', true)">Promote</button>`}
      </div>
    </div>`;
  }).join("") : '<div class="empty">No other members yet.</div>');
}

async function setSubManager(memberId, promote) {
  if (!requireManager("setSubManager")) return;
  const m = members.find(x => x.id === memberId); if (!m) return;
  showConfirm({
    title: promote ? `Promote ${m.name} to sub-manager?` : `Demote ${m.name}?`,
    body: promote
      ? `${m.name} will be able to enter meals, bazar, utility, and collect payments.`
      : `${m.name} will become a regular member.`,
    confirmLabel: promote ? "Promote" : "Demote",
    danger: false,
    onConfirm: async () => {
      try {
        await getClient().from("members").update({ role: promote ? "sub_manager" : "member" }).eq("id", memberId);
        await logAudit("update", "member", m.name, `${m.name} ${promote ? "promoted to sub-manager" : "demoted to member"}`);
        toast(promote ? `${m.name} promoted ✓` : `${m.name} demoted ✓`, "success");
        members = await dbGetMembers(); buildInitialsMap(members);
        renderRolesList(); renderMembersTable();
      } catch(e) { toast("Error: " + e.message, "error"); }
    }
  });
}

/* ── Transfer tab ── */
function _renderTransferList() {
  const wrap = document.getElementById("transfer-list-inner"); if (!wrap) return;
  const others = members.filter(m => m.id !== currentUser.memberId);
  if (!others.length) { wrap.innerHTML = '<div class="empty">No other members to transfer to.</div>'; return; }
  wrap.innerHTML = others.map(m => {
    const col = avatarCol(members.indexOf(m));
    return `<label style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg3);border:2px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:border-color .15s" class="transfer-option">
      <input type="radio" name="transfer-target" value="${m.id}" style="accent-color:var(--accent)"/>
      <div class="avatar" style="background:${col.bg};color:${col.fg}">${memberInitials(m.id, m.name)}</div>
      <div><div style="font-weight:600">${m.name}</div><div style="font-size:12px;color:var(--text3)">@${m.username}</div></div>
    </label>`;
  }).join("");
  document.querySelectorAll(".transfer-option").forEach(label => {
    label.querySelector("input").addEventListener("change", () => {
      document.querySelectorAll(".transfer-option").forEach(l => l.style.borderColor = "var(--border)");
      label.style.borderColor = "var(--accent)";
    });
  });
}

async function renderTransferRole(el) { renderMembers(el); switchMembersTab('transfer'); }

async function doTransferRole() {
  const selected = document.querySelector('input[name="transfer-target"]:checked');
  if (!selected) { toast("Select a member to transfer to"); return; }
  const target = members.find(m => m.id === selected.value); if (!target) return;
  showConfirm({
    title: 'Transfer manager role?',
    body: `Transfer management to ${escapeHtml(target.name)}? You will lose manager access immediately.`,
    confirmLabel: 'Transfer role',
    danger: true,
    onConfirm: async () => {
      try {
        const { error: e1 } = await getClient().from('members').update({ role: 'member' }).eq('id', currentUser.memberId); if (e1) throw e1;
        const { error: e2 } = await getClient().from('members').update({ role: 'manager' }).eq('id', target.id); if (e2) throw e2;
        toast(target.name + ' is now the manager!', 'success');
        currentUser.role = 'member'; saveSession(currentUser, currentMess);
        members = await dbGetMembers(); buildInitialsMap(members); buildNav(); updateSidebarUser(); navigate('my-dashboard');
      } catch(e) { toast('Transfer failed: ' + e.message, 'error'); }
    }
  });
}

/* ── Member form helpers ── */
function memberModalHTML(m) {
  return `
  <div class="field"><label>Full name *</label><input type="text" class="input" id="mm-name" value="${escapeHtml(m?.name||"")}" placeholder="e.g. Rakib Hasan"/></div>
  <div class="grid-2">
    <div class="field"><label>Username *</label><input type="text" class="input" id="mm-user" value="${escapeHtml(m?.username||"")}" placeholder="e.g. rakib"/></div>
    <div class="field"><label>Password ${m ? "(leave blank to keep)" : "*"}</label><input type="password" class="input" id="mm-pass" value="" placeholder="${m ? "Leave blank to keep" : "min 6 chars"}"/></div>
  </div>
  <div class="field"><label>Room</label><input type="text" class="input" id="mm-room" value="${escapeHtml(m?.room||"")}" placeholder="Room 3A"/></div>
  <div class="grid-2">
    <div class="field"><label>Phone</label><input type="text" class="input" id="mm-phone" value="${escapeHtml(m?.phone||"")}" placeholder="017xxxxxxxx"/></div>
    <div class="field"><label>Joined date</label><input type="date" class="input" id="mm-joined" value="${m?.joined||""}"/></div>
  </div>
  <div class="field"><label>Meal default — Day</label><input type="number" class="input" id="mm-meal-day" min="0" max="4" step="0.5" value="${m?.meal_default_day ?? 1}" placeholder="1"/></div>`;
}

function openAddMemberModal() {
  document.getElementById("modal-content").innerHTML = `<div class="modal-title">Add member</div><div class="modal-sub">Create account for a new roommate</div>${memberModalHTML(null)}<div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="addMember()">Add member</button></div>`;
  openModal();
}
function openEditMemberModal(id) {
  const m = members.find(x => x.id === id); if (!m) return;
  document.getElementById("modal-content").innerHTML = `<div class="modal-title">Edit ${escapeHtml(m.name)}</div><div class="modal-sub">Update account details</div>${memberModalHTML(m)}<div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="updateMember('${m.id}')">Save changes</button></div>`;
  openModal();
}
function getMemberFormData(existingRole) {
  return {
    name:     cleanText(document.getElementById("mm-name")?.value),
    username: cleanText(document.getElementById("mm-user")?.value),
    password: document.getElementById("mm-pass")?.value || "",
    role:     existingRole || "member",
    room:     cleanText(document.getElementById("mm-room")?.value),
    phone:    cleanText(document.getElementById("mm-phone")?.value),
    joined:   document.getElementById("mm-joined")?.value || null,
    meal_default_day: parseFloat(document.getElementById("mm-meal-day")?.value ?? 1),
  };
}
async function addMember() {
  if (!requireManager("addMember")) return;
  const d = getMemberFormData("member");
  if (!d.name) { toast("Name required"); return; }
  if (!d.username) { toast("Username required"); return; }
  if (!d.password) { toast("Password required"); return; }
  if (members.find(m => m.username === d.username)) { toast("Username taken"); return; }
  try {
    d.password = await hashPassword(d.password);
    await dbSaveMember(d); await logAudit("create", "member", d.name, `Member "${d.name}" added`);
    members = await dbGetMembers(); buildInitialsMap(members); closeModal(); toast(d.name + " added", "success"); renderMembersTable();
  } catch(e) { toast("Error: " + e.message, "error"); }
}
async function updateMember(id) {
  if (!requireManager("updateMember")) return;
  const existing = members.find(m => m.id === id);
  const d = { ...getMemberFormData(existing?.role || "member"), id };
  if (members.find(m => m.username === d.username && m.id !== id)) { toast("Username taken"); return; }
  try {
    if (d.password) { d.password = await hashPassword(d.password); } else { delete d.password; }
    await dbSaveMember(d); await logAudit("update", "member", d.name, `Member "${d.name}" updated`);
    members = await dbGetMembers(); buildInitialsMap(members); closeModal(); toast("Updated", "success"); renderMembersTable();
  } catch(e) { toast("Error: " + e.message, "error"); }
}

/* ── Member leaving flow: final settlement before delete ── */
async function openLeavingFlow(id) {
  if (!requireManager("openLeavingFlow")) return;
  const m = members.find(x => x.id === id); if (!m) return;
  const { month, year } = thisMonth();
  const key = monthKey(year, month);
  const prevInfo = previousMonth(month, year);

  const [allMeals, allBazar, rentRec, utilRes, prevUtilRes] = await Promise.all([
    dbGetAll("meals"), dbGetAll("bazar"), dbGetMonth("rent", key),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle(),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", prevInfo.key).maybeSingle(),
  ]);

  const calc = calcMemberSettlement(m, allMeals, allBazar, rentRec, utilRes.data, prevUtilRes.data, key);
  const net = calc.netPayable;
  const netColor = net > 0 ? "var(--red)" : net < 0 ? "var(--green)" : "var(--text3)";
  const netLabel = net > 0 ? `Owes ${fmtTk(net)}` : net < 0 ? `Mess owes them ${fmtTk(Math.abs(net))}` : "Fully settled ✓";

  document.getElementById("modal-content").innerHTML = `
    <div class="modal-title">Remove ${escapeHtml(m.name)}</div>
    <div class="modal-sub">Final settlement check before removal</div>

    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;margin-bottom:16px">
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Current settlement — ${MONTHS[month]} ${year}</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div><div style="font-size:10px;color:var(--text3)">Meal cost</div><div style="font-weight:700;color:var(--red)">${fmtTk(calc.mealCost)}</div></div>
        <div><div style="font-size:10px;color:var(--text3)">Rent</div><div style="font-weight:700;color:var(--red)">${fmtTk(calc.roomRent)}</div></div>
        <div><div style="font-size:10px;color:var(--text3)">Utility</div><div style="font-weight:700;color:var(--red)">${fmtTk(round2(calc.prepaidUtility + calc.postpaidUtility))}</div></div>
        <div><div style="font-size:10px;color:var(--text3)">Bazar credit</div><div style="font-weight:700;color:var(--green)">-${fmtTk(calc.memberBazar)}</div></div>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:13px;font-weight:600">Net balance</span>
        <span style="font-size:18px;font-weight:800;color:${netColor}">${netLabel}</span>
      </div>
    </div>

    ${net !== 0 ? `
    <div style="background:var(--accent-bg);border:1px solid rgba(212,168,83,.25);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--accent)">
      ⚠️ This member has an outstanding balance. Settle it before removing, or proceed anyway.
    </div>` : `
    <div style="background:var(--green-bg);border:1px solid rgba(76,175,130,.25);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--green)">
      ✓ Balance is clear — safe to remove.
    </div>`}

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="deleteMember('${m.id}')">Remove anyway</button>
    </div>`;
  openModal();
}

async function deleteMember(id) {
  if (!requireManager("deleteMember")) return;
  const m = members.find(x => x.id === id); if (!m) return;
  closeModal();
  showConfirm({
    title: 'Confirm removal',
    body: `Permanently remove ${escapeHtml(m.name)}? Their historical meal and bazar data will remain but they will no longer be able to sign in.`,
    confirmLabel: 'Remove member',
    danger: true,
    onConfirm: async () => {
      try {
        await dbDeleteMember(id);
        await logAudit("delete", "member", m.name, `Member "${m.name}" removed`);
        members = await dbGetMembers(); buildInitialsMap(members); toast(m.name + ' removed'); renderMembersTable();
      } catch(e) { toast('Error: ' + e.message, 'error'); }
    }
  });
}

/* ── Password modals (shared manager + member) ── */
function openManagerResetPasswordModal(memberId) {
  if (!requireManager("openManagerResetPasswordModal")) return;
  const member = members.find(m => m.id === memberId);
  if (!member) { toast("Member not found", "error"); return; }
  document.getElementById("modal-content").innerHTML = `
    <div class="modal-title">🔑 Reset Password — ${member.name}</div>
    <div class="modal-sub">Set a new password for this member.</div>
    <div class="field"><label>New password *</label><input type="password" class="input" id="mrp-new" placeholder="Min 6 characters" autocomplete="new-password"/></div>
    <div class="field"><label>Confirm new password *</label><input type="password" class="input" id="mrp-confirm" placeholder="Repeat new password" autocomplete="new-password"/></div>
    <div id="mrp-error" style="display:none;color:var(--red);font-size:13px;margin-bottom:8px"></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="doManagerResetPassword('${memberId}', '${member.name}')">Set new password</button>
    </div>`;
  openModal();
}

async function doManagerResetPassword(memberId, memberName) {
  if (!requireManager("doManagerResetPassword")) return;
  const newPw = document.getElementById("mrp-new")?.value;
  const confirmPw = document.getElementById("mrp-confirm")?.value;
  const errEl = document.getElementById("mrp-error");
  const showErr = (msg) => { errEl.style.display = "block"; errEl.textContent = msg; };
  errEl.style.display = "none";
  if (!newPw || newPw.length < 6) return showErr("Password must be at least 6 characters.");
  if (newPw !== confirmPw) return showErr("Passwords do not match.");
  try {
    const newHash = await hashPassword(newPw);
    const { error } = await getClient().from("members").update({ password: newHash }).eq("id", memberId);
    if (error) throw error;
    closeModal(); toast(`Password reset for ${memberName} ✓`, "success");
  } catch(e) { showErr("Error: " + e.message); }
}
