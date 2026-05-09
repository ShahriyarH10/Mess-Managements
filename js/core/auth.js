/* ═══════════════════════════════════════════════
   CORE — Auth: login, create mess, logout, superadmin, boot
   ═══════════════════════════════════════════════ */
const screens = ["landing-page","create-mess-screen","login-screen","superadmin-screen","app-shell"];
function showScreen(id) { screens.forEach(s => { document.getElementById(s).style.display = s === id ? "" : "none"; }); }
function showLanding()    { showScreen("landing-page"); }
function showLogin()      { showScreen("login-screen"); }
function showCreateMess() { showScreen("create-mess-screen"); }

/* ═══════════════════════════════════════════
   CREATE MESS
═══════════════════════════════════════════ */
async function doCreateMess() {
  const messName = cleanText(document.getElementById("cm-name")?.value);
  const myName   = cleanText(document.getElementById("cm-admin-name")?.value);
  const username = cleanText(document.getElementById("cm-username")?.value);
  const password = document.getElementById("cm-password")?.value;
  const location = cleanText(document.getElementById("cm-location")?.value);
  const errEl = document.getElementById("create-error");
  errEl.style.display = "none";
  if (!messName) { showCreateError("Mess name is required."); return; }
  if (!myName)   { showCreateError("Your name is required."); return; }
  if (!username) { showCreateError("Username is required."); return; }
  if (!password || password.length < 6) { showCreateError("Password must be at least 6 characters."); return; }
  const btn = document.getElementById("cm-btn");
  btn.disabled = true; btn.textContent = "Creating…";
  try {
    const { data: mess, error: messErr } = await sb.from("messes").insert({ name: messName, location: location || "" }).select().single();
    if (messErr) throw messErr;
    const { data: member, error: memErr } = await sb.from("members").insert({ mess_id: mess.id, name: myName, username, password, role: "manager" }).select().single();
    if (memErr) throw memErr;
    toast("Mess created! Signing you in…", "success");
    saveSession({ name: myName, username, role: "manager", memberId: member.id }, mess);
    await bootApp();
  } catch (e) {
    showCreateError("Failed to create mess: " + (e.message || "Unknown error"));
  } finally {
    btn.disabled = false; btn.textContent = "Create mess & continue →";
  }
}
function showCreateError(msg) {
  const el = document.getElementById("create-error");
  el.style.display = "block"; el.textContent = msg;
}

/* ═══════════════════════════════════════════
   LOGIN / LOGOUT
═══════════════════════════════════════════ */
async function doLogin() {
  const user  = cleanText(document.getElementById("login-user")?.value);
  const pass  = document.getElementById("login-pass")?.value;
  const btn   = document.getElementById("login-btn");
  const errEl = document.getElementById("login-error");
  errEl.style.display = "none";
  if (!user || !pass) { showLoginError("Enter username and password."); return; }
  btn.disabled = true; btn.textContent = "Signing in…";
  try {
    if (user === SUPERADMIN.username && pass === SUPERADMIN.password) {
      saveSession({ name: "Super Admin", username: user, role: "superadmin", memberId: null }, null);
      bootSuperAdmin(); return;
    }
    const { data: member } = await sb.from("members").select("*, messes(*)").eq("username", user).eq("password", pass).maybeSingle();
    if (member) {
      saveSession({ name: member.name, username: user, role: member.role, memberId: member.id }, member.messes);
      await bootApp(); return;
    }
    showLoginError("Invalid username or password.");
  } catch (e) {
    showLoginError("Connection error. Check your network."); console.error(e);
  } finally {
    btn.disabled = false; btn.textContent = "Sign in →";
  }
}
function showLoginError(msg) {
  const el = document.getElementById("login-error");
  el.style.display = "block"; el.textContent = msg;
}
function doLogout() { clearSession(); showLanding(); }

