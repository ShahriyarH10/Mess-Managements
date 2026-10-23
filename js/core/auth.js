/* ═══════════════════════════════════════════════
   CORE — Auth: login, create mess, logout, boot
   ═══════════════════════════════════════════════ */
const screens = ["landing-page","create-mess-screen","login-screen","app-shell"];
function showScreen(id) { screens.forEach(s => { const el = document.getElementById(s); if (el) el.style.display = s === id ? "" : "none"; }); }
// Navigation helpers used by inline handlers — they just change the route.
function showLanding()    { Router.go(""); }
function showLogin()      { Router.go("login"); }
function showCreateMess() { Router.go("create"); }
function homePage() {
  const mgr = currentUser?.role === "manager" || currentUser?.role === "sub_manager";
  return mgr && !(typeof isMemberView === "function" && isMemberView()) ? "dashboard" : "my-dashboard";
}
// Legacy name: after a successful sign-in, hand over to the router.
async function bootApp() { Router.goAfterLogin(); }

/* ═══════════════════════════════════════════
   SERVER SIGN-IN — supabase/functions/mm-auth
   Passwords are checked on the server, which returns a signed session token
   (mess_id / member_id / app_role) that the database policies enforce.
   { unavailable: true } means the function isn't deployed yet, so callers fall
   back to the older in-browser check — that path stops working (by design) once
   supabase/security-lockdown.sql hides members.password.
═══════════════════════════════════════════ */
async function mmAuth(action, payload, token) {
  if (MM_MODE === "demo") return { unavailable: true };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/mm-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action, ...payload }),
    });
    if (res.status === 404) return { unavailable: true };
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.error) return { unavailable: true };
    return data;
  } catch (_) {
    return { unavailable: true };   // offline or function missing
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
    const r = await mmAuth("create_mess", { messName, location, name: myName, username, password });
    if (!r.unavailable) {
      if (r.error) { showCreateError(r.error); return; }
      toast("Mess created! Signing you in…", "success");
      saveSession(r.user, r.mess, r.token);
      await bootApp(); return;
    }
    const hashedPw = await hashPassword(password);
    const { data: mess, error: messErr } = await sb.from("messes").insert({ name: messName, location: location || "" }).select().single();
    if (messErr) throw messErr;
    const { data: member, error: memErr } = await sb.from("members").insert({ mess_id: mess.id, name: myName, username, password: hashedPw, role: "manager" }).select().single();
    if (memErr) throw memErr;
    toast("Mess created! Signing you in…", "success");
    saveSession({ name: myName, username, role: "manager", memberId: member.id }, mess, null);
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
    const r = await mmAuth("login", { username: user, password: pass });
    if (!r.unavailable) {
      if (r.error) { showLoginError(r.error); return; }
      resetLoginAttempts();
      saveSession(r.user, r.mess, r.token);
      await bootApp(); return;
    }

    // ── Fallback until mm-auth is deployed (and the sandbox) ──
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
        saveSession({ name: memberRow.name, username: user, role: memberRow.role, memberId: memberRow.id }, messObj, null);
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
