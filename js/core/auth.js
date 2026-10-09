/* ═══════════════════════════════════════════════
   CORE — Auth: login, create mess, logout, superadmin, boot
   ═══════════════════════════════════════════════ */
const screens = ["landing-page","demo-screen","create-mess-screen","login-screen","superadmin-screen","app-shell"];
function showScreen(id) { screens.forEach(s => { const el = document.getElementById(s); if (el) el.style.display = s === id ? "" : "none"; }); }
// Navigation helpers used by inline handlers — they just change the route.
function showLanding()    { Router.go(""); }
function showLogin()      { Router.go("login"); }
function showCreateMess() { Router.go("create"); }
function homePage() { return (currentUser?.role === "manager" || currentUser?.role === "sub_manager") ? "dashboard" : "my-dashboard"; }
// Legacy name: after a successful sign-in, hand over to the router.
async function bootApp() { Router.goAfterLogin(); }

/* ═══════════════════════════════════════════
   JWT SIGNING — calls Edge Function to get
   a mess-scoped JWT for RLS
═══════════════════════════════════════════ */
async function signSessionJWT(memberId, messId, role) {
  if (MM_MODE === "demo") return null; // demo never calls the network
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/sign-session-jwt`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, messId, role }),
      }
    );
    const data = await res.json();
    return data.token || null;
  } catch (e) {
    console.error("[Auth] JWT signing failed:", e);
    return null; // app still works, just without RLS enforcement
  }
}

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
  if (username.length < 3) { showCreateError("Username must be at least 3 characters."); return; }
  if (!password || password.length < 6) { showCreateError("Password must be at least 6 characters."); return; }
  const btn = document.getElementById("cm-btn");
  btn.disabled = true; btn.textContent = "Creating…";
  try {
    const hashedPw = await hashPassword(password);
    const { data: mess, error: messErr } = await sb.from("messes").insert({ name: messName, location: location || "" }).select().single();
    if (messErr) throw messErr;
    const { data: member, error: memErr } = await sb.from("members").insert({ mess_id: mess.id, name: myName, username, password: hashedPw, role: "manager" }).select().single();
    if (memErr) throw memErr;
    toast("Mess created! Signing you in…", "success");
    const jwt = await signSessionJWT(member.id, mess.id, "manager");
    saveSession({ name: myName, username, role: "manager", memberId: member.id }, mess, jwt);
    await bootApp();
  } catch (e) {
    showCreateError(e?.code === "23505" ? "That username is already taken — choose another." : "Failed to create mess: " + (e.message || "Unknown error"));
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

  // Brute-force protection
  const lockUntil = parseInt(lsGet(LOGIN_LOCKOUT_KEY) || "0");
  if (Date.now() < lockUntil) {
    const remaining = Math.ceil((lockUntil - Date.now()) / 1000);
    showLoginError(`Too many failed attempts. Try again in ${remaining}s.`);
    return;
  }

  btn.disabled = true; btn.textContent = "Signing in…";
  try {
    // Superadmin check
    if (user === SUPERADMIN.username && MM_MODE === "live") {
      const match = await comparePassword(pass, SUPERADMIN.passwordHash);
      if (match) {
        resetLoginAttempts();
        saveSession({ name: "Super Admin", username: user, role: "superadmin", memberId: null }, null);
        Router.goAfterLogin(); return;
      }
    }

    // Member login — fetch by username only, then compare hash server-side avoided (client hashes)
    const { data: memberRow } = await sb.from("members").select("*, messes(*)")
      .eq("username", user).maybeSingle();

    if (memberRow) {
      const match = await comparePassword(pass, memberRow.password);
      if (match) {
        // Upgrade legacy SHA-256 hash to PBKDF2 transparently
        if (memberRow.password && !memberRow.password.startsWith("pbkdf2:")) {
          const newHash = await hashPassword(pass);
          await sb.from("members").update({ password: newHash }).eq("id", memberRow.id);
        }
        resetLoginAttempts();
        // Ensure mess object is populated
        let messObj = memberRow.messes;
        if (!messObj && memberRow.mess_id) {
          const { data: fetchedMess } = await sb.from("messes").select("*").eq("id", memberRow.mess_id).maybeSingle();
          messObj = fetchedMess;
        }
        // Get a signed JWT with mess_id claim for RLS
        const jwt = await signSessionJWT(memberRow.id, memberRow.mess_id, memberRow.role);
        saveSession({ name: memberRow.name, username: user, role: memberRow.role, memberId: memberRow.id }, messObj, jwt);
        await bootApp(); return;
      }
    }

    // Failed
    const attempts = parseInt(lsGet(LOGIN_ATTEMPTS_KEY) || "0") + 1;
    lsSet(LOGIN_ATTEMPTS_KEY, attempts);
    if (attempts >= LOGIN_MAX_ATTEMPTS) {
      lsSet(LOGIN_LOCKOUT_KEY, Date.now() + LOGIN_LOCKOUT_MS);
      lsRemove(LOGIN_ATTEMPTS_KEY);
      showLoginError("Too many failed attempts. Locked for 5 minutes.");
    } else {
      showLoginError(`Invalid username or password. (${LOGIN_MAX_ATTEMPTS - attempts} attempt${LOGIN_MAX_ATTEMPTS - attempts === 1 ? "" : "s"} remaining)`);
    }
  } catch (e) {
    showLoginError("Connection error. Check your network."); console.error(e);
  } finally {
    btn.disabled = false; btn.textContent = "Sign in →";
  }
}

function resetLoginAttempts() {
  lsRemove(LOGIN_ATTEMPTS_KEY);
  lsRemove(LOGIN_LOCKOUT_KEY);
}
// localStorage can throw (private mode, blocked cookies) — never let that break login.
function lsGet(k)    { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function lsRemove(k) { try { localStorage.removeItem(k); } catch {} }

function showLoginError(msg) {
  const el = document.getElementById("login-error");
  el.style.display = "block"; el.textContent = msg;
}
function doLogout() {
  if (typeof closeMobileMore === "function") closeMobileMore();
  const drawer = document.getElementById("mobile-nav-drawer");
  if (drawer) drawer.classList.remove("open");
  clearSession();
  Router.resetShell();
  Router.go("");
}

/* ═══════════════════════════════════════════
   SUPERADMIN
═══════════════════════════════════════════ */
function bootSuperAdmin(page = "messes") {
  showScreen("superadmin-screen");
  document.getElementById("sa-sidebar-user").innerHTML = `<div class="su-avatar" style="background:#2a2218;color:#d4a853">SA</div><div><div class="su-name">Super Admin</div><div class="su-role">System</div></div>`;
  document.querySelectorAll("[data-sapage]").forEach(b => b.classList.toggle("active", b.dataset.sapage === page));
  renderSAPage(page);
}
function saNavigate(page) { Router.go("admin/" + page); }
async function renderSAPage(page) {
  const main = document.getElementById("sa-main");
  if (page === "messes")  await renderSAMesses(main);
  else if (page === "metrics") await renderSAMetrics(main);
}
async function renderSAMesses(main) {
  const { data: messes } = await getClient().from("messes").select("*").order("created_at", { ascending: false });
  main.innerHTML = `<div class="topbar"><div><div class="page-title">All Messes</div><div class="page-sub">${(messes||[]).length} messes registered</div></div></div>
  <div class="content"><div class="card"><div class="tbl-wrap"><table>
    <thead><tr><th>Mess Name</th><th>Location</th><th>Created</th><th>Members</th><th></th></tr></thead>
    <tbody id="sa-messes-tbody"><tr><td colspan="5" class="empty">Loading…</td></tr></tbody>
  </table></div></div></div>`;
  if (!messes?.length) { document.getElementById("sa-messes-tbody").innerHTML = '<tr><td colspan="5" class="empty">No messes yet</td></tr>'; return; }
  const { data: memCounts } = await getClient().from("members").select("mess_id");
  const countMap = {};
  (memCounts||[]).forEach(m => { countMap[m.mess_id] = (countMap[m.mess_id]||0)+1; });
  document.getElementById("sa-messes-tbody").innerHTML = messes.map(m => `<tr>
    <td><b>${escapeHtml(m.name)}</b></td>
    <td style="color:var(--text3)">${escapeHtml(m.location||"—")}</td>
    <td style="color:var(--text3)">${new Date(m.created_at).toLocaleDateString()}</td>
    <td><span class="badge badge-blue">${countMap[m.id]||0} members</span></td>
    <td><button class="btn btn-danger btn-sm" onclick="saDeleteMess('${m.id}')">Delete</button></td>
  </tr>`).join("");
}
async function saDeleteMess(id) {
  if (!currentUser || currentUser.role !== "superadmin") { toast("Superadmin access required", "error"); return; }
  showConfirm({
    title: "Delete this mess?",
    body: "This will permanently delete the mess and ALL its data (members, meals, bazar, rent, utility). This cannot be undone.",
    confirmLabel: "Delete permanently",
    danger: true,
    onConfirm: async () => {
      try {
        for (const t of ["meals","bazar","rent","utility_payments","members","announcements","chores"]) {
          await getClient().from(t).delete().eq("mess_id", id);
        }
        await getClient().from("messes").delete().eq("id", id);
        toast("Mess deleted"); renderSAPage("messes");
      } catch (e) { toast("Delete failed: " + e.message, "error"); }
    }
  });
}
async function renderSAMetrics(main) {
  const [{ data: messes }, { data: mems }] = await Promise.all([
    getClient().from("messes").select("id,name,created_at"),
    getClient().from("members").select("mess_id"),
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
// Builds the app shell for the signed-in user (called by the router, once per user).
async function prepareShell() {
  members = await dbGetMembers();
  buildInitialsMap(members); // collision-aware initials map
  buildNav();
  updateSidebarUser();
  updateMessBranding();
  checkDB(); // non-blocking — updates the status dot in the background
}

function updateMessBranding() {
  const n = currentMess?.name||"MessManager", l = currentMess?.location||"";
  const el1=document.getElementById("app-mess-name"), el2=document.getElementById("app-mess-location"), el3=document.getElementById("mob-mess-name");
  if(el1) el1.textContent=n; if(el2) el2.textContent=l||""; if(el3) el3.textContent=n;
  document.title = n + " · MessManager";
  const li=document.getElementById("app-logo-icon"); if(li) li.textContent=(n[0]||"M").toUpperCase();
}

async function checkDB() {
  if (MM_MODE === "demo") {
    const lbl = document.getElementById("db-label"), dot = document.getElementById("db-dot");
    if (lbl) lbl.textContent = "Demo · sample data";
    if (dot) { dot.style.background = "var(--accent)"; dot.classList.add("live"); }
    return;
  }
  try {
    await getClient().from("messes").select("id",{count:"exact",head:true});
    const dot = document.getElementById("db-dot");
    const lbl = document.getElementById("db-label");
    if(dot){ dot.style.background="var(--green)"; dot.classList.add("live"); }
    if(lbl) lbl.textContent="Connected";
  } catch(e) {
    const dot = document.getElementById("db-dot");
    const lbl = document.getElementById("db-label");
    if(dot) dot.style.background="var(--red)";
    if(lbl) lbl.textContent="DB error";
  }
}