/* ═══════════════════════════════════════════
   SUPERADMIN
═══════════════════════════════════════════ */
function bootSuperAdmin() {
  showScreen("superadmin-screen");
  document.getElementById("sa-sidebar-user").innerHTML = `<div class="su-avatar" style="background:#2a2218;color:#d4a853">SA</div><div class="su-info"><div class="su-name">Super Admin</div><div class="su-role">System</div></div>`;
  saNavigate("messes");
}
function saNavigate(page) {
  document.querySelectorAll("[data-sapage]").forEach(b => b.classList.toggle("active", b.dataset.sapage === page));
  renderSAPage(page);
}
async function renderSAPage(page) {
  const main = document.getElementById("sa-main");
  if (page === "messes")  await renderSAMesses(main);
  else if (page === "metrics") await renderSAMetrics(main);
}
async function renderSAMesses(main) {
  const { data: messes } = await sb.from("messes").select("*").order("created_at", { ascending: false });
  main.innerHTML = `<div class="topbar"><div><div class="page-title">All Messes</div><div class="page-sub">${(messes||[]).length} messes registered</div></div></div>
  <div class="content"><div class="card"><div class="tbl-wrap"><table>
    <thead><tr><th>Mess Name</th><th>Location</th><th>Created</th><th>Members</th><th></th></tr></thead>
    <tbody id="sa-messes-tbody"><tr><td colspan="5" class="empty">Loading…</td></tr></tbody>
  </table></div></div></div>`;
  if (!messes?.length) { document.getElementById("sa-messes-tbody").innerHTML = '<tr><td colspan="5" class="empty">No messes yet</td></tr>'; return; }
  const { data: memCounts } = await sb.from("members").select("mess_id");
  const countMap = {};
  (memCounts||[]).forEach(m => { countMap[m.mess_id] = (countMap[m.mess_id]||0)+1; });
  document.getElementById("sa-messes-tbody").innerHTML = messes.map(m => `<tr>
    <td><b>${m.name}</b></td><td style="color:var(--text3)">${m.location||"—"}</td>
    <td style="color:var(--text3)">${new Date(m.created_at).toLocaleDateString()}</td>
    <td><span class="badge badge-blue">${countMap[m.id]||0} members</span></td>
    <td><button class="btn btn-danger btn-sm" onclick="saDeleteMess('${m.id}')">Delete</button></td>
  </tr>`).join("");
}
async function saDeleteMess(id) {
  if (!confirm("Delete this mess and ALL its data? This cannot be undone.")) return;
  try {
    for (const t of ["meals","bazar","rent","utility_payments","members","announcements","chores"]) {
      await sb.from(t).delete().eq("mess_id", id);
    }
    await sb.from("messes").delete().eq("id", id);
    toast("Mess deleted"); renderSAPage("messes");
  } catch (e) { toast("Delete failed: " + e.message, "error"); }
}
async function renderSAMetrics(main) {
  const [{ data: messes }, { data: mems }] = await Promise.all([
    sb.from("messes").select("id,name,created_at"),
    sb.from("members").select("mess_id"),
  ]);
  const totalMesses = messes?.length||0, totalMembers = mems?.length||0;
  const today30 = new Date(Date.now()-30*24*3600*1000).toISOString();
  const newMesses = (messes||[]).filter(m => m.created_at > today30).length;
  main.innerHTML = `<div class="topbar"><div><div class="page-title">Platform Metrics</div><div class="page-sub">System-wide overview</div></div></div>
  <div class="content">
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Total Messes</div><div class="stat-value">${totalMesses}</div></div>
      <div class="stat-card"><div class="stat-label">Total Members</div><div class="stat-value">${totalMembers}</div></div>
      <div class="stat-card"><div class="stat-label">New Messes (30d)</div><div class="stat-value" style="color:var(--green)">${newMesses}</div></div>
      <div class="stat-card"><div class="stat-label">Avg Members/Mess</div><div class="stat-value">${totalMesses?round2(totalMembers/totalMesses):0}</div></div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════
   BOOT APP
═══════════════════════════════════════════ */
async function bootApp() {
  showScreen("app-shell");
  members = await dbGetMembers();
  buildNav();
  updateSidebarUser();
  updateMessBranding();
  await checkDB();
  navigate(currentUser.role === "manager" ? "dashboard" : "my-dashboard");
}

function updateMessBranding() {
  const n = currentMess?.name||"MessManager", l = currentMess?.location||"Dhaka · 2025";
  const el1=document.getElementById("app-mess-name"), el2=document.getElementById("app-mess-location"), el3=document.getElementById("mob-mess-name");
  if(el1) el1.textContent=n; if(el2) el2.textContent=l; if(el3) el3.textContent=n;
  const li=document.getElementById("app-logo-icon"); if(li) li.textContent=(n[0]||"M").toUpperCase();
}

async function checkDB() {
  try {
    await sb.from("messes").select("id",{count:"exact",head:true});
    document.getElementById("db-dot").style.background="var(--green)";
    document.getElementById("db-dot").classList.add("live");
    document.getElementById("db-label").textContent="Connected";
  } catch(e) {
    document.getElementById("db-dot").style.background="var(--red)";
    document.getElementById("db-label").textContent="DB error";
  }
}
