/* ═══════════════════════════════════════════════
   MANAGER — Multi-Manager: promote/demote sub-managers
   Sub-managers can enter meals, bazar, utility but
   cannot delete members, transfer role, or change settings.
   ═══════════════════════════════════════════════ */

async function renderManagerRoles(el) {
  if (!requireManager("renderManagerRoles")) return;
  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">👑 Manager Roles</div>
      <div class="page-sub">Promote members to sub-manager for shared data entry</div>
    </div>
  </div>
  <div class="content">
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">Role Permissions</div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Permission</th><th>Manager</th><th>Sub-manager</th><th>Member</th></tr></thead>
        <tbody>
          ${[
            ["Enter meals & bazar",      "✅","✅","❌"],
            ["Enter rent & utility",      "✅","✅","❌"],
            ["View all member profiles",  "✅","✅","❌"],
            ["Post announcements",        "✅","✅","❌"],
            ["Collect payment",           "✅","✅","❌"],
            ["Broadcast messages",        "✅","✅","❌"],
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
      <div class="card-title">Members</div>
      <div class="empty">Loading…</div>
    </div>
  </div>`;
  renderRolesList();
}

function renderRolesList() {
  const wrap = document.getElementById("roles-member-list");
  if (!wrap) return;
  const others = members.filter(m => m.id !== currentUser.memberId);
  if (!others.length) {
    wrap.innerHTML = '<div class="card-title">Members</div><div class="empty">No other members yet.</div>';
    return;
  }
  wrap.innerHTML = `<div class="card-title">Members</div>` + others.map(m => {
    const col = avatarCol(members.indexOf(m));
    const isSubMgr = m.role === "sub_manager";
    const isMgr = m.role === "manager";
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div class="avatar" style="background:${col.bg};color:${col.fg};width:34px;height:34px;font-size:11px;flex-shrink:0">${initials(m.name)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600">${escapeHtml(m.name)}</div>
        <div style="font-size:11px;color:var(--text3)">@${escapeHtml(m.username)} · Room ${escapeHtml(m.room || "—")}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        ${isMgr
          ? `<span class="badge badge-amber">👑 Manager</span>`
          : isSubMgr
            ? `<span class="badge badge-blue">⚡ Sub-manager</span>
               <button class="btn btn-ghost btn-sm" onclick="setSubManager('${m.id}', false)">Demote</button>`
            : `<span class="badge">Member</span>
               <button class="btn btn-ghost btn-sm" onclick="setSubManager('${m.id}', true)">Promote</button>`
        }
      </div>
    </div>`;
  }).join("");
}

async function setSubManager(memberId, promote) {
  if (!requireManager("setSubManager")) return;
  const m = members.find(x => x.id === memberId);
  if (!m) return;
  const newRole = promote ? "sub_manager" : "member";
  const label = promote ? "sub-manager" : "member";
  showConfirm({
    title: `${promote ? "Promote" : "Demote"} ${m.name}?`,
    body: `${m.name} will become a ${label}. ${promote ? "They can enter meals, bazar, rent and utility but cannot manage members." : "They will lose data entry access."}`,
    confirmLabel: promote ? "Promote to sub-manager" : "Demote to member",
    danger: !promote,
    onConfirm: async () => {
      try {
        const { error } = await getClient().from("members").update({ role: newRole }).eq("id", memberId);
        if (error) throw error;
        await logAudit("update", "member", m.name, `${currentUser.name} ${promote ? "promoted" : "demoted"} ${m.name} to ${newRole}`);
        members = await dbGetMembers();
        toast(`${m.name} is now a ${label} ✓`, "success");
        renderRolesList();
      } catch (e) { toast("Error: " + e.message, "error"); }
    }
  });
}
