"use strict";
/* ═══════════════════════════════════════════
   SUPABASE
═══════════════════════════════════════════ */
const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_KEY = '__SUPABASE_KEY__';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
let currentUser = null; // { id, name, role:'manager'|'member'|'superadmin', username, memberId, messId }
let currentMess = null; // { id, name, location }
let members = [];
let currentPage = "";

/* ═══════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════ */
const SUPERADMIN = {
  username: "superadmin",
  password: "super@admin2025",
  role: "superadmin",
};
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const PALETTE = [
  { bg: "#1a2a3a", fg: "#5b9bd5" },
  { bg: "#1a2e25", fg: "#4caf82" },
  { bg: "#2e1a1a", fg: "#e05252" },
  { bg: "#2a2218", fg: "#d4a853" },
  { bg: "#251a2e", fg: "#9b7fd4" },
  { bg: "#1e2a2a", fg: "#4cb8b8" },
  { bg: "#2e1f1a", fg: "#d47a4c" },
  { bg: "#1a1a2e", fg: "#7a7dd4" },
];

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => {
  const n = new Date();
  return { month: n.getMonth(), year: n.getFullYear() };
};
const pad2 = (n) => String(n + 1).padStart(2, "0");
const monthKey = (y, m) => `${y}-${pad2(m)}`;
const fmt = (n) => Number(n || 0).toLocaleString("en-IN");
const fmtTk = (n) => "৳" + fmt(n);
const round2 = (n) => Math.round((n || 0) * 100) / 100;
const initials = (name) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const avatarCol = (i) => PALETTE[i % PALETTE.length];

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function sanitize(v) {
  if (Array.isArray(v)) return v.map(sanitize);
  if (v && typeof v === "object") {
    const o = {};
    Object.entries(v).forEach(([k, vv]) => {
      o[k] = sanitize(vv);
    });
    return o;
  }
  if (typeof v === "string") return escapeHtml(v);
  return v;
}
const cleanText = (v) =>
  String(v ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();

/* ═══════════════════════════════════════════
   THEME
═══════════════════════════════════════════ */
function loadTheme() {
  document.documentElement.setAttribute(
    "data-theme",
    localStorage.getItem("mm_theme") || "dark",
  );
}
function toggleTheme() {
  const next =
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "light"
      : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("mm_theme", next);
}
function togglePw() {
  const i = document.getElementById("login-pass");
  if (i) i.type = i.type === "password" ? "text" : "password";
}

/* ═══════════════════════════════════════════
   SESSION
═══════════════════════════════════════════ */
function saveSession(u, m) {
  currentUser = u;
  currentMess = m;
  sessionStorage.setItem("mm_user", JSON.stringify(u));
  sessionStorage.setItem("mm_mess", JSON.stringify(m));
}
function loadSession() {
  try {
    const u = sessionStorage.getItem("mm_user");
    const m = sessionStorage.getItem("mm_mess");
    if (u) currentUser = JSON.parse(u);
    if (m) currentMess = JSON.parse(m);
  } catch (e) {
    currentUser = null;
    currentMess = null;
  }
}
function clearSession() {
  currentUser = null;
  currentMess = null;
  members = [];
  sessionStorage.removeItem("mm_user");
  sessionStorage.removeItem("mm_mess");
}

/* ═══════════════════════════════════════════
   DB HELPERS (mess-scoped)
═══════════════════════════════════════════ */
const messId = () => currentMess?.id;

async function dbGetAll(table) {
  const orderCol =
    table === "meals" || table === "bazar"
      ? "date"
      : table === "rent"
        ? "month_key"
        : "created_at";
  const { data, error } = await sb
    .from(table)
    .select("*")
    .eq("mess_id", messId())
    .order(orderCol);
  if (error) throw error;
  return sanitize(data || []);
}

async function dbGetMonth(table, key) {
  if (table === "rent") {
    const { data, error } = await sb
      .from("rent")
      .select("*")
      .eq("mess_id", messId())
      .eq("month_key", key)
      .maybeSingle();
    if (error) throw error;
    return sanitize(data);
  }
  const { data, error } = await sb
    .from(table)
    .select("*")
    .eq("mess_id", messId())
    .eq("id", key)
    .maybeSingle();
  if (error) throw error;
  return sanitize(data);
}

async function dbUpsertMeals(date, meals) {
  const { error } = await sb
    .from("meals")
    .upsert({ mess_id: messId(), date, meals }, { onConflict: "mess_id,date" });
  if (error) throw error;
}
async function dbUpsertBazar(date, bazar) {
  const ex = await sb
    .from("bazar")
    .select("utility")
    .eq("mess_id", messId())
    .eq("date", date)
    .maybeSingle();
  const { error } = await sb
    .from("bazar")
    .upsert(
      { mess_id: messId(), date, bazar, utility: ex?.data?.utility || {} },
      { onConflict: "mess_id,date" },
    );
  if (error) throw error;
}
async function dbUpsertRent(month, year, key, entries) {
  const { error } = await sb.from("rent").upsert(
    {
      mess_id: messId(),
      month_key: key,
      month,
      year,
      month_name: MONTHS[month],
      entries,
    },
    { onConflict: "mess_id,month_key" },
  );
  if (error) throw error;
}
async function dbUpsertUtility(month, year, key, bills, payments) {
  const { error } = await sb.from("utility_payments").upsert(
    {
      mess_id: messId(),
      month_key: key,
      month,
      year,
      month_name: MONTHS[month],
      bills,
      payments,
    },
    { onConflict: "mess_id,month_key" },
  );
  if (error) throw error;
}
async function dbDelete(table, id) {
  const { error } = await sb
    .from(table)
    .delete()
    .eq("id", id)
    .eq("mess_id", messId());
  if (error) throw error;
}

/* Members */
async function dbGetMembers() {
  const { data, error } = await sb
    .from("members")
    .select("*")
    .eq("mess_id", messId())
    .order("created_at");
  if (error) throw error;
  return sanitize(data || []);
}
async function dbSaveMember(row) {
  const payload = {
    name: row.name,
    username: row.username,
    password: row.password,
    role: row.role || "member",
    room: row.room || "",
    rent: row.rent || 0,
    phone: row.phone || "",
    joined: row.joined || null,
    mess_id: messId(),
  };
  if (row.id) {
    const { error } = await sb.from("members").update(payload).eq("id", row.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from("members").insert(payload);
    if (error) throw error;
  }
}
async function dbDeleteMember(id) {
  const { error } = await sb.from("members").delete().eq("id", id);
  if (error) throw error;
}

/* Announcements */
async function dbGetAnnouncements() {
  const { data, error } = await sb
    .from("announcements")
    .select("*")
    .eq("mess_id", messId())
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return sanitize(data || []);
}
async function dbSaveAnnouncement(row) {
  if (row.id) {
    const { error } = await sb
      .from("announcements")
      .update({ title: row.title, body: row.body, pinned: row.pinned })
      .eq("id", row.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from("announcements").insert({
      mess_id: messId(),
      title: row.title,
      body: row.body,
      pinned: row.pinned || false,
      author: currentUser.name,
    });
    if (error) throw error;
  }
}
async function dbDeleteAnnouncement(id) {
  const { error } = await sb.from("announcements").delete().eq("id", id);
  if (error) throw error;
}

/* Chores */
async function dbGetChores() {
  const { data, error } = await sb
    .from("chores")
    .select("*")
    .eq("mess_id", messId())
    .order("created_at");
  if (error) throw error;
  return sanitize(data || []);
}
async function dbSaveChore(row) {
  if (row.id) {
    const { error } = await sb
      .from("chores")
      .update({
        task: row.task,
        assignee: row.assignee,
        frequency: row.frequency,
        status: row.status,
      })
      .eq("id", row.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from("chores").insert({
      mess_id: messId(),
      task: row.task,
      assignee: row.assignee,
      frequency: row.frequency || "daily",
      status: row.status || "pending",
    });
    if (error) throw error;
  }
}
async function dbDeleteChore(id) {
  const { error } = await sb.from("chores").delete().eq("id", id);
  if (error) throw error;
}

/* Notifications */
async function dbGetNotifications(statusFilter) {
  let q = sb
    .from("notifications")
    .select("*")
    .eq("mess_id", messId())
    .order("created_at", { ascending: false });
  if (statusFilter) q = q.eq("status", statusFilter);
  const { data, error } = await q;
  if (error) throw error;
  return sanitize(data || []);
}

async function dbSaveNotification(row) {
  const { error } = await sb.from("notifications").insert({
    mess_id: messId(),
    type: row.type,
    from_id: currentUser.memberId,
    from_name: currentUser.name,
    date: row.date,
    data: row.data,
    note: row.note || "",
    status: "pending",
  });
  if (error) throw error;
}

async function dbUpdateNotifStatus(id, status) {
  const { error } = await sb
    .from("notifications")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

async function getPendingCount() {
  const { count, error } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("mess_id", messId())
    .eq("status", "pending");
  if (error) return 0;
  return count || 0;
}

/* ═══════════════════════════════════════════
   SCREEN NAVIGATION
═══════════════════════════════════════════ */
const screens = [
  "landing-page",
  "create-mess-screen",
  "login-screen",
  "superadmin-screen",
  "app-shell",
];
function showScreen(id) {
  screens.forEach((s) => {
    document.getElementById(s).style.display = s === id ? "" : "none";
  });
}
function showLanding() {
  showScreen("landing-page");
}
function showLogin() {
  showScreen("login-screen");
}
function showCreateMess() {
  showScreen("create-mess-screen");
}

/* ═══════════════════════════════════════════
   LANDING
═══════════════════════════════════════════ */
// Landing nav functions already bound via onclick in HTML

/* ═══════════════════════════════════════════
   CREATE MESS
═══════════════════════════════════════════ */
async function doCreateMess() {
  const messName = cleanText(document.getElementById("cm-name")?.value);
  const myName = cleanText(document.getElementById("cm-admin-name")?.value);
  const username = cleanText(document.getElementById("cm-username")?.value);
  const password = document.getElementById("cm-password")?.value;
  const location = cleanText(document.getElementById("cm-location")?.value);

  const errEl = document.getElementById("create-error");
  errEl.style.display = "none";

  if (!messName) {
    showCreateError("Mess name is required.");
    return;
  }
  if (!myName) {
    showCreateError("Your name is required.");
    return;
  }
  if (!username) {
    showCreateError("Username is required.");
    return;
  }
  if (!password || password.length < 6) {
    showCreateError("Password must be at least 6 characters.");
    return;
  }

  const btn = document.getElementById("cm-btn");
  btn.disabled = true;
  btn.textContent = "Creating…";

  try {
    // 1. Create the mess (no admin columns anymore)
    const { data: mess, error: messErr } = await sb
      .from("messes")
      .insert({ name: messName, location: location || "" })
      .select()
      .single();
    if (messErr) throw messErr;

    // 2. Create the creator as a member with role = 'manager'
    const { data: member, error: memErr } = await sb
      .from("members")
      .insert({
        mess_id: mess.id,
        name: myName,
        username,
        password,
        role: "manager",
      })
      .select()
      .single();
    if (memErr) throw memErr;

    toast("Mess created! Signing you in…", "success");
    saveSession(
      { name: myName, username, role: "manager", memberId: member.id },
      mess,
    );
    await bootApp();
  } catch (e) {
    showCreateError("Failed to create mess: " + (e.message || "Unknown error"));
  } finally {
    btn.disabled = false;
    btn.textContent = "Create mess & continue →";
  }
}
function showCreateError(msg) {
  const el = document.getElementById("create-error");
  el.style.display = "block";
  el.textContent = msg;
}

/* ═══════════════════════════════════════════
   LOGIN
═══════════════════════════════════════════ */
async function doLogin() {
  const user = cleanText(document.getElementById("login-user")?.value);
  const pass = document.getElementById("login-pass")?.value;
  const btn = document.getElementById("login-btn");
  const errEl = document.getElementById("login-error");
  errEl.style.display = "none";

  if (!user || !pass) {
    showLoginError("Enter username and password.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Signing in…";

  try {
    // Superadmin check
    if (user === SUPERADMIN.username && pass === SUPERADMIN.password) {
      saveSession(
        {
          name: "Super Admin",
          username: user,
          role: "superadmin",
          memberId: null,
        },
        null,
      );
      bootSuperAdmin();
      return;
    }

    // All regular users are in members table now
    const { data: member, error } = await sb
      .from("members")
      .select("*, messes(*)")
      .eq("username", user)
      .eq("password", pass)
      .maybeSingle();

    if (member) {
      // role comes directly from the member record ('manager' or 'member')
      saveSession(
        {
          name: member.name,
          username: user,
          role: member.role, // 'manager' or 'member'
          memberId: member.id,
        },
        member.messes,
      );
      await bootApp();
      return;
    }

    showLoginError("Invalid username or password.");
  } catch (e) {
    showLoginError("Connection error. Check your network.");
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in →";
  }
}
function showLoginError(msg) {
  const el = document.getElementById("login-error");
  el.style.display = "block";
  el.textContent = msg;
}

function doLogout() {
  clearSession();
  showLanding();
}

/* ═══════════════════════════════════════════
   SUPERADMIN
═══════════════════════════════════════════ */
function bootSuperAdmin() {
  showScreen("superadmin-screen");
  document.getElementById("sa-sidebar-user").innerHTML = `
    <div class="su-avatar" style="background:#2a2218;color:#d4a853">SA</div>
    <div class="su-info"><div class="su-name">Super Admin</div><div class="su-role">System</div></div>`;
  saNavigate("messes");
}

function saNavigate(page) {
  document
    .querySelectorAll("[data-sapage]")
    .forEach((b) => b.classList.toggle("active", b.dataset.sapage === page));
  renderSAPage(page);
}

async function renderSAPage(page) {
  const main = document.getElementById("sa-main");
  if (page === "messes") await renderSAMesses(main);
  else if (page === "metrics") await renderSAMetrics(main);
}

async function renderSAMesses(main) {
  const { data: messes } = await sb
    .from("messes")
    .select("*")
    .order("created_at", { ascending: false });
  main.innerHTML = `<div class="topbar"><div><div class="page-title">All Messes</div><div class="page-sub">${(messes || []).length} messes registered</div></div></div>
  <div class="content">
    <div class="card">
      <div class="tbl-wrap"><table>
        <thead><tr><th>Mess Name</th><th>Location</th><th>Admin</th><th>Username</th><th>Created</th><th>Members</th><th></th></tr></thead>
        <tbody id="sa-messes-tbody"><tr><td colspan="7" class="empty">Loading…</td></tr></tbody>
      </table></div>
    </div>
  </div>`;
  if (!messes?.length) {
    document.getElementById("sa-messes-tbody").innerHTML =
      '<tr><td colspan="7" class="empty">No messes yet</td></tr>';
    return;
  }
  // Get member counts
  const { data: memCounts } = await sb.from("members").select("mess_id");
  const countMap = {};
  (memCounts || []).forEach((m) => {
    countMap[m.mess_id] = (countMap[m.mess_id] || 0) + 1;
  });
  document.getElementById("sa-messes-tbody").innerHTML = messes
    .map(
      (m) => `<tr>
    <td><b>${m.name}</b></td>
    <td style="color:var(--text3)">${m.location || "—"}</td>
    <td>${m.admin_name}</td>
    <td style="font-family:monospace;color:var(--text3)">${m.admin_username}</td>
    <td style="color:var(--text3)">${new Date(m.created_at).toLocaleDateString()}</td>
    <td><span class="badge badge-blue">${countMap[m.id] || 0} members</span></td>
    <td><button class="btn btn-danger btn-sm" onclick="saDeleteMess('${m.id}')">Delete</button></td>
  </tr>`,
    )
    .join("");
}

async function saDeleteMess(id) {
  if (!confirm("Delete this mess and ALL its data? This cannot be undone."))
    return;
  try {
    // cascade delete
    for (const t of [
      "meals",
      "bazar",
      "rent",
      "utility_payments",
      "members",
      "announcements",
      "chores",
    ]) {
      await sb.from(t).delete().eq("mess_id", id);
    }
    await sb.from("messes").delete().eq("id", id);
    toast("Mess deleted");
    renderSAPage("messes");
  } catch (e) {
    toast("Delete failed: " + e.message, "error");
  }
}

async function renderSAMetrics(main) {
  const [{ data: messes }, { data: members }] = await Promise.all([
    sb.from("messes").select("id,name,created_at"),
    sb.from("members").select("mess_id"),
  ]);
  const totalMesses = messes?.length || 0;
  const totalMembers = members?.length || 0;
  const today30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const newMesses = (messes || []).filter((m) => m.created_at > today30).length;

  main.innerHTML = `<div class="topbar"><div><div class="page-title">Platform Metrics</div><div class="page-sub">System-wide overview</div></div></div>
  <div class="content">
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Total Messes</div><div class="stat-value">${totalMesses}</div></div>
      <div class="stat-card"><div class="stat-label">Total Members</div><div class="stat-value">${totalMembers}</div></div>
      <div class="stat-card"><div class="stat-label">New Messes (30d)</div><div class="stat-value" style="color:var(--green)">${newMesses}</div></div>
      <div class="stat-card"><div class="stat-label">Avg Members/Mess</div><div class="stat-value">${totalMesses ? round2(totalMembers / totalMesses) : 0}</div></div>
    </div>
    <div class="card"><div class="card-title">Recent messes</div><div class="tbl-wrap"><table>
      <thead><tr><th>Mess</th><th>Created</th><th>Members</th></tr></thead>
      <tbody>${(messes || [])
        .slice(0, 10)
        .map((m) => {
          const mc = (members || []).filter((x) => x.mess_id === m.id).length;
          return `<tr><td><b>${m.name}</b></td><td style="color:var(--text3)">${new Date(m.created_at).toLocaleDateString()}</td><td>${mc}</td></tr>`;
        })
        .join("")}</tbody>
    </table></div></div>
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
  // Both manager and member start on their own dashboard
  navigate(currentUser.role === "manager" ? "dashboard" : "my-dashboard");
}

function updateMessBranding() {
  const n = currentMess?.name || "MessManager";
  const l = currentMess?.location || "Dhaka · 2025";
  const el1 = document.getElementById("app-mess-name"),
    el2 = document.getElementById("app-mess-location"),
    el3 = document.getElementById("mob-mess-name");
  if (el1) el1.textContent = n;
  if (el2) el2.textContent = l;
  if (el3) el3.textContent = n;
  const li = document.getElementById("app-logo-icon");
  if (li) li.textContent = (n[0] || "M").toUpperCase();
}

async function checkDB() {
  try {
    await sb.from("messes").select("id", { count: "exact", head: true });
    document.getElementById("db-dot").style.background = "var(--green)";
    document.getElementById("db-dot").classList.add("live");
    document.getElementById("db-label").textContent = "Connected";
  } catch (e) {
    document.getElementById("db-dot").style.background = "var(--red)";
    document.getElementById("db-label").textContent = "DB error";
  }
}

/* ═══════════════════════════════════════════
   NAV BUILDING
═══════════════════════════════════════════ */
const IC = {
  dash: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>`,
  profile: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>`,
  meal: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2v12M8 2v4M13 2v12M8 6c0 2.5-2 3-2 5"/></svg>`,
  bazar: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4h12l-1.5 7H3.5L2 4z"/><circle cx="6" cy="13" r="1"/><circle cx="11" cy="13" r="1"/></svg>`,
  util: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1v3M8 12v3M3.5 3.5l2 2M10.5 10.5l2 2M1 8h3M12 8h3M3.5 12.5l2-2M10.5 5.5l2-2"/></svg>`,
  rent: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="5" width="12" height="9" rx="1"/><path d="M5 5V4a3 3 0 016 0v1"/><path d="M8 9v2"/></svg>`,
  log: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M5 6h6M5 9h4"/></svg>`,
  members: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="5" r="2.5"/><path d="M1 13c0-2.8 2.2-5 5-5"/><circle cx="12" cy="7" r="2"/><path d="M9 14c0-1.7 1.3-3 3-3s3 1.3 3 3"/></svg>`,
  announce: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 5L8 8 3 5M3 4h10a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg>`,
  chores: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8h12M2 4h12M2 12h8"/></svg>`,
  bell: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1a5 5 0 015 5v3l1.5 2H1.5L3 9V6a5 5 0 015-5zM6.5 13a1.5 1.5 0 003 0"/></svg>`,
};

const MANAGER_NAV = [
  { section: "Overview" },
  { page: "dashboard", label: "Dashboard", icon: IC.dash },
  { page: "profiles", label: "Member Profiles", icon: IC.profile },
  { section: "Entry" },
  { page: "meals", label: "Meal Entry", icon: IC.meal },
  { page: "bazar", label: "Bazar Entry", icon: IC.bazar },
  { page: "utility", label: "Utility Entry", icon: IC.util },
  { page: "rent", label: "Room Rent", icon: IC.rent },
  { section: "Reports" },
  { page: "log", label: "Monthly Log", icon: IC.log },
  { section: "Mess" },
  { page: "announce", label: "Announcements", icon: IC.announce },
  { page: "chores", label: "Chore Roster", icon: IC.chores },
  { page: "notifications", label: "Requests", icon: IC.bell },
  { page: "members", label: "Members", icon: IC.members },
  {
    page: "transfer",
    label: "Transfer Role",
    icon: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 3l3 3-3 3M2 6h12M5 13l-3-3 3-3M14 10H2"/></svg>`,
    bell: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1a5 5 0 015 5v3l1.5 2H1.5L3 9V6a5 5 0 015-5zM6.5 13a1.5 1.5 0 003 0"/></svg>`,
  },
];
const MEMBER_NAV = [
  { section: "My Account" },
  { page: "my-dashboard", label: "My Dashboard", icon: IC.dash },
  { page: "my-profile", label: "My Profile", icon: IC.profile },
  { section: "Mess" },
  { page: "my-meals", label: "Meal Log", icon: IC.meal },
  { page: "my-bazar", label: "Bazar Log", icon: IC.bazar },
  { page: "my-payments", label: "My Payments", icon: IC.rent },
  { page: "mess-overview", label: "Mess Overview", icon: IC.log },
  { page: "my-announce", label: "Announcements", icon: IC.announce },
  { page: "my-chores", label: "Chore Roster", icon: IC.chores },
];

function buildNav() {
  const isManager = currentUser.role === "manager";
  const nav = isManager ? MANAGER_NAV : MEMBER_NAV;

  document.getElementById("sidebar-nav").innerHTML = nav
    .map((i) =>
      i.section
        ? `<div class="nav-section">${i.section}</div>`
        : `<button class="nav-item" onclick="navigate('${i.page}')" data-page="${i.page}">
      ${i.icon}${i.label}
      ${i.page === "notifications" ? `<span class="notif-badge" id="notif-badge" style="display:none">0</span>` : ""}
    </button>`,
    )
    .join("");

  const mobileItems = isManager
    ? [
        { page: "dashboard", label: "Home", icon: IC.dash },
        { page: "meals", label: "Meals", icon: IC.meal },
        { page: "bazar", label: "Bazar", icon: IC.bazar },
        { page: "notifications", label: "Requests", icon: IC.bell },
        { page: "log", label: "Log", icon: IC.log },
      ]
    : [
        { page: "my-dashboard", label: "Home", icon: IC.dash },
        { page: "my-meals", label: "Meals", icon: IC.meal },
        { page: "my-bazar", label: "Bazar", icon: IC.bazar },
        { page: "my-payments", label: "Pay", icon: IC.rent },
        { page: "my-profile", label: "Me", icon: IC.profile },
      ];

  document.getElementById("mobile-nav").innerHTML = mobileItems
    .map(
      (i) =>
        `<button class="mob-nav-btn" onclick="navigate('${i.page}')" data-page="${i.page}">
      ${i.icon}<span>${i.label}</span>
    </button>`,
    )
    .join("");

  if (isManager) refreshNotifBadge();
}

async function refreshNotifBadge() {
  const count = await getPendingCount();
  const badge = document.getElementById("notif-badge");
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = "inline-flex";
  } else {
    badge.style.display = "none";
  }
}

function updateSidebarUser() {
  if (!currentUser) return;
  const isManager = currentUser.role === "manager";
  const idx = members.findIndex((m) => m.id === currentUser.memberId);
  const col = isManager ? { bg: "#2a2218", fg: "#d4a853" } : avatarCol(idx);

  document.getElementById("sidebar-user").innerHTML = `
    <div class="su-avatar" style="background:${col.bg};color:${col.fg}">${initials(currentUser.name)}</div>
    <div class="su-info">
      <div class="su-name">${currentUser.name}</div>
      <div class="su-role">${isManager ? "👑 Manager" : "Member"}</div>
    </div>`;

  const mob = document.getElementById("mob-user-badge");
  if (mob) {
    mob.style.background = col.bg;
    mob.style.color = col.fg;
    mob.textContent = initials(currentUser.name);
  }
}

/* ═══════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════ */
function navigate(page) {
  currentPage = page;
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.toggle("active", n.dataset.page === page));
  document
    .querySelectorAll(".mob-nav-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  const main = document.getElementById("main-content");
  main.innerHTML =
    '<div class="loading" style="min-height:200px"><div class="spinner"></div>Loading…</div>';
  renderPage(page);
}

async function renderPage(page) {
  members = await dbGetMembers();
  updateSidebarUser();
  const main = document.getElementById("main-content");
  const isManager = currentUser.role === "manager";

  // Role guard — only manager can access these pages
  const managerOnly = [
    "dashboard",
    "profiles",
    "meals",
    "bazar",
    "utility",
    "rent",
    "log",
    "members",
    "announce",
    "chores",
    "transfer",
    "notifications",
  ];
  if (!isManager && managerOnly.includes(page)) page = "my-dashboard";

  main.innerHTML = "";
  const div = document.createElement("div");
  div.className = "page-enter";
  div.style.minHeight = "100%";
  main.appendChild(div);

  try {
    switch (page) {
      case "dashboard":
        await renderDashboard(div);
        break;
      case "profiles":
        await renderProfiles(div);
        break;
      case "meals":
        renderMeals(div);
        break;
      case "bazar":
        renderBazar(div);
        break;
      case "utility":
        await renderUtility(div);
        break;
      case "rent":
        renderRent(div);
        break;
      case "log":
        renderLog(div);
        break;
      case "members":
        renderMembers(div);
        break;
      case "announce":
        await renderAnnouncements(div, true);
        break;
      case "chores":
        await renderChores(div, true);
        break;
      case "transfer":
        await renderTransferRole(div);
        break;
      case "my-dashboard":
        await renderMyDashboard(div);
        break;
      case "my-profile":
        await renderMyProfile(div);
        break;
      case "my-meals":
        await renderMyMeals(div);
        break;
      case "my-bazar":
        await renderMyBazar(div);
        break;
      case "my-payments":
        await renderMyPayments(div);
        break;
      case "mess-overview":
        await renderMessOverview(div);
        break;
      case "my-announce":
        await renderAnnouncements(div, false);
        break;
      case "my-chores":
        await renderChores(div, false);
        break;
      case "notifications":
        await renderNotifications(div);
        break;
      default:
        div.innerHTML =
          '<div class="content"><div class="empty">Page not found</div></div>';
    }
  } catch (e) {
    div.innerHTML = `<div class="content"><div class="empty">Error loading page: ${e.message}</div></div>`;
    console.error(e);
  }
}

/* ═══════════════════════════════════════════
   ── ADMIN PAGES ──
═══════════════════════════════════════════ */

/* --- DASHBOARD --- */
async function renderDashboard(el) {
  const { month, year } = thisMonth();
  const key = monthKey(year, month);
  const [allMeals, allBazar, rentRec, utilRes] = await Promise.all([
    dbGetAll("meals"),
    dbGetAll("bazar"),
    dbGetMonth("rent", key),
    sb
      .from("utility_payments")
      .select("*")
      .eq("mess_id", messId())
      .eq("month_key", key)
      .maybeSingle(),
  ]);
  const utilRec = utilRes.data;
  const mM = allMeals.filter((r) => r.date.startsWith(key));
  const mB = allBazar.filter((r) => r.date.startsWith(key));
  let totalMeals = 0,
    totalBazar = 0;
  mM.forEach((r) =>
    Object.values(r.meals || {}).forEach((v) => (totalMeals += Number(v))),
  );
  mB.forEach((r) =>
    Object.values(r.bazar || {}).forEach((v) => (totalBazar += Number(v))),
  );
  const mealRate = totalMeals > 0 ? round2(totalBazar / totalMeals) : 0;
  const totalRentDue =
    rentRec?.entries?.reduce((s, e) => s + Number(e.rent || 0), 0) || 0;
  const totalRentPaid =
    rentRec?.entries?.reduce((s, e) => s + Number(e.paid || 0), 0) || 0;
  const bills = utilRec?.bills || {};
  const totalUtil = ["elec", "wifi", "gas", "khala", "other"].reduce(
    (s, k) => s + (Number(bills[k]) || 0),
    0,
  );
  const totalUtilPaid = Object.values(utilRec?.payments || {}).reduce(
    (s, p) => s + Number(p.paid || 0),
    0,
  );
  const todayStr = today();
  const todayRec = allMeals.find((r) => r.date === todayStr);
  let memBazar = {};
  mB.forEach((r) =>
    Object.entries(r.bazar || {}).forEach(([k, v]) => {
      memBazar[k] = (memBazar[k] || 0) + Number(v);
    }),
  );
  const topBazar = Object.entries(memBazar)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxB = topBazar[0]?.[1] || 1;

  let todayDayTotal = 0,
    todayNightTotal = 0;
  if (todayRec) {
    members.forEach((m) => {
      todayDayTotal += Number(
        todayRec.meals[m.name + "_day"] ?? todayRec.meals[m.name] ?? 0,
      );
      todayNightTotal += Number(todayRec.meals[m.name + "_night"] ?? 0);
    });
    todayDayTotal = round2(todayDayTotal);
    todayNightTotal = round2(todayNightTotal);
  }

  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">Dashboard</div><div class="page-sub">${MONTHS[month]} ${year} — ${members.length} members</div></div>
    <div class="topbar-actions">
      <button class="btn btn-ghost btn-sm" onclick="navigate('announce')">📢 Post notice</button>
      <button class="btn btn-primary btn-sm" onclick="navigate('meals')">+ Meal</button>
    </div>
  </div>
  <div class="content">
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Total meals</div><div class="stat-value">${round2(totalMeals)}</div></div>
      <div class="stat-card"><div class="stat-label">Meal rate</div><div class="stat-value" style="font-size:17px">${fmtTk(mealRate)}</div></div>
      <div class="stat-card"><div class="stat-label">Total bazar</div><div class="stat-value" style="font-size:17px">${fmtTk(totalBazar)}</div></div>
      <div class="stat-card"><div class="stat-label">Utility</div><div class="stat-value" style="font-size:17px">${fmtTk(round2(totalUtilPaid))}<span style="font-size:11px;color:var(--text3)">/${fmtTk(round2(totalUtil))}</span></div></div>
      <div class="stat-card"><div class="stat-label">Rent</div><div class="stat-value" style="font-size:17px">${fmtTk(totalRentPaid)}<span style="font-size:11px;color:var(--text3)">/${fmtTk(totalRentDue)}</span></div></div>
      <div class="stat-card"><div class="stat-label">Days logged</div><div class="stat-value">${mM.length}</div></div>
    </div>

    
   ${
     todayRec
       ? `
<div class="card" style="margin-bottom:14px">
  <div class="card-title">Today's meals — ${todayStr}</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:12px">
    <div class="stat-card badge-blue">
      <div class="stat-label" style="color:var(--blue)">Day meals</div>
      <div class="stat-value" style="color:var(--blue)">${todayDayTotal}</div>
    </div>
    <div class="stat-card badge-amber">
      <div class="stat-label" style="color:var(--amber)">Night meals</div>
      <div class="stat-value" style="color:var(--amber)">${todayNightTotal}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total today</div>
      <div class="stat-value">${round2(todayDayTotal + todayNightTotal)}</div>
    </div>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:8px">
    ${members
      .map((m) => {
        const d = Number(
          todayRec.meals[m.name + "_day"] ?? todayRec.meals[m.name] ?? 0,
        );
        const n = Number(todayRec.meals[m.name + "_night"] ?? 0);
        const t = round2(d + n) || Number(todayRec.meals[m.name] || 0);
        return `<div style="display:flex;align-items:center;gap:8px;background:var(--bg3);padding:7px 12px;border-radius:var(--radius-sm);border:1px solid var(--border)">
        <span style="font-size:13px;font-weight:500;color:${t > 0 ? "var(--text)" : "var(--text3)"}">${m.name}</span>
        ${d > 0 ? `<span class="badge badge-blue">Day ${d}</span>` : ""}
        ${n > 0 ? `<span class="badge badge-amber">Night ${n}</span>` : ""}
        ${t === 0 ? `<span class="badge badge-red">Absent</span>` : ""}
      </div>`;
      })
      .join("")}
  </div>
</div>`
       : `
<div class="card" style="margin-bottom:14px;text-align:center;padding:24px">
  <div style="color:var(--text3);font-size:13px">No meal entry for today yet</div>
  <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="navigate('meals')">+ Add today's meals</button>
</div>`
   }
    <div class="grid-2" style="gap:12px">
      <div class="card">
        <div class="card-title">Bazar leaders — ${MONTHS[month]}</div>
        ${topBazar.length ? topBazar.map(([name, amt]) => `<div class="mini-bar"><div class="mini-bar-label">${name}</div><div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.round((amt / maxB) * 100)}%"></div></div><div class="mini-bar-val">${fmtTk(amt)}</div></div>`).join("") : '<div class="empty">No bazar data</div>'}
      </div>
      <div class="card">
        <div class="card-title">Rent status — ${MONTHS[month]}</div>
        ${
          rentRec?.entries?.length
            ? rentRec.entries
                .map((e) => {
                  const cls =
                    e.status === "paid"
                      ? "badge-green"
                      : e.status === "partial"
                        ? "badge-amber"
                        : "badge-red";
                  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border);margin-bottom:5px">
            <span style="font-size:13px;font-weight:500">${e.name}</span>
            <div style="display:flex;gap:7px;align-items:center">
              <span class="badge ${cls}">${e.status === "paid" ? "Paid" : e.status === "partial" ? "Part" : "Due"}</span>
              <span style="font-size:12px;color:var(--text2)">${fmtTk(e.paid)}/${fmtTk(e.rent)}</span>
            </div>
          </div>`;
                })
                .join("")
            : '<div class="empty">No rent data this month</div>'
        }
      </div>
    </div>
  </div>`;
}

/* --- PROFILES --- */
let selectedProfileId = null;
async function renderProfiles(el) {
  el.innerHTML=`
  <div class="topbar">
    <div><div class="page-title">Member Profiles</div><div class="page-sub">Individual summaries</div></div>
    <div class="topbar-actions">
      <select class="input" id="prof-period" onchange="refreshProfiles()" style="width:180px">
      <option value="1" selected>This month</option>
      <option value="last">Last month</option>
      <option value="3">Last 3 months</option>
      <option value="6">Last 6 months</option>
      <option value="all">All time</option>
      </select>
    </div>
  </div>
  <div class="content">
    <div class="grid-auto" id="profile-card-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px"></div>
  </div>`;
  await loadProfiles();
}

async function loadProfiles() {
  const [allMeals, allBazar, allRent, { data: allUtil }] = await Promise.all([
    dbGetAll("meals"),
    dbGetAll("bazar"),
    dbGetAll("rent"),
    sb.from("utility_payments").select("*").eq("mess_id", messId()),
  ]);
  buildProfileCards(allMeals, allBazar, allRent, allUtil || []);
  if (selectedProfileId)
    showProfileDetail(
      selectedProfileId,
      allMeals,
      allBazar,
      allRent,
      allUtil || [],
    );
}

async function refreshProfiles() {
  await loadProfiles();
}

function getFilteredData(allM, allB, allR, period, allU=[]) {
  if(period === 'all') return {meals:allM, bazar:allB, rent:allR, utility:allU};

  // Last month specifically
  if(period === 'last') {
    const now = new Date();
    let m = now.getMonth() - 1, y = now.getFullYear();
    if(m < 0) { m = 11; y--; }
    const key = y + '-' + String(m+1).padStart(2,'0');
    return {
      meals:   allM.filter(r => r.date.slice(0,7) === key),
      bazar:   allB.filter(r => r.date.slice(0,7) === key),
      rent:    allR.filter(r => r.month_key === key),
      utility: allU.filter(r => r.month_key === key),
    };
  }

  // This month (1) or last N months (3, 6)
  const months = parseInt(period);
  const now = new Date();
  let cm = now.getMonth() - months + 1, cy = now.getFullYear();
  while(cm < 0) { cm += 12; cy--; }
  const cut = cy + '-' + String(cm+1).padStart(2,'0');
  return {
    meals:   allM.filter(r => r.date.slice(0,7) >= cut),
    bazar:   allB.filter(r => r.date.slice(0,7) >= cut),
    rent:    allR.filter(r => r.month_key >= cut),
    utility: allU.filter(r => r.month_key >= cut),
  };
}

function getMemberStats(member, meals, bazar, rent, utility = []) {
  let tm = 0,
    tb = 0,
    rd = 0,
    rp = 0,
    ud = 0,
    up = 0,
    ad = 0;
  const byM = {};
  const em = (k) => {
    byM[k] = byM[k] || { meals: 0, bazar: 0, rentPaid: 0, utilityPaid: 0 };
  };
  meals.forEach((r) => {
    const d = Number(r.meals[member.name + "_day"] ?? 0),
      n = Number(r.meals[member.name + "_night"] ?? 0);
    const v = round2(d + n) || Number(r.meals[member.name] || 0);
    tm += v;
    if (v > 0) ad++;
    const k = r.date.slice(0, 7);
    em(k);
    byM[k].meals += v;
  });
  bazar.forEach((r) => {
    const v = Number(r.bazar[member.name] || 0);
    tb += v;
    const k = r.date.slice(0, 7);
    em(k);
    byM[k].bazar += v;
  });
  rent.forEach((r) => {
    const e = r.entries?.find((x) => x.name === member.name);
    if (e) {
      rd += Number(e.rent || 0);
      rp += Number(e.paid || 0);
      em(r.month_key);
      byM[r.month_key].rentPaid += Number(e.paid || 0);
    }
  });
  utility.forEach((r) => {
    const bills = r.bills || {};
    const total = ["elec", "wifi", "gas", "khala", "other"].reduce(
      (s, k) => s + (Number(bills[k]) || 0),
      0,
    );
    const perHead = members.length > 0 ? round2(total / members.length) : 0;
    const p = (r.payments || {})[member.name] || {};
    ud += perHead;
    up += Number(p.paid || 0);
    em(r.month_key);
    byM[r.month_key].utilityPaid += Number(p.paid || 0);
  });
  const allMealsTotal = meals.reduce(
    (s, r) =>
      s + Object.values(r.meals || {}).reduce((a, v) => a + Number(v), 0),
    0,
  );
  const allBazarTotal = bazar.reduce(
    (s, r) =>
      s + Object.values(r.bazar || {}).reduce((a, v) => a + Number(v), 0),
    0,
  );
  const mr = allMealsTotal > 0 ? allBazarTotal / allMealsTotal : 0;
  const mc = round2(tm * mr);
  const days = meals.length;
  const latestR = [...rent].sort((a, b) =>
    b.month_key.localeCompare(a.month_key),
  )[0];
  const latestRS =
    latestR?.entries?.find((x) => x.name === member.name)?.status || "unpaid";
  const latestU = [...utility].sort((a, b) =>
    b.month_key.localeCompare(a.month_key),
  )[0];
  const latestUS = (latestU?.payments || {})[member.name]?.status || "unpaid";
  return {
    totalMeals: round2(tm),
    totalBazar: tb,
    mealRate: round2(mr),
    mealCost: mc,
    mealBalance: round2(tb - mc),
    rentDue: rd,
    rentPaid: rp,
    utilityDue: round2(ud),
    utilityPaid: round2(up),
    activeDays: ad,
    avgMeals: days > 0 ? round2(tm / days) : 0,
    latestStatus: latestRS,
    latestUtilStatus: latestUS,
    byMonth: byM,
  };
}

function buildProfileCards(allM, allB, allR, allU) {
  const period = document.getElementById('prof-period')?.value || '1';
  const {meals, bazar, rent, utility} = getFilteredData(allM, allB, allR, period, allU);
  const grid = document.getElementById('profile-card-grid'); if(!grid) return;
  if(!members.length){ grid.innerHTML='<div class="empty">No members yet.</div>'; return; }

  grid.innerHTML = members.map((m, i) => {
    const s = getMemberStats(m, meals, bazar, rent, utility);
    const col = avatarCol(i);
    const rc = s.latestStatus==='paid'?'badge-green':s.latestStatus==='partial'?'badge-amber':'badge-red';
    const uc = s.latestUtilStatus==='paid'?'badge-green':s.latestUtilStatus==='partial'?'badge-amber':'badge-red';
    const rentLabel = s.latestStatus==='paid'?'Rent ✓':s.latestStatus==='partial'?'Rent partial':'Rent due';
    const utilLabel = s.latestUtilStatus==='paid'?'Utility ✓':s.latestUtilStatus==='partial'?'Utility partial':'Utility due';

    return `<div class="profile-card" onclick="selectProfile('${m.id}')" style="padding:16px">

      <!-- Header: Avatar + Name + Badges -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div class="avatar" style="background:${col.bg};color:${col.fg};width:40px;height:40px;font-size:14px;flex-shrink:0">${initials(m.name)}</div>
        <div>
          <div style="font-weight:700;font-size:15px;margin-bottom:4px">${m.name}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <span class="badge ${rc}" style="font-size:10px">${rentLabel}</span>
            <span class="badge ${uc}" style="font-size:10px">${utilLabel}</span>
          </div>
        </div>
      </div>

      <!-- Stats grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="stat-card" style="padding:10px;border-radius:var(--radius-sm)">
          <div class="stat-label" style="font-size:11px;margin-bottom:4px">Meals</div>
          <div style="font-size:20px;font-weight:700">${s.totalMeals}</div>
        </div>
        <div class="stat-card" style="padding:10px;border-radius:var(--radius-sm)">
          <div class="stat-label" style="font-size:11px;margin-bottom:4px">Avg/day</div>
          <div style="font-size:20px;font-weight:700">${s.avgMeals}</div>
        </div>
        <div class="stat-card" style="padding:10px;border-radius:var(--radius-sm)">
          <div class="stat-label" style="font-size:11px;margin-bottom:4px">Bazar</div>
          <div style="font-size:16px;font-weight:700">${fmtTk(s.totalBazar)}</div>
        </div>
        <div class="stat-card" style="padding:10px;border-radius:var(--radius-sm)">
          <div class="stat-label" style="font-size:11px;margin-bottom:4px">Utility paid</div>
          <div style="font-size:16px;font-weight:700;color:var(--green)">${fmtTk(round2(s.utilityPaid))}</div>
        </div>
        <div class="stat-card" style="padding:10px;border-radius:var(--radius-sm);grid-column:span 2">
          <div class="stat-label" style="font-size:11px;margin-bottom:4px">Rent paid</div>
          <div style="font-size:16px;font-weight:700;color:var(--green)">${fmtTk(s.rentPaid)}</div>
        </div>
      </div>

    </div>`;
  }).join('');
}

async function selectProfile(id) {
  const [allM, allB, allR, { data: allU }] = await Promise.all([
    dbGetAll("meals"),
    dbGetAll("bazar"),
    dbGetAll("rent"),
    sb.from("utility_payments").select("*").eq("mess_id", messId()),
  ]);
  showProfileDetail(id, allM, allB, allR, allU || []);
}

function showProfileDetail(id, allM, allB, allR, allU) {
  const member = members.find((m) => m.id === id);
  if (!member) return;
  const period = document.getElementById("prof-period")?.value || "1";
  const { meals, bazar, rent, utility } = getFilteredData(
    allM,
    allB,
    allR,
    period,
    allU,
  );
  const s = getMemberStats(member, meals, bazar, rent, utility);
  const col = avatarCol(members.indexOf(member));
  const allMK = Object.keys(s.byMonth).sort(),
    r8 = allMK.slice(-8);
  const maxM = Math.max(...r8.map((k) => s.byMonth[k]?.meals || 0), 1);

  // Balances
  const mealNet = s.mealBalance;
  const rentNet = round2(s.rentPaid - s.rentDue);
  const utilNet = round2(s.utilityPaid - s.utilityDue);

  // Share in mess (all time)
  const allMealsTotal = allM.reduce(
    (s, r) =>
      s + Object.values(r.meals || {}).reduce((a, v) => a + Number(v), 0),
    0,
  );
  const allBazarTotal = allB.reduce(
    (s, r) =>
      s + Object.values(r.bazar || {}).reduce((a, v) => a + Number(v), 0),
    0,
  );
  const mealShare =
    allMealsTotal > 0 ? Math.round((s.totalMeals / allMealsTotal) * 100) : 0;
  const bazarShare =
    allBazarTotal > 0 ? Math.round((s.totalBazar / allBazarTotal) * 100) : 0;

  document.getElementById("modal-content").innerHTML = `

    <!-- HEADER -->
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:14px">
        <div class="avatar" style="width:50px;height:50px;font-size:16px;background:${col.bg};color:${col.fg};border:2px solid var(--accent)">${initials(member.name)}</div>
        <div>
          <div style="font-family:var(--font-serif);font-size:22px;font-weight:600">${member.name}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px">
            Default rent: ${fmtTk(member.rent || 0)} / month · @${member.username || "—"}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        <div style="text-align:right">
          <div style="font-size:11px;color:var(--text3);margin-bottom:3px">Meal pay / get</div>
          <div style="font-size:18px;font-weight:700" class="${mealNet >= 0 ? "net-pos" : "net-neg"}">
            ${mealNet >= 0 ? "Get " : "Pay "}${fmtTk(Math.abs(mealNet))}
          </div>
        </div>
        <div style="text-align:right;padding-left:20px;border-left:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text3);margin-bottom:3px">Rent balance</div>
          <div style="font-size:18px;font-weight:700" class="${rentNet >= 0 ? "net-pos" : "net-neg"}">
            ${rentNet >= 0 ? "+" : ""}${fmtTk(rentNet)}
          </div>
        </div>
        <div style="text-align:right;padding-left:20px;border-left:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text3);margin-bottom:3px">Utility balance</div>
          <div style="font-size:18px;font-weight:700" class="${utilNet >= 0 ? "net-pos" : "net-neg"}">
            ${utilNet >= 0 ? "+" : ""}${fmtTk(utilNet)}
          </div>
        </div>
      </div>
    </div>

    <!-- STAT CARDS -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:18px">
      ${[
        ["Total meals", s.totalMeals, null],
        ["Active days", s.activeDays, null],
        ["Avg / day", s.avgMeals, null],
        ["Bazar spent", fmtTk(s.totalBazar), null],
        ["Meal cost", fmtTk(s.mealCost), null],
        ["Rent due", fmtTk(s.rentDue), null],
        ["Rent paid", fmtTk(s.rentPaid), "var(--green)"],
        ["Utility due", fmtTk(round2(s.utilityDue)), null],
        ["Utility paid", fmtTk(round2(s.utilityPaid)), "var(--green)"],
      ]
        .map(
          ([l, v, c]) => `
        <div class="stat-card" style="padding:10px">
          <div class="stat-label">${l}</div>
          <div style="font-size:15px;font-weight:600;margin-top:4px${c ? ";color:" + c : ""}">${v}</div>
        </div>`,
        )
        .join("")}
    </div>

    <!-- SHARE IN MESS -->
    <div class="detail-section">
      <div class="detail-section-title">Share in mess (all time)</div>
      <div style="margin-bottom:10px">
        <div class="mini-bar">
          <div class="mini-bar-label">Meal share</div>
          <div class="mini-bar-track" style="height:8px">
            <div class="mini-bar-fill" style="width:${mealShare}%"></div>
          </div>
          <div class="mini-bar-val">${mealShare}%</div>
        </div>
        <div class="mini-bar">
          <div class="mini-bar-label">Bazar share</div>
          <div class="mini-bar-track" style="height:8px">
            <div class="mini-bar-fill" style="width:${bazarShare}%"></div>
          </div>
          <div class="mini-bar-val">${bazarShare}%</div>
        </div>
      </div>
    </div>

    <!-- MONTHLY MEAL HISTORY -->
    <div class="detail-section">
      <div class="detail-section-title">Monthly meal history</div>
      ${
        r8.length
          ? `
        <div class="hist-labels" style="margin-bottom:4px">
          ${r8.map((k) => `<span>${MONTHS[parseInt(k.slice(5)) - 1].slice(0, 3)}</span>`).join("")}
        </div>
        <div class="hist-wrap">
          ${r8
            .map((k) => {
              const v = s.byMonth[k]?.meals || 0;
              const h = Math.max(Math.round((v / maxM) * 44), 3);
              return `<div class="hist-b" style="height:${h}px">
              <div class="tip">${MONTHS[parseInt(k.slice(5)) - 1].slice(0, 3)}: ${v}</div>
            </div>`;
            })
            .join("")}
        </div>`
          : '<div style="color:var(--text3);font-size:13px">No history</div>'
      }
    </div>

    <!-- RECENT MONTHS BREAKDOWN -->
    <div class="detail-section">
      <div class="detail-section-title">Recent months breakdown</div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Month</th><th>Meals</th><th>Bazar</th><th>Rent paid</th><th>Utility paid</th></tr></thead>
        <tbody>
          ${allMK
            .slice(-6)
            .reverse()
            .map((k) => {
              const d = s.byMonth[k] || {};
              return `<tr>
              <td>${MONTHS[parseInt(k.slice(5)) - 1]} ${k.slice(0, 4)}</td>
              <td>${d.meals || 0}</td>
              <td>${fmtTk(d.bazar || 0)}</td>
              <td style="color:var(--green)">${fmtTk(d.rentPaid || 0)}</td>
              <td style="color:var(--green)">${fmtTk(d.utilityPaid || 0)}</td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table></div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    </div>`;

  document.querySelector(".modal").classList.add("modal-wide");
  openModal();
}

/* --- MEAL ENTRY --- */
const mealDayVals = {},
  mealNightVals = {};
function renderMeals(el) {
  el.innerHTML=`
  <div class="topbar"><div><div class="page-title">Meal Entry</div><div class="page-sub">Log day & night meals per member</div></div></div>
  <div class="content">
    <div class="card" style="margin-bottom:12px">
      <div class="date-row">
        <label>Date</label>
        <input type="date" class="input" id="meal-date" value="${today()}" style="width:170px" onchange="loadMealDate()"/>
        <button class="btn btn-ghost btn-sm" onclick="loadMealDate()">Load</button>
      </div>
      <div class="stat-grid" style="margin-bottom:12px">
        <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value" id="mt-total">0</div></div>
        <div class="stat-card"><div class="stat-label">Day</div><div class="stat-value" id="mt-day">0</div></div>
        <div class="stat-card"><div class="stat-label">Night</div><div class="stat-value" id="mt-night">0</div></div>
        <div class="stat-card"><div class="stat-label">Eating</div><div class="stat-value" id="mt-eating">0</div></div>
      </div>
      <div class="meal-grid" id="meal-grid"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        <button class="btn btn-primary" onclick="saveMeals()">Save meals</button>
        <button class="btn btn-ghost" onclick="setAllMeals('day', 1)">Day All → 1</button>
        <button class="btn btn-ghost" onclick="setAllMeals('night', 1)">Night All → 1</button>
        <button class="btn btn-ghost" onclick="setAllMeals('both', 1)">All → 1</button>
        <button class="btn btn-ghost" onclick="setAllMeals('both', 0)">Clear</button>
      </div>
    </div>
    <div class="card"><div class="card-title">Recent entries</div><div class="tbl-wrap" id="meals-tbl"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
  </div>`;

  // Default all to 0 on fresh render
  members.forEach(m => {
    mealDayVals[m.id]   = 0;
    mealNightVals[m.id] = 0;
  });

  buildMealGrid();
  loadMealDate();
  loadMealsRecent();
}

function buildMealGrid() {
  const g = document.getElementById('meal-grid'); if(!g) return;
  g.innerHTML = members.map(m => `
    <div class="meal-cell">
      <div class="meal-cell-name">${m.name}</div>
      <div class="meal-cell-row">
        <span class="meal-cell-label">Day</span>
        <input type="number" class="meal-num-input" id="md-${m.id}" min="0" max="4" step="0.5" value="${mealDayVals[m.id] ?? 0}" oninput="updMealSum()"/>
      </div>
      <div class="meal-cell-row">
        <span class="meal-cell-label">Night</span>
        <input type="number" class="meal-num-input" id="mn-${m.id}" min="0" max="4" step="0.5" value="${mealNightVals[m.id] ?? 0}" oninput="updMealSum()"/>
      </div>
    </div>`).join('');
  updMealSum();
}

function updMealSum() {
  let d = 0,
    n = 0,
    e = 0;
  members.forEach((m) => {
    const dv = parseFloat(document.getElementById("md-" + m.id)?.value || 0),
      nv = parseFloat(document.getElementById("mn-" + m.id)?.value || 0);
    mealDayVals[m.id] = dv;
    mealNightVals[m.id] = nv;
    d += dv;
    n += nv;
    if (dv > 0 || nv > 0) e++;
  });
  const te = document.getElementById("mt-total"),
    td = document.getElementById("mt-day"),
    tn = document.getElementById("mt-night"),
    ce = document.getElementById("mt-eating");
  if (te) te.textContent = round2(d + n);
  if (td) td.textContent = round2(d);
  if (tn) tn.textContent = round2(n);
  if (ce) ce.textContent = e;
}

function setAllMeals(target, v) {
  members.forEach(m => {
    if(target === 'day' || target === 'both') {
      const de = document.getElementById('md-' + m.id);
      if(de) de.value = v;
      mealDayVals[m.id] = v;
    }
    if(target === 'night' || target === 'both') {
      const ne = document.getElementById('mn-' + m.id);
      if(ne) ne.value = v;
      mealNightVals[m.id] = v;
    }
  });
  updMealSum();
}

async function loadMealDate() {
  const date = document.getElementById("meal-date")?.value;
  if (!date) return;
  const { data: rec } = await sb
    .from("meals")
    .select("*")
    .eq("mess_id", messId())
    .eq("date", date)
    .maybeSingle();
  if (rec) {
    members.forEach((m) => {
      mealDayVals[m.id] = Number(
        rec.meals[m.name + "_day"] ?? rec.meals[m.name] ?? 0,
      );
      mealNightVals[m.id] = Number(rec.meals[m.name + "_night"] ?? 0);
    });
    buildMealGrid();
    toast("Loaded entry for " + date);
  } else {
    members.forEach((m) => {
      mealDayVals[m.id] = 1;
      mealNightVals[m.id] = 1;
    });
    buildMealGrid();
  }
}

async function saveMeals() {
  const date = document.getElementById("meal-date")?.value;
  if (!date) {
    toast("Select a date");
    return;
  }
  const meals = {};
  members.forEach((m) => {
    meals[m.name + "_day"] = mealDayVals[m.id] || 0;
    meals[m.name + "_night"] = mealNightVals[m.id] || 0;
    meals[m.name] = round2(
      (mealDayVals[m.id] || 0) + (mealNightVals[m.id] || 0),
    );
  });
  try {
    await dbUpsertMeals(date, meals);
    toast("Meals saved", "success");
    loadMealsRecent();
  } catch (e) {
    toast("Save failed: " + e.message, "error");
  }
}

async function loadMealsRecent() {
  const wrap = document.getElementById("meals-tbl");
  if (!wrap) return;
  const all = await dbGetAll("meals");
  const recent = all.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  if (!recent.length) {
    wrap.innerHTML = '<div class="empty">No meal entries yet</div>';
    return;
  }
  wrap.innerHTML = `<table><thead><tr><th>Date</th>${members.map((m) => `<th>${m.name}</th>`).join("")}<th>Total</th><th></th></tr></thead>
    <tbody>${recent
      .map((r) => {
        let t = 0;
        const cells = members
          .map((m) => {
            const d = Number(r.meals[m.name + "_day"] ?? 0),
              n = Number(r.meals[m.name + "_night"] ?? 0),
              v = round2(d + n) || Number(r.meals[m.name] ?? 0);
            t += v;
            return `<td>${v}</td>`;
          })
          .join("");
        return `<tr><td>${r.date}</td>${cells}<td><b>${round2(t)}</b></td><td><button class="btn btn-ghost btn-sm btn-icon" onclick="delMeal('${r.id}')">✕</button></td></tr>`;
      })
      .join("")}</tbody></table>`;
}
async function delMeal(id) {
  if (!confirm("Delete?")) return;
  try {
    await dbDelete("meals", id);
    toast("Deleted");
    loadMealsRecent();
  } catch (e) {
    toast("Error", "error");
  }
}

/* --- BAZAR ENTRY --- */
function renderBazar(el) {
  el.innerHTML = `<div class="topbar"><div><div class="page-title">Bazar Entry</div><div class="page-sub">Log grocery spending per member</div></div></div>
  <div class="content">
    <div class="card" style="margin-bottom:12px">
      <div class="date-row"><label>Date</label><input type="date" class="input" id="bazar-date" value="${today()}" style="width:170px" onchange="loadBazarDate()"/><button class="btn btn-ghost btn-sm" onclick="loadBazarDate()">Load</button></div>
      <div class="meal-grid" id="bazar-grid"></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary" onclick="saveBazar()">Save bazar</button>
        <button class="btn btn-ghost" onclick="clearBazar()">Clear</button>
        <span style="font-size:13px;color:var(--text2)">Total: <b id="bazar-tot">৳0</b></span>
      </div>
    </div>
    <div class="card"><div class="card-title">Recent entries</div><div class="tbl-wrap" id="bazar-tbl"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
  </div>`;
  buildBazarGrid();
  loadBazarRecent();
}
function buildBazarGrid() {
  const g = document.getElementById("bazar-grid");
  if (!g) return;
  g.innerHTML = members
    .map(
      (m) =>
        `<div class="meal-cell"><div class="meal-cell-name">${m.name}</div><div class="meal-cell-row"><span class="meal-cell-label">৳</span><input type="number" class="meal-num-input" id="bz-${m.id}" min="0" placeholder="0" oninput="updBazarSum()"/></div></div>`,
    )
    .join("");
}
function updBazarSum() {
  let b = 0;
  members.forEach((m) => {
    b += parseFloat(document.getElementById("bz-" + m.id)?.value || 0);
  });
  const bt = document.getElementById("bazar-tot");
  if (bt) bt.textContent = fmtTk(b);
}
async function loadBazarDate() {
  const date = document.getElementById("bazar-date")?.value;
  if (!date) return;
  const { data: rec } = await sb
    .from("bazar")
    .select("*")
    .eq("mess_id", messId())
    .eq("date", date)
    .maybeSingle();
  if (rec) {
    members.forEach((m) => {
      const e = document.getElementById("bz-" + m.id);
      if (e) e.value = rec.bazar[m.name] ?? 0;
    });
    updBazarSum();
    toast("Loaded");
  }
}
function clearBazar() {
  members.forEach((m) => {
    const e = document.getElementById("bz-" + m.id);
    if (e) e.value = "";
  });
  updBazarSum();
}
async function saveBazar() {
  const date = document.getElementById("bazar-date")?.value;
  if (!date) {
    toast("Select a date");
    return;
  }
  const bazar = {};
  members.forEach((m) => {
    bazar[m.name] = parseFloat(
      document.getElementById("bz-" + m.id)?.value || 0,
    );
  });
  try {
    await dbUpsertBazar(date, bazar);
    toast("Bazar saved", "success");
    loadBazarRecent();
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}
async function loadBazarRecent() {
  const wrap = document.getElementById("bazar-tbl");
  if (!wrap) return;
  const all = await dbGetAll("bazar");
  const recent = all.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  if (!recent.length) {
    wrap.innerHTML = '<div class="empty">No bazar entries</div>';
    return;
  }
  wrap.innerHTML = `<table><thead><tr><th>Date</th>${members.map((m) => `<th>${m.name}</th>`).join("")}<th>Total</th><th></th></tr></thead><tbody>${recent
    .map((r) => {
      const bt = Object.values(r.bazar || {}).reduce(
        (s, v) => s + Number(v),
        0,
      );
      return `<tr><td>${r.date}</td>${members.map((m) => `<td>${r.bazar[m.name] != null ? fmtTk(r.bazar[m.name]) : "—"}</td>`).join("")}<td><b>${fmtTk(bt)}</b></td><td><button class="btn btn-ghost btn-sm btn-icon" onclick="delBazar('${r.id}')">✕</button></td></tr>`;
    })
    .join("")}</tbody></table>`;
}
async function delBazar(id) {
  if (!confirm("Delete?")) return;
  try {
    await dbDelete("bazar", id);
    toast("Deleted");
    loadBazarRecent();
  } catch (e) {
    toast("Error", "error");
  }
}

/* --- UTILITY --- */
async function renderUtility(el) {
  const n = new Date();
  el.innerHTML = `<div class="topbar"><div><div class="page-title">Utility Entry</div><div class="page-sub">Track bills & payments</div></div></div>
  <div class="content">
    <div class="month-sel"><label>Month</label><select class="input" id="ut-month" style="width:180px">${MONTHS.map((m, i) => `<option value="${i}"${i === n.getMonth() ? " selected" : ""}>${m}</option>`).join("")}</select><label>Year</label><select class="input" id="ut-year" style="width:90px">${Array.from(
      { length: 5 },
      (_, i) => 2023 + i,
    )
      .map(
        (y) =>
          `<option${y === n.getFullYear() ? " selected" : ""}>${y}</option>`,
      )
      .join(
        "",
      )}</select><button class="btn btn-ghost" onclick="loadUtilMonth()">Load</button></div>
    <div class="card" style="margin-bottom:12px">
      <!-- Prepaid bills -->
      <div class="card-title">Prepaid bills</div>
      <div class="util-fields">
        ${['elec','wifi','gas','other'].map(k=>`
          <div class="field" style="margin:0">
            <label>${{elec:'Electricity',wifi:'WiFi',gas:'Gas',other:'Other'}[k]} (৳)</label>
            <input type="number" class="input" id="ut-${k}" min="0" placeholder="0" oninput="updUtilSum()"/>
          </div>`).join('')}
      </div>

      <!-- Postpaid -->
      <div class="card-title" style="margin-top:14px">Postpaid (Khala)</div>
      <div class="util-fields">
        <div class="field" style="margin:0">
          <label>Khala salary (৳)</label>
          <input type="number" class="input" id="ut-khala" min="0" placeholder="0" oninput="updUtilSum()"/>
        </div>
      </div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">Member payments</div>
      <div class="tbl-wrap"><table><thead><tr><th>Member</th><th>Share</th><th>Paid (৳)</th><th>Status</th><th>Notes</th></tr></thead><tbody id="ut-tbody"></tbody></table></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-primary" onclick="saveUtility()">Save</button>
        <button class="btn btn-ghost" onclick="markAllUtilPaid()">Mark all paid</button>
        <button class="btn btn-ghost" onclick="clearUtil()">Clear bills</button>
      </div>
    </div>
    <div class="card"><div class="card-title">History</div><div class="tbl-wrap" id="ut-history"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
  </div>`;
  loadUtilMonth();
  loadUtilHistory();
}
function getUtilTotal() {
  return ["elec", "wifi", "gas", "khala", "other"].reduce(
    (s, k) => s + parseFloat(document.getElementById("ut-" + k)?.value || 0),
    0,
  );
}
function updUtilSum() {
  const total = getUtilTotal(),
    perHead = members.length > 0 ? round2(total / members.length) : 0;
  const te = document.getElementById("ut-total"),
    tp = document.getElementById("ut-per");
  if (te) te.textContent = fmtTk(total);
  if (tp) tp.textContent = fmtTk(perHead);
  buildUtilRows(perHead);
  updUtilCollected();
}
function buildUtilRows(perHead) {
  const tbody = document.getElementById("ut-tbody");
  if (!tbody || tbody.hasChildNodes()) return;
  tbody.innerHTML = members
    .map(
      (m) =>
        `<tr><td><b>${m.name}</b></td><td id="us-${m.id}">${fmtTk(perHead)}</td><td><input type="number" class="input input-sm" id="up-${m.id}" value="0" style="width:90px" oninput="updUtilCollected()"/></td><td><select class="input input-sm" id="ust-${m.id}" style="width:100px"><option value="unpaid">Not paid</option><option value="paid">Paid</option><option value="partial">Partial</option></select></td><td><input type="text" class="input input-sm" id="un-${m.id}" placeholder="—" style="width:100px"/></td></tr>`,
    )
    .join("");
}
function updUtilCollected() {
  let collected = 0;
  members.forEach((m) => {
    collected += parseFloat(document.getElementById("up-" + m.id)?.value || 0);
  });
  const total = getUtilTotal();
  const ce = document.getElementById("ut-collected"),
    oe = document.getElementById("ut-outstanding");
  if (ce) ce.textContent = fmtTk(round2(collected));
  if (oe) oe.textContent = fmtTk(Math.max(0, round2(total - collected)));
  const tbody = document.getElementById("ut-tbody");
  const perHead = members.length > 0 ? round2(total / members.length) : 0;
  if (tbody)
    members.forEach((m) => {
      const sc = document.getElementById("us-" + m.id);
      if (sc) sc.textContent = fmtTk(perHead);
    });
}
function markAllUtilPaid() {
  const perHead =
    members.length > 0 ? round2(getUtilTotal() / members.length) : 0;
  members.forEach((m) => {
    const pp = document.getElementById("up-" + m.id),
      ps = document.getElementById("ust-" + m.id);
    if (pp) pp.value = perHead;
    if (ps) ps.value = "paid";
  });
  updUtilCollected();
}
function clearUtil() {
  ["elec", "wifi", "gas", "khala", "other"].forEach((k) => {
    const e = document.getElementById("ut-" + k);
    if (e) e.value = "";
  });
  updUtilSum();
}
async function loadUtilMonth() {
  const month = parseInt(document.getElementById("ut-month")?.value || 0),
    year = parseInt(
      document.getElementById("ut-year")?.value || new Date().getFullYear(),
    ),
    key = monthKey(year, month);
  const { data: rec } = await sb
    .from("utility_payments")
    .select("*")
    .eq("mess_id", messId())
    .eq("month_key", key)
    .maybeSingle();
  if (rec) {
    const u = rec.bills || {};
    ["elec", "wifi", "gas", "khala", "other"].forEach((k) => {
      const e = document.getElementById("ut-" + k);
      if (e) e.value = u[k] || 0;
    });
    const total = ["elec", "wifi", "gas", "khala", "other"].reduce(
        (s, k) => s + (u[k] || 0),
        0,
      ),
      perHead = members.length > 0 ? round2(total / members.length) : 0;
    const tbody = document.getElementById("ut-tbody");
    if (tbody && !tbody.hasChildNodes()) buildUtilRows(perHead);
    const payments = rec.payments || {};
    members.forEach((m) => {
      const p = payments[m.name] || {};
      const pp = document.getElementById("up-" + m.id),
        ps = document.getElementById("ust-" + m.id),
        pn = document.getElementById("un-" + m.id),
        sc = document.getElementById("us-" + m.id);
      if (pp) pp.value = p.paid ?? 0;
      if (ps) ps.value = p.status || "unpaid";
      if (pn) pn.value = p.notes || "";
      if (sc) sc.textContent = fmtTk(perHead);
    });
    updUtilCollected();
  } else updUtilSum();
}
async function saveUtility() {
  const month = parseInt(document.getElementById("ut-month")?.value || 0),
    year = parseInt(
      document.getElementById("ut-year")?.value || new Date().getFullYear(),
    ),
    key = monthKey(year, month);
  const bills = {
    elec: parseFloat(document.getElementById("ut-elec")?.value || 0),
    wifi: parseFloat(document.getElementById("ut-wifi")?.value || 0),
    gas: parseFloat(document.getElementById("ut-gas")?.value || 0),
    khala: parseFloat(document.getElementById("ut-khala")?.value || 0),
    other: parseFloat(document.getElementById("ut-other")?.value || 0),
  };
  const payments = {};
  members.forEach((m) => {
    payments[m.name] = {
      paid: parseFloat(document.getElementById("up-" + m.id)?.value || 0),
      status: document.getElementById("ust-" + m.id)?.value || "unpaid",
      notes: document.getElementById("un-" + m.id)?.value || "",
    };
  });
  try {
    await dbUpsertUtility(month, year, key, bills, payments);
    toast("Saved", "success");
    loadUtilHistory();
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}
async function loadUtilHistory() {
  const wrap = document.getElementById("ut-history");
  if (!wrap) return;
  const { data: all } = await sb
    .from("utility_payments")
    .select("*")
    .eq("mess_id", messId())
    .order("month_key", { ascending: false });
  if (!all?.length) {
    wrap.innerHTML = '<div class="empty">No utility records</div>';
    return;
  }
  wrap.innerHTML = `<table><thead><tr><th>Month</th><th>Total</th><th>Per member</th>${members.map((m) => `<th>${m.name}</th>`).join("")}<th>Collected</th></tr></thead><tbody>${all
    .slice(0, 12)
    .map((r) => {
      const bills = r.bills || {},
        total = ["elec", "wifi", "gas", "khala", "other"].reduce(
          (s, k) => s + (bills[k] || 0),
          0,
        ),
        perHead = members.length > 0 ? round2(total / members.length) : 0,
        payments = r.payments || {};
      let collected = 0;
      const mc = members
        .map((m) => {
          const p = payments[m.name] || {};
          collected += Number(p.paid || 0);
          const cls =
            p.status === "paid"
              ? "badge-green"
              : p.status === "partial"
                ? "badge-amber"
                : "badge-red";
          return `<td><span class="badge ${cls}">${p.status === "paid" ? "Paid" : p.status === "partial" ? "Part" : "Due"}</span></td>`;
        })
        .join("");
      return `<tr><td><b>${r.month_name} ${r.year}</b></td><td>${fmtTk(total)}</td><td>${fmtTk(perHead)}</td>${mc}<td style="color:var(--green)"><b>${fmtTk(round2(collected))}</b></td></tr>`;
    })
    .join("")}</tbody></table>`;
}

/* --- RENT --- */
function renderRent(el) {
  const n = new Date();
  el.innerHTML = `<div class="topbar"><div><div class="page-title">Room Rent</div><div class="page-sub">Track monthly rent collection</div></div></div><div class="content"><div class="month-sel"><label>Month</label><select class="input" id="rent-month" style="width:180px">${MONTHS.map((m, i) => `<option value="${i}"${i === n.getMonth() ? " selected" : ""}>${m}</option>`).join("")}</select><label>Year</label><select class="input" id="rent-year" style="width:90px">${Array.from(
    { length: 5 },
    (_, i) => 2023 + i,
  )
    .map(
      (y) => `<option${y === n.getFullYear() ? " selected" : ""}>${y}</option>`,
    )
    .join(
      "",
    )}</select><button class="btn btn-ghost" onclick="loadRentMonth()">Load</button></div><div class="stat-grid" id="rent-stats"></div><div class="card" style="margin-bottom:12px"><div class="card-title">Rent entries</div><div class="tbl-wrap"><table><thead><tr><th>Member</th><th>Default</th><th>Paid (৳)</th><th>Status</th><th>Notes</th></tr></thead><tbody id="rent-tbody"></tbody></table></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn btn-primary" onclick="saveRent()">Save rent</button><button class="btn btn-ghost" onclick="markAllRentPaid()">Mark all paid</button></div></div><div class="card"><div class="card-title">History</div><div class="tbl-wrap" id="rent-history"></div></div></div>`;
  loadRentMonth();
  loadRentHistory();
}
async function loadRentMonth() {
  // Always re-fetch members first to get latest default rents
  members = await dbGetMembers();

  const month = parseInt(document.getElementById('rent-month')?.value || 0);
  const year  = parseInt(document.getElementById('rent-year')?.value  || new Date().getFullYear());
  const key   = monthKey(year, month);

  const {data:rec} = await sb.from('rent').select('*')
    .eq('mess_id', messId()).eq('month_key', key).maybeSingle();

  const tbody = document.getElementById('rent-tbody'); if(!tbody) return;

  tbody.innerHTML = members.map(m => {
    // If existing record has an entry for this member use it,
    // otherwise fall back to current default rent from members table
    const e       = rec?.entries?.find(x => x.name === m.name) || {};
    const due = m.rent || 0;  // always use current default rent, not stale DB value
    const paid    = e.paid   || 0;
    const status  = e.status || 'unpaid';
    const notes   = e.notes  || '';

    return `<tr>
      <td><b>${m.name}</b></td>
      <td style="color:var(--text3)">${fmtTk(m.rent || 0)}</td>
      <td>
        <input type="number" class="input input-sm" id="rp-${m.id}"
          value="${paid}"
          data-due="${due}"
          style="width:95px"
          oninput="updRentSum()"/>
      </td>
      <td>
        <select class="input input-sm" id="rs-${m.id}" style="width:100px">
          <option value="paid"    ${status==='paid'    ?'selected':''}>Paid</option>
          <option value="unpaid"  ${status==='unpaid'  ?'selected':''}>Not paid</option>
          <option value="partial" ${status==='partial' ?'selected':''}>Partial</option>
        </select>
      </td>
      <td>
        <input type="text" class="input input-sm" id="rn-${m.id}"
          placeholder="—" value="${notes}" style="width:100px"/>
      </td>
    </tr>`;
  }).join('');

  updRentSum();
}

function updRentSum() {
  let due = 0, paid = 0;
  members.forEach(m => {
    const pi = document.getElementById('rp-' + m.id);
    if(!pi) return;
    // Always read due from current member's default rent
    const memberDue = m.rent || 0;
    pi.dataset.due = memberDue;  // keep dataset.due in sync
    due  += memberDue;
    paid += parseFloat(pi.value || 0);
  });

  const el = document.getElementById('rent-stats'); if(!el) return;
  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total due</div>
      <div class="stat-value" style="font-size:17px">${fmtTk(due)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Collected</div>
      <div class="stat-value" style="font-size:17px;color:var(--green)">${fmtTk(paid)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Outstanding</div>
      <div class="stat-value" style="font-size:17px;color:${due - paid > 0 ? 'var(--red)' : 'var(--green)'}">${fmtTk(round2(due - paid))}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Collection rate</div>
      <div class="stat-value">${due > 0 ? Math.round((paid / due) * 100) : 0}%</div>
    </div>`;
}

function markAllRentPaid() {
  members.forEach(m => {
    const rp = document.getElementById('rp-' + m.id);
    const rs = document.getElementById('rs-' + m.id);
    if(rp && rs) {
      // Use dataset.due if set, otherwise fall back to member's default rent
      const due = parseFloat(rp.dataset.due || m.rent || 0);
      rp.value = due;
      rp.dataset.due = due;
      rs.value = 'paid';
    }
  });
  updRentSum();
}

async function saveRent() {
  const month = parseInt(document.getElementById('rent-month')?.value || 0);
  const year  = parseInt(document.getElementById('rent-year')?.value  || new Date().getFullYear());
  const key   = monthKey(year, month);

  const entries = members.map(m => ({
    name:   m.name,
    rent:   parseFloat(document.getElementById('rp-'+m.id)?.dataset.due || m.rent || 0),
    paid:   parseFloat(document.getElementById('rp-'+m.id)?.value || 0),
    status: document.getElementById('rs-'+m.id)?.value || 'unpaid',
    notes:  cleanText(document.getElementById('rn-'+m.id)?.value || '')
  }));

  try {
    await dbUpsertRent(month, year, key, entries);
    toast('Rent saved', 'success');
    loadRentHistory();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function loadRentHistory() {
  const wrap = document.getElementById("rent-history");
  if (!wrap) return;
  const { data: all } = await sb
    .from("rent")
    .select("*")
    .eq("mess_id", messId())
    .order("month_key", { ascending: false });
  if (!all?.length) {
    wrap.innerHTML = '<div class="empty">No rent records</div>';
    return;
  }
  wrap.innerHTML = `<table><thead><tr><th>Month</th><th>Total due</th><th>Collected</th><th>Status</th></tr></thead><tbody>${all
    .map((r) => {
      const due = r.entries.reduce((s, e) => s + Number(e.rent || 0), 0),
        paid = r.entries.reduce((s, e) => s + Number(e.paid || 0), 0),
        allPaid = r.entries.every((e) => e.status === "paid"),
        anyUnpaid = r.entries.some((e) => e.status === "unpaid");
      const cls = allPaid
        ? "badge-green"
        : anyUnpaid
          ? "badge-red"
          : "badge-amber";
      return `<tr><td><b>${r.month_name} ${r.year}</b></td><td>${fmtTk(due)}</td><td style="color:var(--green)">${fmtTk(paid)}</td><td><span class="badge ${cls}">${allPaid ? "Complete" : anyUnpaid ? "Pending" : "Partial"}</span></td></tr>`;
    })
    .join("")}</tbody></table>`;
}

/* --- MONTHLY LOG --- */
function renderLog(el) {
  const n = new Date();
  el.innerHTML = `<div class="topbar"><div><div class="page-title">Monthly Log</div><div class="page-sub">Full settlement report</div></div></div><div class="content"><div class="month-sel"><label>Month</label><select class="input" id="log-month" style="width:180px">${MONTHS.map((m, i) => `<option value="${i}"${i === n.getMonth() ? " selected" : ""}>${m}</option>`).join("")}</select><label>Year</label><select class="input" id="log-year" style="width:90px">${Array.from(
    { length: 5 },
    (_, i) => 2023 + i,
  )
    .map(
      (y) => `<option${y === n.getFullYear() ? " selected" : ""}>${y}</option>`,
    )
    .join(
      "",
    )}</select><button class="btn btn-primary" onclick="loadLog()">Generate</button></div><div id="log-content"><div class="empty">Select a month and click Generate</div></div></div>`;
}
async function loadLog() {
  const month   = parseInt(document.getElementById('log-month').value);
  const year    = parseInt(document.getElementById('log-year').value);
  const key     = monthKey(year, month);

  const [allMeals, allBazar, rentRec, {data:utilRec}] = await Promise.all([
    dbGetAll('meals'), dbGetAll('bazar'), dbGetMonth('rent', key),
    sb.from('utility_payments').select('*').eq('mess_id', messId()).eq('month_key', key).maybeSingle()
  ]);

  const fm = allMeals.filter(r => r.date.startsWith(key)).sort((a,b) => a.date.localeCompare(b.date));
  const fb = allBazar.filter(r => r.date.startsWith(key)).sort((a,b) => a.date.localeCompare(b.date));

  const getMT = (mObj, n) => {
    if(mObj[n+'_day'] != null || mObj[n+'_night'] != null)
      return round2(Number(mObj[n+'_day']||0) + Number(mObj[n+'_night']||0));
    return Number(mObj[n]||0);
  };

  // Meal & bazar totals
  let totalMeals = 0, totalBazar = 0;
  const memMeals = {}, memBazar = {};
  members.forEach(m => { memMeals[m.name]=0; memBazar[m.name]=0; });
  fm.forEach(r => { members.forEach(m => { const t=getMT(r.meals,m.name); memMeals[m.name]+=t; totalMeals+=t; }); });
  fb.forEach(r => { Object.entries(r.bazar||{}).forEach(([n,v]) => { memBazar[n]=(memBazar[n]||0)+Number(v); totalBazar+=Number(v); }); });
  members.forEach(m => memMeals[m.name] = round2(memMeals[m.name]));

  const mealRate = totalMeals > 0 ? round2(totalBazar / totalMeals) : 0;

  // ── Bills split: Prepaid vs Postpaid ──────────────────
  const bills = utilRec?.bills || {};
  const prepaidKeys  = ['elec','wifi','gas','other'];
  const postpaidKeys = ['khala'];

  const totalPrepaid  = prepaidKeys.reduce((s,k)  => s + (Number(bills[k])||0), 0);
  const totalPostpaid = postpaidKeys.reduce((s,k) => s + (Number(bills[k])||0), 0);
  const totalUtil     = totalPrepaid + totalPostpaid;

  const prepaidPerHead  = members.length > 0 ? round2(totalPrepaid  / members.length) : 0;
  const khalaPerHead    = members.length > 0 ? round2(totalPostpaid / members.length) : 0;

  // Per-member settlement
  const payData = members.map(m => {
    const re       = rentRec?.entries?.find(e => e.name === m.name) || {};
    const meals    = memMeals[m.name] || 0;
    const bazar    = memBazar[m.name] || 0;
    const mealCost = round2(meals * mealRate);
    const rent     = Number(re.rent || m.rent || 0);
    // Postpaid: meal cost + khala
    const postpaid = round2(mealCost + khalaPerHead);
    // Prepaid: utility + rent
    const prepaid  = round2(prepaidPerHead + rent);
    const totalOwed = round2(postpaid + prepaid);
    const net       = round2(totalOwed - bazar);
    return { name:m.name, meals, bazar, mealCost, khala:khalaPerHead, utility:prepaidPerHead, rent, postpaid, prepaid, totalOwed, net };
  });

  document.getElementById('log-content').innerHTML = `

    <!-- SUMMARY STATS -->
    <div class="stat-grid" style="margin-bottom:14px">
      <div class="stat-card"><div class="stat-label">Total meals</div><div class="stat-value">${round2(totalMeals)}</div></div>
      <div class="stat-card"><div class="stat-label">Meal rate</div><div class="stat-value" style="font-size:17px">${fmtTk(mealRate)}</div></div>
      <div class="stat-card"><div class="stat-label">Total bazar</div><div class="stat-value" style="font-size:17px">${fmtTk(totalBazar)}</div></div>
      <div class="stat-card"><div class="stat-label">Prepaid bills</div><div class="stat-value" style="font-size:17px;color:var(--blue)">${fmtTk(totalPrepaid)}</div></div>
      <div class="stat-card"><div class="stat-label">Khala (postpaid)</div><div class="stat-value" style="font-size:17px;color:var(--red)">${fmtTk(totalPostpaid)}</div></div>
      <div class="stat-card"><div class="stat-label">Per head utility</div><div class="stat-value" style="font-size:17px">${fmtTk(prepaidPerHead + khalaPerHead)}</div></div>
    </div>

    <!-- LEGEND -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;font-size:12px">
      <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:var(--red);display:inline-block"></span>Postpaid (settle at month end)</span>
      <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:var(--blue);display:inline-block"></span>Prepaid (collect at month start)</span>
    </div>

    <!-- SETTLEMENT TABLE -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">Settlement — ${MONTHS[month]} ${year}</div>
      <div class="tbl-wrap"><table>
        <thead>
          <tr>
            <th rowspan="2">Member</th>
            <th rowspan="2">Meals</th>
            <th colspan="2" style="text-align:center;color:var(--red);border-bottom:1px solid var(--border)">🔴 Postpaid</th>
            <th colspan="2" style="text-align:center;color:var(--blue);border-bottom:1px solid var(--border)">🔵 Prepaid</th>
            <th rowspan="2">Bazar credit</th>
            <th rowspan="2">Net</th>
          </tr>
          <tr>
            <th style="color:var(--red)">Meal cost</th>
            <th style="color:var(--red)">Khala</th>
            <th style="color:var(--blue)">Utility</th>
            <th style="color:var(--blue)">Rent</th>
          </tr>
        </thead>
        <tbody>
          ${payData.map(p => {
            const nc = p.net > 0 ? 'net-neg' : p.net < 0 ? 'net-pos' : '';
            const nl = p.net > 0 ? `Pay ${fmtTk(p.net)}` : p.net < 0 ? `Get ${fmtTk(-p.net)}` : 'Settled';
            return `<tr>
              <td><b>${p.name}</b></td>
              <td>${p.meals}</td>
              <td style="color:var(--red)">${fmtTk(p.mealCost)}</td>
              <td style="color:var(--red)">${fmtTk(p.khala)}</td>
              <td style="color:var(--blue)">${fmtTk(p.utility)}</td>
              <td style="color:var(--blue)">${fmtTk(p.rent)}</td>
              <td style="color:var(--green)">${fmtTk(p.bazar)}</td>
              <td class="${nc}"><b>${nl}</b></td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td><b>Total</b></td>
            <td>${round2(totalMeals)}</td>
            <td style="color:var(--red)">${fmtTk(round2(payData.reduce((s,p)=>s+p.mealCost,0)))}</td>
            <td style="color:var(--red)">${fmtTk(totalPostpaid)}</td>
            <td style="color:var(--blue)">${fmtTk(totalPrepaid)}</td>
            <td style="color:var(--blue)">${fmtTk(round2(payData.reduce((s,p)=>s+p.rent,0)))}</td>
            <td style="color:var(--green)">${fmtTk(totalBazar)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table></div>
    </div>

    <!-- MEAL & BAZAR LOGS -->
    <div class="grid-2" style="gap:12px">
      <div class="card">
        <div class="card-title">Meal log</div>
        <div class="scroll-table tbl-wrap"><table>
          <thead><tr><th>Date</th>${members.map(m=>`<th>${m.name}</th>`).join('')}<th>Total</th></tr></thead>
          <tbody>${fm.map(r => {
            let t=0;
            const cells = members.map(m => { const mv=getMT(r.meals,m.name); t+=mv; return `<td>${mv}</td>`; }).join('');
            return `<tr><td>${r.date.slice(8)}</td>${cells}<td><b>${round2(t)}</b></td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td>Total</td>${members.map(m=>`<td>${memMeals[m.name]||0}</td>`).join('')}<td>${round2(totalMeals)}</td></tr></tfoot>
        </table></div>
      </div>
      <div class="card">
        <div class="card-title">Bazar log</div>
        <div class="scroll-table tbl-wrap"><table>
          <thead><tr><th>Date</th>${members.map(m=>`<th>${m.name}</th>`).join('')}<th>Total</th></tr></thead>
          <tbody>${fb.map(r => {
            const bt = Object.values(r.bazar||{}).reduce((s,v)=>s+Number(v),0);
            return `<tr><td>${r.date.slice(8)}</td>${members.map(m=>`<td>${r.bazar[m.name]!=null?fmtTk(r.bazar[m.name]):'0'}</td>`).join('')}<td><b>${fmtTk(bt)}</b></td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td>Total</td>${members.map(m=>`<td>${fmtTk(memBazar[m.name]||0)}</td>`).join('')}<td>${fmtTk(totalBazar)}</td></tr></tfoot>
        </table></div>
      </div>
    </div>`;
}

/* --- ANNOUNCEMENTS --- */
async function renderAnnouncements(el, isAdmin) {
  el.innerHTML = `<div class="topbar"><div><div class="page-title">Announcements</div><div class="page-sub">Mess-wide notices & updates</div></div>${isAdmin ? `<div class="topbar-actions"><button class="btn btn-primary btn-sm" onclick="openAnnounceModal()">+ Post notice</button></div>` : ""}</div>
  <div class="content"><div id="announce-list"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>`;
  await loadAnnouncements(isAdmin);
}

async function loadAnnouncements(isAdmin) {
  const items = await dbGetAnnouncements();
  const list = document.getElementById("announce-list");
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<div class="empty">No announcements yet.</div>';
    return;
  }
  list.innerHTML = items
    .map(
      (a) => `<div class="announce-item">
    <div class="announce-item-header">
      <div class="announce-item-title">${a.pinned ? '<span class="announce-pin">📌 </span>' : ""}${a.title}</div>
      <div style="display:flex;gap:6px;align-items:center">
        <div class="announce-item-meta">${a.author} · ${new Date(a.created_at).toLocaleDateString()}</div>
        ${isAdmin ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="deleteAnnounce('${a.id}')">✕</button>` : ""}
      </div>
    </div>
    <div class="announce-item-body">${a.body}</div>
  </div>`,
    )
    .join("");
}

function openAnnounceModal() {
  document.getElementById("modal-content").innerHTML = `
    <div class="modal-title">Post announcement</div>
    <div class="modal-sub">Visible to all members of your mess</div>
    <div class="field"><label>Title *</label><input type="text" class="input" id="an-title" placeholder="e.g. Rent due reminder"/></div>
    <div class="field"><label>Message *</label><textarea class="input" id="an-body" rows="4" placeholder="Write your message here…" style="height:auto;resize:vertical"></textarea></div>
    <div class="field"><label><input type="checkbox" id="an-pin" style="margin-right:6px"/>Pin this announcement</label></div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="postAnnounce()">Post</button></div>`;
  openModal();
}

async function postAnnounce() {
  const title = cleanText(document.getElementById("an-title")?.value);
  const body = cleanText(document.getElementById("an-body")?.value);
  const pinned = document.getElementById("an-pin")?.checked || false;
  if (!title || !body) {
    toast("Title and message required");
    return;
  }
  try {
    await dbSaveAnnouncement({ title, body, pinned });
    closeModal();
    toast("Posted", "success");
    navigate("announce");
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

async function deleteAnnounce(id) {
  if (!confirm("Delete?")) return;
  try {
    await dbDeleteAnnouncement(id);
    toast("Deleted");
    navigate("announce");
  } catch (e) {
    toast("Error", "error");
  }
}

/* --- CHORES --- */
async function renderChores(el, isAdmin) {
  el.innerHTML = `<div class="topbar"><div><div class="page-title">Chore Roster</div><div class="page-sub">Assign & track cleaning duties</div></div>${isAdmin ? `<div class="topbar-actions"><button class="btn btn-primary btn-sm" onclick="openChoreModal()">+ Add chore</button></div>` : ""}</div>
  <div class="content">
    <div class="card"><div class="card-title">Current duties</div><div id="chores-list"><div class="loading"><div class="spinner"></div>Loading…</div></div></div>
  </div>`;
  await loadChores(isAdmin);
}

async function renderNotifications(el) {
  const all = await dbGetNotifications();
  const pending = all.filter((n) => n.status === "pending");
  const resolved = all.filter((n) => n.status !== "pending");

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Member Requests</div>
      <div class="page-sub">${pending.length} pending approval</div>
    </div>
    <div class="topbar-actions">
      <button class="btn btn-ghost btn-sm" onclick="navigate('notifications')">Refresh</button>
    </div>
  </div>
  <div class="content">
    ${
      pending.length === 0
        ? `<div class="card" style="text-align:center;padding:32px">
           <div style="font-size:28px;margin-bottom:10px">✅</div>
           <div style="color:var(--text2);font-size:14px">No pending requests</div>
         </div>`
        : `<div class="card" style="margin-bottom:14px">
          <div class="card-title">Pending (${pending.length})</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${pending.map((n) => notifCard(n, true)).join("")}
          </div>
        </div>`
    }
    ${
      resolved.length > 0
        ? `
    <div class="card">
      <div class="card-title">Recent resolved (${resolved.length})</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${resolved
          .slice(0, 20)
          .map((n) => notifCard(n, false))
          .join("")}
      </div>
    </div>`
        : ""
    }
  </div>`;
}

function notifCard(n, showActions) {
  const typeMap = {
    meal_request:  { icon:'🍽️', label:'Meal entry' },
    bazar_request: { icon:'🛒', label:'Bazar entry' },
    bill_payment:  { icon:'💡', label:'Bill payment' },
  };
  const {icon, label} = typeMap[n.type] || {icon:'📋', label:n.type};
  const statusCls   = n.status==='approved'?'badge-green':n.status==='rejected'?'badge-red':'badge-amber';
  const statusLabel = n.status==='approved'?'Approved':n.status==='rejected'?'Rejected':'Pending';

  const billTypeLabel = {elec:'⚡ Electricity',wifi:'📶 WiFi',gas:'🔥 Gas',khala:'👩 Khala',other:'📦 Other',rent:'🏠 Rent'};

  // Build data preview per type
  let dataHtml = '';
  if(n.type === 'meal_request') {
    const entries = Object.entries(n.data||{}).filter(([k]) => !['day','night'].includes(k));
    dataHtml = entries.map(([k,v]) =>
      `<span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">${k}: <b>${v}</b></span>`
    ).join(' ');
  } else if(n.type === 'bazar_request') {
    const amount = Object.values(n.data)[0] || 0;
    dataHtml = `<span style="font-size:13px;font-weight:600;color:var(--green)">${fmtTk(amount)}</span>`;
  } else if(n.type === 'bill_payment') {
    dataHtml = `
      <span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">${billTypeLabel[n.data.billType]||n.data.billType}</span>
      <span style="font-size:13px;font-weight:600;color:var(--green)">${fmtTk(n.data.amount)}</span>
      <span style="font-size:12px;background:var(--bg4);padding:2px 8px;border-radius:99px">${n.data.monthName} ${n.data.year}</span>`;
  }

  return `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span>${icon}</span>
          <span style="font-weight:600;font-size:14px">${n.from_name}</span>
          <span style="font-size:12px;color:var(--text3)">submitted a ${label}</span>
          <span class="badge ${statusCls}" style="font-size:10px">${statusLabel}</span>
        </div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px">
          📅 ${n.date} · ${new Date(n.created_at).toLocaleString()}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:${n.note?'8px':'0'}">
          ${dataHtml}
        </div>
        ${n.note ? `<div style="font-size:12px;color:var(--text2);margin-top:6px">💬 "${n.note}"</div>` : ''}
      </div>
      ${showActions ? `
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-primary btn-sm" onclick="approveRequest('${n.id}')">✓ Approve</button>
        <button class="btn btn-danger btn-sm" onclick="rejectRequest('${n.id}')">✕ Reject</button>
      </div>` : ''}
    </div>
  </div>`;
}

async function approveRequest(id) {
  const billTypeLabel = {elec:'Electricity',wifi:'WiFi',gas:'Gas',khala:'Khala',other:'Other',rent:'Rent'};
  const all = await dbGetNotifications();
  const n   = all.find(x => x.id === id);
  if (!n) return;

  try {
    if (n.type === "meal_request") {
      // Merge into existing meal record
      const { data: existing } = await sb
        .from("meals")
        .select("*")
        .eq("mess_id", messId())
        .eq("date", n.date)
        .maybeSingle();
      const merged = { ...(existing?.meals || {}), ...n.data };
      // Recalculate totals
      members.forEach((m) => {
        const d = Number(merged[m.name + "_day"] || 0);
        const nt = Number(merged[m.name + "_night"] || 0);
        merged[m.name] = round2(d + nt);
      });
      await dbUpsertMeals(n.date, merged);
    } else if (n.type === "bazar_request") {
      const { data: existing } = await sb
        .from("bazar")
        .select("*")
        .eq("mess_id", messId())
        .eq("date", n.date)
        .maybeSingle();

      // Strip internal keys before merging — only keep member name keys
      const cleanData = { ...n.data };
      delete cleanData.amount; // remove the plain 'amount' key

      const merged = { ...(existing?.bazar || {}), ...cleanData };
      await dbUpsertBazar(n.date, merged);
    } else if(n.type === 'bill_payment') {
  const {billType, amount, monthKey:mk, monthName, year} = n.data;
  const month = MONTHS.indexOf(monthName);

  if(billType === 'rent') {
    // Credit toward rent payment
    const {data:rentRec} = await sb.from('rent').select('*')
      .eq('mess_id', messId()).eq('month_key', mk).maybeSingle();

    if(rentRec) {
      const entries = rentRec.entries.map(e => {
        if(e.name === n.from_name) {
          const newPaid = round2(Number(e.paid||0) + amount);
          const newStatus = newPaid >= Number(e.rent||0) ? 'paid' : 'partial';
          return {...e, paid: newPaid, status: newStatus};
        }
        return e;
      });
      await dbUpsertRent(month, year, mk, entries);
    } else {
      // No rent record yet — create one
      const entries = members.map(m => ({
        name: m.name,
        rent: m.rent || 0,
        paid: m.name === n.from_name ? amount : 0,
        status: m.name === n.from_name ? (amount >= (m.rent||0) ? 'paid' : 'partial') : 'unpaid',
        notes: m.name === n.from_name ? `Paid by member` : ''
      }));
      await dbUpsertRent(month, year, mk, entries);
    }

  } else {
    // Credit toward utility payment
    const {data:utilRec} = await sb.from('utility_payments').select('*')
      .eq('mess_id', messId()).eq('month_key', mk).maybeSingle();

    const existingPayments = utilRec?.payments || {};
    const myPayment = existingPayments[n.from_name] || {paid:0, status:'unpaid'};
    const bills = utilRec?.bills || {};
    const totalBill = ['elec','wifi','gas','khala','other'].reduce((s,k)=>s+(bills[k]||0),0);
    const myShare = members.length > 0 ? round2(totalBill / members.length) : 0;
    const newPaid = round2(Number(myPayment.paid||0) + amount);
    const newStatus = newPaid >= myShare ? 'paid' : 'partial';

    const updatedPayments = {
      ...existingPayments,
      [n.from_name]: { paid: newPaid, status: newStatus, notes: `Paid ${fmtTk(amount)} for ${billTypeLabel[billType]||billType}` }
    };

    // Also update the bill amount if this is a full bill payment
    const existingBills = utilRec?.bills || {};
    await dbUpsertUtility(month, year, mk, existingBills, updatedPayments);
  }
}

    await dbUpdateNotifStatus(id, "approved");
    toast("Request approved ✓", "success");
    refreshNotifBadge();
    navigate("notifications");
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

async function rejectRequest(id) {
  if (!confirm("Reject this request?")) return;
  try {
    await dbUpdateNotifStatus(id, "rejected");
    toast("Request rejected");
    refreshNotifBadge();
    navigate("notifications");
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

async function renderTransferRole(el) {
  const others = members.filter((m) => m.id !== currentUser.memberId);

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Transfer Manager Role</div>
      <div class="page-sub">Hand over management to another member. You will become a regular member.</div>
    </div>
  </div>
  <div class="content">
    <div class="card" style="max-width:520px;margin:0 auto">
      <div style="background:var(--accent-bg);border:1px solid rgba(212,168,83,.25);border-radius:var(--radius-sm);padding:14px 16px;margin-bottom:20px;font-size:13px;color:var(--accent)">
        ⚠️ Once you transfer the role, you will lose manager access immediately and become a regular member.
      </div>
      <div class="card-title">Current manager</div>
      <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg3);border-radius:var(--radius-sm);margin-bottom:20px">
        <div class="avatar" style="background:#2a2218;color:#d4a853">${initials(currentUser.name)}</div>
        <div>
          <div style="font-weight:600">${currentUser.name}</div>
          <div style="font-size:12px;color:var(--text3)">@${currentUser.username} · 👑 Manager</div>
        </div>
      </div>
      <div class="card-title">Transfer to</div>
      ${
        others.length === 0
          ? `<div class="empty">No other members to transfer to. Add members first.</div>`
          : `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px" id="transfer-list">
          ${others
            .map((m, i) => {
              const col = avatarCol(members.indexOf(m));
              return `<label style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg3);border:2px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:border-color .15s" class="transfer-option">
              <input type="radio" name="transfer-target" value="${m.id}" style="accent-color:var(--accent)"/>
              <div class="avatar" style="background:${col.bg};color:${col.fg}">${initials(m.name)}</div>
              <div>
                <div style="font-weight:600">${m.name}</div>
                <div style="font-size:12px;color:var(--text3)">@${m.username} · ${m.room || "No room"}</div>
              </div>
            </label>`;
            })
            .join("")}
        </div>
        <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="doTransferRole()">
          👑 Transfer manager role
        </button>`
      }
    </div>
  </div>`;

  // Highlight selected radio
  el.querySelectorAll(".transfer-option").forEach((label) => {
    label.querySelector("input").addEventListener("change", () => {
      el.querySelectorAll(".transfer-option").forEach(
        (l) => (l.style.borderColor = "var(--border)"),
      );
      label.style.borderColor = "var(--accent)";
    });
  });
}

async function doTransferRole() {
  const selected = document.querySelector(
    'input[name="transfer-target"]:checked',
  );
  if (!selected) {
    toast("Select a member to transfer to");
    return;
  }

  const targetId = selected.value;
  const target = members.find((m) => m.id === targetId);
  if (!target) return;

  if (
    !confirm(
      `Transfer manager role to ${target.name}? You will become a regular member immediately.`,
    )
  )
    return;

  try {
    // 1. Demote current manager → member
    const { error: e1 } = await sb
      .from("members")
      .update({ role: "member" })
      .eq("id", currentUser.memberId);
    if (e1) throw e1;

    // 2. Promote selected member → manager
    const { error: e2 } = await sb
      .from("members")
      .update({ role: "manager" })
      .eq("id", targetId);
    if (e2) throw e2;

    toast(`${target.name} is now the manager!`, "success");

    // 3. Update current session role → member, reload nav
    currentUser.role = "member";
    saveSession(currentUser, currentMess);
    members = await dbGetMembers();
    buildNav();
    updateSidebarUser();
    navigate("my-dashboard");
  } catch (e) {
    toast("Transfer failed: " + e.message, "error");
  }
}

async function loadChores(isAdmin) {
  const items = await dbGetChores();
  const list = document.getElementById("chores-list");
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<div class="empty">No chores assigned yet.</div>';
    return;
  }
  list.innerHTML = items
    .map((c) => {
      const sc =
        c.status === "done"
          ? "badge-green"
          : c.status === "inprogress"
            ? "badge-amber"
            : "badge-red";
      return `<div class="chore-row">
      <div class="chore-task">${c.task}</div>
      <div class="chore-assignee">${c.assignee || "—"}</div>
      <span class="badge ${sc}" style="font-size:10px">${{ done: "Done", inprogress: "In progress", pending: "Pending" }[c.status] || c.status}</span>
      <span class="badge badge-blue" style="font-size:10px">${c.frequency || "daily"}</span>
      ${isAdmin ? `<div style="display:flex;gap:4px"><button class="btn btn-ghost btn-sm btn-icon" onclick="openEditChoreModal('${c.id}')">✏️</button><button class="btn btn-ghost btn-sm btn-icon" onclick="deleteChore('${c.id}')">✕</button></div>` : ""}
    </div>`;
    })
    .join("");
}

function openChoreModal(id, existing) {
  document.getElementById("modal-content").innerHTML = `
    <div class="modal-title">${existing ? "Edit chore" : "Add chore"}</div>
    <div class="modal-sub">Assign a cleaning task to a member</div>
    <div class="field"><label>Task *</label><input type="text" class="input" id="ch-task" placeholder="e.g. Clean kitchen" value="${existing?.task || ""}"/></div>
    <div class="field"><label>Assign to</label><select class="input" id="ch-assignee"><option value="">— Unassigned —</option>${members.map((m) => `<option value="${m.name}"${existing?.assignee === m.name ? " selected" : ""}>${m.name}</option>`).join("")}</select></div>
    <div class="field"><label>Frequency</label><select class="input" id="ch-freq"><option value="daily"${existing?.frequency === "daily" ? " selected" : ""}>Daily</option><option value="weekly"${existing?.frequency === "weekly" ? " selected" : ""}>Weekly</option><option value="monthly"${existing?.frequency === "monthly" ? " selected" : ""}>Monthly</option></select></div>
    <div class="field"><label>Status</label><select class="input" id="ch-status"><option value="pending"${existing?.status === "pending" ? " selected" : ""}>Pending</option><option value="inprogress"${existing?.status === "inprogress" ? " selected" : ""}>In progress</option><option value="done"${existing?.status === "done" ? " selected" : ""}>Done</option></select></div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveChore('${id || ""}')">${existing ? "Save" : "Add chore"}</button></div>`;
  openModal();
}

function openEditChoreModal(id) {
  dbGetChores().then((items) => {
    const c = items.find((x) => x.id === id);
    if (c) openChoreModal(id, c);
  });
}

async function saveChore(id) {
  const task = cleanText(document.getElementById("ch-task")?.value);
  if (!task) {
    toast("Task is required");
    return;
  }
  const row = {
    id: id || undefined,
    task,
    assignee: document.getElementById("ch-assignee")?.value || "",
    frequency: document.getElementById("ch-freq")?.value || "daily",
    status: document.getElementById("ch-status")?.value || "pending",
  };
  try {
    await dbSaveChore(row);
    closeModal();
    toast("Saved", "success");
    navigate("chores");
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

async function deleteChore(id) {
  if (!confirm("Delete?")) return;
  try {
    await dbDeleteChore(id);
    toast("Deleted");
    navigate("chores");
  } catch (e) {
    toast("Error", "error");
  }
}

/* --- MEMBERS MANAGEMENT --- */
function renderMembers(el) {
  el.innerHTML = `<div class="topbar"><div><div class="page-title">Members</div><div class="page-sub">Manage accounts & credentials</div></div><div class="topbar-actions"><button class="btn btn-primary" onclick="openAddMemberModal()">+ Add member</button></div></div>
  <div class="content">
    <div class="info-banner"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>Members sign in using their username & password. The 👑 crown marks the current manager.</div>
    <div class="card"><div class="card-title">Members (${members.length})</div><div class="tbl-wrap" id="mem-table"></div></div>
  </div>`;
  renderMembersTable();
}

function renderMembersTable() {
  const wrap = document.getElementById("mem-table");
  if (!wrap) return;
  if (!members.length) {
    wrap.innerHTML =
      '<div class="empty">No members yet. Click + Add member.</div>';
    return;
  }
  wrap.innerHTML = `<table><thead><tr><th>#</th><th>Name</th><th>Username</th><th>Role</th><th>Room</th><th>Default rent</th><th>Phone</th><th></th></tr></thead>
  <tbody>${members
    .map((m, i) => {
      const col = avatarCol(i);
      const isManager = m.role === "manager";
      return `<tr>
      <td><div class="avatar" style="background:${col.bg};color:${col.fg};width:26px;height:26px;font-size:10px">${initials(m.name)}</div></td>
      <td><b>${m.name}</b></td>
      <td style="font-family:monospace;color:var(--text3)">@${m.username}</td>
      <td>${
        isManager
          ? `<span class="badge badge-amber">👑 Manager</span>`
          : `<span class="badge badge-blue">Member</span>`
      }
      </td>
      <td>${m.room || "—"}</td>
      <td>${fmtTk(m.rent || 0)}</td>
      <td style="color:var(--text2)">${m.phone || "—"}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" onclick="openEditMemberModal('${m.id}')">Edit</button>
        ${
          isManager
            ? `<button class="btn btn-ghost btn-sm" disabled title="Cannot remove the manager" style="opacity:.4">Remove</button>`
            : `<button class="btn btn-danger btn-sm" onclick="deleteMember('${m.id}')">Remove</button>`
        }
      </div></td>
    </tr>`;
    })
    .join("")}</tbody></table>`;
}

// function renderMembersTable(){
//   const wrap=document.getElementById('mem-table');if(!wrap)return;
//   if(!members.length){wrap.innerHTML='<div class="empty">No members yet. Click + Add member.</div>';return;}
//   wrap.innerHTML=`<table><thead><tr><th>#</th><th>Name</th><th>Username</th><th>Room</th><th>Default rent</th><th>Phone</th><th></th></tr></thead>
//   <tbody>${members.map((m,i)=>{const col=avatarCol(i);return`<tr><td><div class="avatar" style="background:${col.bg};color:${col.fg};width:26px;height:26px;font-size:10px">${initials(m.name)}</div></td><td><b>${m.name}</b></td><td style="font-family:monospace;color:var(--text3)">${m.username||'—'}</td><td>${m.room||'—'}</td><td>${fmtTk(m.rent||0)}</td><td style="color:var(--text2)">${m.phone||'—'}</td><td><div style="display:flex;gap:4px"><button class="btn btn-ghost btn-sm" onclick="openEditMemberModal('${m.id}')">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteMember('${m.id}')">Remove</button></div></td></tr>`;}).join('')}</tbody></table>`;
// }

function memberModalHTML(m) {
  return `
  <div class="field"><label>Full name *</label><input type="text" class="input" id="mm-name" value="${m?.name || ""}" placeholder="e.g. Rakib Hasan"/></div>
  <div class="grid-2">
    <div class="field"><label>Username *</label><input type="text" class="input" id="mm-user" value="${m?.username || ""}" placeholder="e.g. rakib"/></div>
    <div class="field"><label>Password *</label><input type="text" class="input" id="mm-pass" value="${m?.password || ""}" placeholder="min 4 chars"/></div>
  </div>
  <div class="grid-2">
    <div class="field"><label>Room</label><input type="text" class="input" id="mm-room" value="${m?.room || ""}" placeholder="Room 3A"/></div>
    <div class="field"><label>Default rent (৳)</label><input type="number" class="input" id="mm-rent" value="${m?.rent || 0}"/></div>
  </div>
  <div class="grid-2">
    <div class="field"><label>Phone</label><input type="text" class="input" id="mm-phone" value="${m?.phone || ""}" placeholder="017xxxxxxxx"/></div>
    <div class="field"><label>Joined date</label><input type="date" class="input" id="mm-joined" value="${m?.joined || ""}"/></div>
  </div>`;
}

function openAddMemberModal() {
  document.getElementById("modal-content").innerHTML =
    `<div class="modal-title">Add member</div><div class="modal-sub">Create account for a new roommate</div>${memberModalHTML(null)}<div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="addMember()">Add member</button></div>`;
  openModal();
}

function openEditMemberModal(id) {
  const m = members.find((x) => x.id === id);
  if (!m) return;
  document.getElementById("modal-content").innerHTML =
    `<div class="modal-title">Edit ${m.name}</div><div class="modal-sub">Update account details</div>${memberModalHTML(m)}<div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="updateMember('${id}')">Save changes</button></div>`;
  openModal();
}

function getMemberFormData(existingRole) {
  return {
    name: cleanText(document.getElementById("mm-name")?.value),
    username: cleanText(document.getElementById("mm-user")?.value),
    password: document.getElementById("mm-pass")?.value || "",
    role: existingRole || "member", // preserve existing role, default new members to 'member'
    room: cleanText(document.getElementById("mm-room")?.value),
    rent: parseFloat(document.getElementById("mm-rent")?.value || 0),
    phone: cleanText(document.getElementById("mm-phone")?.value),
    joined: document.getElementById("mm-joined")?.value || null,
  };
}

async function addMember() {
  const d = getMemberFormData("member"); // new members always start as 'member'
  if (!d.name) {
    toast("Name required");
    return;
  }
  if (!d.username) {
    toast("Username required");
    return;
  }
  if (!d.password) {
    toast("Password required");
    return;
  }
  if (members.find((m) => m.username === d.username)) {
    toast("Username taken");
    return;
  }
  try {
    await dbSaveMember(d);
    members = await dbGetMembers();
    closeModal();
    toast(d.name + " added", "success");
    renderMembersTable();
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

async function updateMember(id) {
  const existing = members.find((m) => m.id === id);
  const d = { ...getMemberFormData(existing?.role || "member"), id };
  if (members.find((m) => m.username === d.username && m.id !== id)) {
    toast("Username taken");
    return;
  }
  try {
    await dbSaveMember(d);
    members = await dbGetMembers();
    closeModal();
    toast("Updated", "success");
    renderMembersTable();
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

async function deleteMember(id) {
  const m = members.find((x) => x.id === id);
  if (!m) return;
  if (!confirm(`Remove ${m.name}?`)) return;
  try {
    await dbDeleteMember(id);
    members = await dbGetMembers();
    toast(m.name + " removed");
    renderMembersTable();
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

/* ═══════════════════════════════════════════
   ── MEMBER PAGES ──
═══════════════════════════════════════════ */
async function getMe() {
  return members.find((m) => m.id === currentUser.memberId) || null;
}

async function renderMyDashboard(el) {
  const member = await getMe();
  if(!member) { el.innerHTML='<div class="content"><div class="empty">Profile not found. Contact manager.</div></div>'; return; }

  const {month, year} = thisMonth(); const key = monthKey(year, month);
  const [allMeals, allBazar, rentRec, utilRes] = await Promise.all([
    dbGetAll('meals'), dbGetAll('bazar'), dbGetMonth('rent', key),
    sb.from('utility_payments').select('*').eq('mess_id', messId()).eq('month_key', key).maybeSingle()
  ]);
  const utilRec = utilRes.data;

  const mM = allMeals.filter(r => r.date.startsWith(key));
  const mB = allBazar.filter(r => r.date.startsWith(key));

  let myMeals = 0, myBazar = 0;
  mM.forEach(r => {
    const d = Number(r.meals[member.name+'_day'] ?? 0);
    const n = Number(r.meals[member.name+'_night'] ?? 0);
    myMeals += round2(d+n) || Number(r.meals[member.name]||0);
  });
  mB.forEach(r => { myBazar += Number(r.bazar[member.name]||0); });

  const allMealsTotal = mM.reduce((s,r) => s+Object.values(r.meals||{}).reduce((a,v)=>a+Number(v),0), 0);
  const allBazarTotal = mB.reduce((s,r) => s+Object.values(r.bazar||{}).reduce((a,v)=>a+Number(v),0), 0);
  const mealRate = allMealsTotal > 0 ? round2(allBazarTotal / allMealsTotal) : 0;
  const mealCost = round2(myMeals * mealRate);

  const bills        = utilRec?.bills || {};
  const prepaidKeys  = ['elec','wifi','gas','other'];
  const totalPrepaid = prepaidKeys.reduce((s,k) => s+(Number(bills[k])||0), 0);
  const khalaTotal   = Number(bills.khala||0);
  const prepaidShare = members.length > 0 ? round2(totalPrepaid / members.length) : 0;
  const khalaShare   = members.length > 0 ? round2(khalaTotal   / members.length) : 0;

  const myRe       = rentRec?.entries?.find(e => e.name===member.name) || {};
  const myRentDue  = Number(myRe.rent || member.rent || 0);
  const myRentPaid = Number(myRe.paid || 0);
  const myUtilPay  = (utilRec?.payments||{})[member.name] || {};

  const mealNet = round2(myBazar - mealCost);
  const rentNet = round2(myRentPaid - myRentDue);
  const utilNet = round2(Number(myUtilPay.paid||0) - (prepaidShare + khalaShare));

  const todayStr = today();
  const todayRec = allMeals.find(r => r.date === todayStr);
  let todayDayTotal=0, todayNightTotal=0;
  if(todayRec) {
    members.forEach(m => {
      todayDayTotal   += Number(todayRec.meals[m.name+'_day']   ?? todayRec.meals[m.name] ?? 0);
      todayNightTotal += Number(todayRec.meals[m.name+'_night'] ?? 0);
    });
    todayDayTotal = round2(todayDayTotal);
    todayNightTotal = round2(todayNightTotal);
  }

  const idx = members.findIndex(m => m.id === member.id);
  const col = avatarCol(Math.max(idx, 0));
  const rc  = myRe.status==='paid'?'badge-green':myRe.status==='partial'?'badge-amber':'badge-red';
  const uc  = myUtilPay.status==='paid'?'badge-green':myUtilPay.status==='partial'?'badge-amber':'badge-red';

  const netTotal = round2(mealCost + khalaShare + myRentDue + prepaidShare - myBazar);

  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">My Dashboard</div><div class="page-sub">${MONTHS[month]} ${year}</div></div>
  </div>
  <div class="content">

    <!-- PROFILE HEADER -->
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:14px">
          <div class="avatar" style="width:48px;height:48px;font-size:16px;background:${col.bg};color:${col.fg};border:2px solid var(--accent)">${initials(member.name)}</div>
          <div>
            <div style="font-family:var(--font-serif);font-size:20px">${member.name}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">Room ${member.room||'—'} · @${member.username}</div>
            <div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap">
              <span class="badge ${rc}">Rent ${myRe.status==='paid'?'✓ paid':'due'}</span>
              <span class="badge ${uc}">Utility ${myUtilPay.status==='paid'?'✓ paid':'due'}</span>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div style="text-align:right">
            <div style="font-size:10px;color:var(--text3);margin-bottom:2px">Meal pay/get</div>
            <div style="font-size:16px;font-weight:700;color:${mealNet>=0?'var(--green)':'var(--red)'}">${mealNet>=0?'Get ':'Pay '}${fmtTk(Math.abs(mealNet))}</div>
          </div>
          <div style="text-align:right;padding-left:16px;border-left:1px solid var(--border)">
            <div style="font-size:10px;color:var(--text3);margin-bottom:2px">Rent balance</div>
            <div style="font-size:16px;font-weight:700;color:${rentNet>=0?'var(--green)':'var(--red)'}">${rentNet>=0?'+':''}${fmtTk(rentNet)}</div>
          </div>
          <div style="text-align:right;padding-left:16px;border-left:1px solid var(--border)">
            <div style="font-size:10px;color:var(--text3);margin-bottom:2px">Utility balance</div>
            <div style="font-size:16px;font-weight:700;color:${utilNet>=0?'var(--green)':'var(--red)'}">${utilNet>=0?'+':''}${fmtTk(utilNet)}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- QUICK STATS + TODAY SIDE BY SIDE -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">

      <!-- QUICK STATS -->
      <div class="card">
        <div class="card-title">This month</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="stat-card" style="padding:10px">
            <div class="stat-label">My meals</div>
            <div class="stat-value">${round2(myMeals)}</div>
            <div class="stat-sub">${MONTHS[month]}</div>
          </div>
          <div class="stat-card" style="padding:10px">
            <div class="stat-label">Meal rate</div>
            <div class="stat-value" style="font-size:16px">${fmtTk(mealRate)}</div>
            <div class="stat-sub">per meal</div>
          </div>
          <div class="stat-card" style="padding:10px">
            <div class="stat-label">My bazar</div>
            <div class="stat-value" style="font-size:16px">${fmtTk(myBazar)}</div>
          </div>
          <div class="stat-card" style="padding:10px">
            <div class="stat-label">Meal cost</div>
            <div class="stat-value" style="font-size:16px">${fmtTk(mealCost)}</div>
          </div>
        </div>
      </div>

      <!-- TODAY'S MEALS -->
      ${todayRec ? `
      <div class="card">
        <div class="card-title">Today — ${todayStr}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:10px">
          <div class="stat-card badge-blue" style="padding:8px;text-align:center">
            <div class="stat-label" style="color:var(--blue);font-size:10px">Day</div>
            <div style="font-size:18px;font-weight:700;color:var(--blue)">${todayDayTotal}</div>
          </div>
          <div class="stat-card badge-amber" style="padding:8px;text-align:center">
            <div class="stat-label" style="color:var(--amber);font-size:10px">Night</div>
            <div style="font-size:18px;font-weight:700;color:var(--amber)">${todayNightTotal}</div>
          </div>
          <div class="stat-card" style="padding:8px;text-align:center">
            <div class="stat-label" style="font-size:10px">Total</div>
            <div style="font-size:18px;font-weight:700">${round2(todayDayTotal+todayNightTotal)}</div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${members.map(m => {
            const d = Number(todayRec.meals[m.name+'_day'] ?? todayRec.meals[m.name] ?? 0);
            const n = Number(todayRec.meals[m.name+'_night'] ?? 0);
            const t = round2(d+n) || Number(todayRec.meals[m.name]||0);
            return `<div style="display:flex;align-items:center;gap:5px;background:var(--bg3);padding:5px 9px;border-radius:var(--radius-sm);border:1px solid var(--border)">
              <span style="font-size:12px;font-weight:500;color:${t>0?'var(--text)':'var(--text3)'}">${m.name}</span>
              ${d>0?`<span class="badge badge-blue" style="font-size:9px">D${d}</span>`:''}
              ${n>0?`<span class="badge badge-amber" style="font-size:9px">N${n}</span>`:''}
              ${t===0?`<span class="badge badge-red" style="font-size:9px">—</span>`:''}
            </div>`;
          }).join('')}
        </div>
      </div>` : `
      <div class="card" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;min-height:140px">
        <div style="font-size:28px">🍽️</div>
        <div style="color:var(--text3);font-size:13px">No meal entry today</div>
      </div>`}

    </div>

    <!-- WHAT I OWE THIS MONTH -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">What I owe — ${MONTHS[month]} ${year}</div>

      <div style="font-size:11px;color:var(--red);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;font-weight:600">🔴 Postpaid (settle at month end)</div>
      <div class="my-stat-row">
        <span class="my-stat-key">🍽️ Meal cost <span style="font-size:10px;color:var(--text3)">${myMeals} meals × ${fmtTk(mealRate)}</span></span>
        <span class="my-stat-val">${fmtTk(mealCost)}</span>
      </div>
      <div class="my-stat-row">
        <span class="my-stat-key">👩 Khala <span style="font-size:10px;color:var(--text3)">my share</span></span>
        <span class="my-stat-val">${fmtTk(khalaShare)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:var(--text3)">
        <span>Postpaid subtotal</span><span>${fmtTk(round2(mealCost+khalaShare))}</span>
      </div>

      <div style="font-size:11px;color:var(--blue);text-transform:uppercase;letter-spacing:.6px;margin:12px 0 8px;font-weight:600;border-top:1px solid var(--border);padding-top:12px">🔵 Prepaid (pay at month start)</div>
      <div class="my-stat-row">
        <span class="my-stat-key">🏠 Room rent</span>
        <span class="my-stat-val" style="color:${myRe.status==='paid'?'var(--green)':'var(--text)'}">${fmtTk(myRentDue)} ${myRe.status==='paid'?'✓':''}</span>
      </div>
      <div class="my-stat-row">
        <span class="my-stat-key">⚡ Utility bills <span style="font-size:10px;color:var(--text3)">my share</span></span>
        <span class="my-stat-val" style="color:${myUtilPay.status==='paid'?'var(--green)':'var(--text)'}">${fmtTk(prepaidShare)} ${myUtilPay.status==='paid'?'✓':''}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:var(--text3)">
        <span>Prepaid subtotal</span><span>${fmtTk(round2(myRentDue+prepaidShare))}</span>
      </div>

      <div style="border-top:2px solid var(--border2);margin-top:4px;padding-top:12px">
        <div class="my-stat-row" style="font-size:15px">
          <span style="font-weight:600">Total this month</span>
          <span style="font-weight:700">${fmtTk(round2(mealCost+khalaShare+myRentDue+prepaidShare))}</span>
        </div>
        <div class="my-stat-row">
          <span class="my-stat-key" style="color:var(--green)">− Bazar credit</span>
          <span class="my-stat-val" style="color:var(--green)">${fmtTk(myBazar)}</span>
        </div>
        <div class="my-stat-row" style="font-size:16px;border-top:1px solid var(--border);margin-top:6px;padding-top:10px">
          <span style="font-weight:700">Net</span>
          <span style="font-weight:700;font-size:18px;color:${netTotal>0?'var(--red)':'var(--green)'}">
            ${netTotal>0 ? 'Pay '+fmtTk(netTotal) : 'Get '+fmtTk(-netTotal)}
          </span>
        </div>
      </div>
    </div>

  </div>`;
}
async function renderMyProfile(el) {
  const member = await getMe();
  if(!member) { el.innerHTML='<div class="content"><div class="empty">Profile not found</div></div>'; return; }

  el.innerHTML=`
  <div class="topbar">
    <div><div class="page-title">My Profile</div><div class="page-sub">Personal stats</div></div>
    <div class="topbar-actions">
      <select class="input" id="my-prof-period" onchange="refreshMyProfile()" style="width:180px">
        <option value="1" selected>This month</option>
        <option value="last">Last month</option>
        <option value="3">Last 3 months</option>
        <option value="6">Last 6 months</option>
        <option value="all">All time</option>
      </select>
    </div>
  </div>
  <div class="content" id="my-profile-content">
    <div class="loading"><div class="spinner"></div>Loading…</div>
  </div>`;

  await loadMyProfile(member);
}

async function refreshMyProfile() {
  const member = await getMe(); if(!member) return;
  await loadMyProfile(member);
}

async function loadMyProfile(member) {
  const content = document.getElementById('my-profile-content');
  if(!content) return;
  content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  const [allM, allB, allR, {data:allU}] = await Promise.all([
    dbGetAll('meals'), dbGetAll('bazar'), dbGetAll('rent'),
    sb.from('utility_payments').select('*').eq('mess_id', messId())
  ]);

  const period = document.getElementById('my-prof-period')?.value || '1';
  const {meals, bazar, rent, utility} = getFilteredData(allM, allB, allR, period, allU||[]);
  const s = getMemberStats(member, meals, bazar, rent, utility);

  const idx = members.findIndex(m => m.id === member.id);
  const col = avatarCol(Math.max(idx, 0));

  const allMK = Object.keys(s.byMonth).sort(), r8 = allMK.slice(-8);
  const maxM = Math.max(...r8.map(k => s.byMonth[k]?.meals || 0), 1);

  // Share calculated from filtered data
  const allMealsTotal = meals.reduce((s,r) => s + Object.values(r.meals||{}).reduce((a,v) => a + Number(v), 0), 0);
  const allBazarTotal = bazar.reduce((s,r) => s + Object.values(r.bazar||{}).reduce((a,v) => a + Number(v), 0), 0);
  const mealShare  = allMealsTotal > 0 ? Math.round((s.totalMeals / allMealsTotal) * 100) : 0;
  const bazarShare = allBazarTotal > 0 ? Math.round((s.totalBazar  / allBazarTotal) * 100) : 0;

  const mealNet = s.mealBalance;
  const rentNet = round2(s.rentPaid - s.rentDue);
  const utilNet = round2(s.utilityPaid - s.utilityDue);

  const periodLabel = {
    '1':'This month', 'last':'Last month',
    '3':'Last 3 months', '6':'Last 6 months', 'all':'All time'
  }[period] || '';

  content.innerHTML = `
    <div class="card">

      <!-- HEADER -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--border);flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:14px">
          <div class="avatar" style="width:52px;height:52px;font-size:17px;background:${col.bg};color:${col.fg};border:2px solid var(--accent)">${initials(member.name)}</div>
          <div>
            <div style="font-family:var(--font-serif);font-size:22px">${member.name}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">Room ${member.room||'—'} · Default rent: ${fmtTk(member.rent||0)}/mo</div>
            <div style="font-size:11px;color:var(--text3);margin-top:1px">@${member.username||'—'} · Joined: ${member.joined||'—'}</div>
          </div>
        </div>

        <!-- Balances top right -->
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <div style="text-align:right">
            <div style="font-size:11px;color:var(--text3);margin-bottom:3px">Meal pay / get</div>
            <div style="font-size:18px;font-weight:700;color:${mealNet >= 0 ? 'var(--green)' : 'var(--red)'}">${mealNet >= 0 ? 'Get ' : 'Pay '}${fmtTk(Math.abs(mealNet))}</div>
          </div>
          <div style="text-align:right;padding-left:20px;border-left:1px solid var(--border)">
            <div style="font-size:11px;color:var(--text3);margin-bottom:3px">Rent balance</div>
            <div style="font-size:18px;font-weight:700;color:${rentNet >= 0 ? 'var(--green)' : 'var(--red)'}">${rentNet >= 0 ? '+' : ''}${fmtTk(rentNet)}</div>
          </div>
          <div style="text-align:right;padding-left:20px;border-left:1px solid var(--border)">
            <div style="font-size:11px;color:var(--text3);margin-bottom:3px">Utility balance</div>
            <div style="font-size:18px;font-weight:700;color:${utilNet >= 0 ? 'var(--green)' : 'var(--red)'}">${utilNet >= 0 ? '+' : ''}${fmtTk(utilNet)}</div>
          </div>
        </div>
      </div>

      <!-- STAT CARDS -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:7px;margin-bottom:18px">
        ${[
          ['Total meals',  s.totalMeals,                 null],
          ['Active days',  s.activeDays,                 null],
          ['Avg/day',      s.avgMeals,                   null],
          ['Bazar spent',  fmtTk(s.totalBazar),          null],
          ['Meal cost',    fmtTk(s.mealCost),            null],
          ['Rent paid',    fmtTk(s.rentPaid),            'var(--green)'],
          ['Util paid',    fmtTk(round2(s.utilityPaid)), 'var(--green)'],
        ].map(([l, v, c]) => `
          <div class="stat-card" style="padding:9px">
            <div class="stat-label">${l}</div>
            <div style="font-size:15px;font-weight:600;margin-top:4px${c?';color:'+c:''}">${v}</div>
          </div>`).join('')}
      </div>

      <!-- MESS SHARE -->
      <div class="detail-section">
        <div class="detail-section-title">Mess share — ${periodLabel}</div>
        <div class="mini-bar">
          <div class="mini-bar-label">Meal share</div>
          <div class="mini-bar-track" style="height:8px"><div class="mini-bar-fill" style="width:${mealShare}%"></div></div>
          <div class="mini-bar-val">${mealShare}%</div>
        </div>
        <div class="mini-bar">
          <div class="mini-bar-label">Bazar share</div>
          <div class="mini-bar-track" style="height:8px"><div class="mini-bar-fill" style="width:${bazarShare}%"></div></div>
          <div class="mini-bar-val">${bazarShare}%</div>
        </div>
      </div>

      <!-- MONTHLY MEAL HISTORY -->
      <div class="detail-section">
        <div class="detail-section-title">Monthly meal history</div>
        ${r8.length ? `
          <div class="hist-labels">${r8.map(k=>`<span>${MONTHS[parseInt(k.slice(5))-1].slice(0,3)}</span>`).join('')}</div>
          <div class="hist-wrap">${r8.map(k=>{
            const v=s.byMonth[k]?.meals||0;
            const h=Math.max(Math.round((v/maxM)*44),3);
            return `<div class="hist-b" style="height:${h}px"><div class="tip">${MONTHS[parseInt(k.slice(5))-1].slice(0,3)}: ${v}</div></div>`;
          }).join('')}</div>`
        :'<div style="color:var(--text3);font-size:13px">No history</div>'}
      </div>

      <!-- RECENT MONTHS -->
      <div class="detail-section">
        <div class="detail-section-title">Recent months</div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Month</th><th>Meals</th><th>Bazar</th><th>Rent paid</th><th>Util paid</th></tr></thead>
          <tbody>${allMK.slice(-6).reverse().map(k=>{
            const d=s.byMonth[k]||{};
            return `<tr>
              <td>${MONTHS[parseInt(k.slice(5))-1]} ${k.slice(0,4)}</td>
              <td>${d.meals||0}</td>
              <td>${fmtTk(d.bazar||0)}</td>
              <td style="color:var(--green)">${fmtTk(d.rentPaid||0)}</td>
              <td style="color:var(--green)">${fmtTk(d.utilityPaid||0)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>

    </div>`;
}

async function renderMyMeals(el) {
  const member = await getMe();
  if (!member) return;
  const myNotifs = await sb
    .from("notifications")
    .select("*")
    .eq("mess_id", messId())
    .eq("from_id", currentUser.memberId)
    .eq("type", "meal_request")
    .order("created_at", { ascending: false });
  const history = sanitize(myNotifs.data || []);

  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">Meal Entry</div>
    <div class="page-sub">Submit your meal count — manager will approve</div></div>
  </div>
  <div class="content">
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">Submit meal request</div>
      <div class="date-row">
        <label>Date</label>
        <input type="date" class="input" id="my-meal-date" value="${today()}" style="width:170px"/>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div class="field">
          <label>Day meals</label>
          <input type="number" class="input" id="my-meal-day" min="0" max="4" step="0.5" value="1" placeholder="0"/>
        </div>
        <div class="field">
          <label>Night meals</label>
          <input type="number" class="input" id="my-meal-night" min="0" max="4" step="0.5" value="1" placeholder="0"/>
        </div>
      </div>
      <div class="field">
        <label>Note (optional)</label>
        <input type="text" class="input" id="my-meal-note" placeholder="e.g. I was absent at lunch"/>
      </div>
      <button class="btn btn-primary" onclick="submitMealRequest()">
        📨 Submit to manager
      </button>
    </div>

    <div class="card">
      <div class="card-title">My requests</div>
      ${
        history.length === 0
          ? '<div class="empty">No requests yet</div>'
          : `<div class="tbl-wrap"><table>
            <thead><tr><th>Date</th><th>Day</th><th>Night</th><th>Note</th><th>Status</th><th>Submitted</th></tr></thead>
            <tbody>${history
              .map((n) => {
                const sc =
                  n.status === "approved"
                    ? "badge-green"
                    : n.status === "rejected"
                      ? "badge-red"
                      : "badge-amber";
                const sl =
                  n.status === "approved"
                    ? "Approved"
                    : n.status === "rejected"
                      ? "Rejected"
                      : "Pending";

                // data keys are stored as MemberName_day / MemberName_night
                const dayKey = Object.keys(n.data).find((k) =>
                  k.endsWith("_day"),
                );
                const nightKey = Object.keys(n.data).find((k) =>
                  k.endsWith("_night"),
                );
                const dayVal = dayKey ? n.data[dayKey] : 0;
                const nightVal = nightKey ? n.data[nightKey] : 0;

                return `<tr>
    <td>${n.date}</td>
    <td>${dayVal > 0 ? `<span class="badge badge-blue">${dayVal}</span>` : "—"}</td>
    <td>${nightVal > 0 ? `<span class="badge badge-amber">${nightVal}</span>` : "—"}</td>
    <td style="color:var(--text3)">${n.note || "—"}</td>
    <td><span class="badge ${sc}">${sl}</span></td>
    <td style="color:var(--text3);font-size:12px">${new Date(n.created_at).toLocaleDateString()}</td>
  </tr>`;
              })
              .join("")}</tbody>
          </table></div>`
      }
    </div>
  </div>`;
}

async function submitMealRequest() {
  const date = document.getElementById("my-meal-date")?.value;
  const day = parseFloat(document.getElementById("my-meal-day")?.value || 0);
  const night = parseFloat(
    document.getElementById("my-meal-night")?.value || 0,
  );
  const note = cleanText(document.getElementById("my-meal-note")?.value || "");

  if (!date) {
    toast("Select a date");
    return;
  }
  if (day === 0 && night === 0) {
    toast("Enter at least one meal");
    return;
  }

  const member = await getMe();

  // Store both named keys (for approval merge) and plain day/night (for display)
  const data = {
    [member.name + "_day"]: day,
    [member.name + "_night"]: night,
    [member.name]: round2(day + night),
    day, // plain keys for easy reading in history table
    night,
  };

  try {
    await dbSaveNotification({ type: "meal_request", date, data, note });
    toast("Request sent to manager 📨", "success");
    navigate("my-meals");
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

async function renderMyBazar(el) {
  const member = await getMe();
  if (!member) return;
  const myNotifs = await sb
    .from("notifications")
    .select("*")
    .eq("mess_id", messId())
    .eq("from_id", currentUser.memberId)
    .eq("type", "bazar_request")
    .order("created_at", { ascending: false });
  const history = sanitize(myNotifs.data || []);

  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">Bazar Entry</div>
    <div class="page-sub">Submit your grocery spending — manager will approve</div></div>
  </div>
  <div class="content">
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">Submit bazar request</div>
      <div class="date-row">
        <label>Date</label>
        <input type="date" class="input" id="my-bazar-date" value="${today()}" style="width:170px"/>
      </div>
      <div class="field">
        <label>Amount (৳) *</label>
        <input type="number" class="input" id="my-bazar-amount" min="0" placeholder="e.g. 850"/>
      </div>
      <div class="field">
        <label>Note (optional)</label>
        <input type="text" class="input" id="my-bazar-note" placeholder="e.g. Bought vegetables from market"/>
      </div>
      <button class="btn btn-primary" onclick="submitBazarRequest()">
        📨 Submit to manager
      </button>
    </div>

    <div class="card">
      <div class="card-title">My requests</div>
      ${
        history.length === 0
          ? '<div class="empty">No requests yet</div>'
          : `<div class="tbl-wrap"><table>
            <thead><tr><th>Date</th><th>Amount</th><th>Note</th><th>Status</th><th>Submitted</th></tr></thead>
            <tbody>${history
              .map((n) => {
                const sc =
                  n.status === "approved"
                    ? "badge-green"
                    : n.status === "rejected"
                      ? "badge-red"
                      : "badge-amber";
                const sl =
                  n.status === "approved"
                    ? "Approved"
                    : n.status === "rejected"
                      ? "Rejected"
                      : "Pending";

                // Amount is stored under the member's name key
                const amount = Object.values(n.data)[0] || 0;

                return `<tr>
    <td>${n.date}</td>
    <td style="color:var(--green);font-weight:600">${fmtTk(amount)}</td>
    <td style="color:var(--text3)">${n.note || "—"}</td>
    <td><span class="badge ${sc}">${sl}</span></td>
    <td style="color:var(--text3);font-size:12px">${new Date(n.created_at).toLocaleDateString()}</td>
  </tr>`;
              })
              .join("")}</tbody>
          </table></div>`
      }
    </div>
  </div>`;
}

async function submitBazarRequest() {
  const date = document.getElementById("my-bazar-date")?.value;
  const amount = parseFloat(
    document.getElementById("my-bazar-amount")?.value || 0,
  );
  const note = cleanText(document.getElementById("my-bazar-note")?.value || "");

  if (!date) {
    toast("Select a date");
    return;
  }
  if (amount <= 0) {
    toast("Enter a valid amount");
    return;
  }

  const member = await getMe();

  // Only store under member's name — no extra 'amount' key
  const data = { [member.name]: amount };

  try {
    await dbSaveNotification({ type: "bazar_request", date, data, note });
    toast("Request sent to manager 📨", "success");
    navigate("my-bazar");
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

async function renderMyPayments(el) {
  const member = await getMe();
  if(!member) { el.innerHTML='<div class="content"><div class="empty">Profile not found</div></div>'; return; }

  const [allRent, {data:allUtil}, billNotifs] = await Promise.all([
    dbGetAll('rent'),
    sb.from('utility_payments').select('*').eq('mess_id', messId()).order('month_key', {ascending:false}),
    sb.from('notifications').select('*').eq('mess_id', messId()).eq('from_id', currentUser.memberId).eq('type','bill_payment').order('created_at',{ascending:false})
  ]);
  const billHistory = sanitize(billNotifs.data || []);
  const n = new Date();

  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">My Payments</div><div class="page-sub">Rent & utility history</div></div>
  </div>
  <div class="content">

    <!-- SUBMIT BILL PAYMENT -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">Submit a bill payment</div>
      <div class="auth-sub" style="margin-bottom:14px;font-size:13px;color:var(--text2)">If you paid a bill directly (electricity, khala, etc.) submit it here. Manager will approve and credit your account.</div>

      <div class="grid-2">
        <div class="field">
          <label>Month</label>
          <select class="input" id="bp-month">
            ${MONTHS.map((m,i) => `<option value="${i}"${i===n.getMonth()?' selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Year</label>
          <select class="input" id="bp-year">
            ${Array.from({length:3},(_,i)=>2024+i).map(y=>`<option${y===n.getFullYear()?' selected':''}>${y}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="field">
        <label>Bill type *</label>
        <select class="input" id="bp-type">
          <option value="">— Select bill —</option>
          <option value="elec">⚡ Electricity</option>
          <option value="wifi">📶 WiFi</option>
          <option value="gas">🔥 Gas</option>
          <option value="khala">👩 Khala</option>
          <option value="other">📦 Other</option>
          <option value="rent">🏠 Room Rent</option>
        </select>
      </div>

      <div class="field">
        <label>Amount paid (৳) *</label>
        <input type="number" class="input" id="bp-amount" min="0" placeholder="e.g. 1200"/>
      </div>

      <div class="field">
        <label>Note (optional)</label>
        <input type="text" class="input" id="bp-note" placeholder="e.g. Paid full electricity bill for April"/>
      </div>

      <button class="btn btn-primary" onclick="submitBillPayment()">
        📨 Submit to manager
      </button>
    </div>

    <!-- BILL PAYMENT HISTORY -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">My bill payment requests</div>
      ${billHistory.length === 0
        ? '<div class="empty">No bill payment requests yet</div>'
        : `<div class="tbl-wrap"><table>
            <thead><tr><th>Month</th><th>Bill</th><th>Amount</th><th>Note</th><th>Status</th><th>Submitted</th></tr></thead>
            <tbody>${billHistory.map(n => {
              const sc = n.status==='approved'?'badge-green':n.status==='rejected'?'badge-red':'badge-amber';
              const sl = n.status==='approved'?'Approved':n.status==='rejected'?'Rejected':'Pending';
              const billLabel = {elec:'⚡ Electricity',wifi:'📶 WiFi',gas:'🔥 Gas',khala:'👩 Khala',other:'📦 Other',rent:'🏠 Rent'}[n.data.billType]||n.data.billType;
              return `<tr>
                <td>${n.data.monthName} ${n.data.year}</td>
                <td>${billLabel}</td>
                <td style="color:var(--green);font-weight:600">${fmtTk(n.data.amount)}</td>
                <td style="color:var(--text3)">${n.note||'—'}</td>
                <td><span class="badge ${sc}">${sl}</span></td>
                <td style="color:var(--text3);font-size:12px">${new Date(n.created_at).toLocaleDateString()}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>`
      }
    </div>

    <!-- RENT HISTORY -->
    <div class="grid-2" style="gap:12px">
      <div class="card">
        <div class="card-title">Rent history</div>
        ${allRent.length ? `<div class="tbl-wrap"><table>
          <thead><tr><th>Month</th><th>Due</th><th>Paid</th><th>Status</th></tr></thead>
          <tbody>${[...allRent].sort((a,b)=>b.month_key.localeCompare(a.month_key)).map(r=>{
            const e=r.entries?.find(x=>x.name===member.name)||{};
            if(!e.rent&&!e.paid) return '';
            const cls=e.status==='paid'?'badge-green':e.status==='partial'?'badge-amber':'badge-red';
            return `<tr>
              <td>${r.month_name} ${r.year}</td>
              <td>${fmtTk(e.rent||0)}</td>
              <td style="color:var(--green)">${fmtTk(e.paid||0)}</td>
              <td><span class="badge ${cls}">${e.status==='paid'?'Paid':e.status==='partial'?'Part':'Due'}</span></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>` : '<div class="empty">No rent records</div>'}
      </div>

      <div class="card">
        <div class="card-title">Utility history</div>
        ${allUtil?.length ? `<div class="tbl-wrap"><table>
          <thead><tr><th>Month</th><th>My share</th><th>Paid</th><th>Status</th></tr></thead>
          <tbody>${allUtil.map(r=>{
            const bills=r.bills||{};
            const total=['elec','wifi','gas','khala','other'].reduce((s,k)=>s+(bills[k]||0),0);
            const perHead=members.length>0?round2(total/members.length):0;
            const p=(r.payments||{})[member.name]||{};
            const cls=p.status==='paid'?'badge-green':p.status==='partial'?'badge-amber':'badge-red';
            return `<tr>
              <td>${r.month_name} ${r.year}</td>
              <td>${fmtTk(perHead)}</td>
              <td style="color:var(--green)">${fmtTk(p.paid||0)}</td>
              <td><span class="badge ${cls}">${p.status==='paid'?'Paid':p.status==='partial'?'Part':'Due'}</span></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>` : '<div class="empty">No utility records</div>'}
      </div>
    </div>

  </div>`;
}

async function submitBillPayment() {
  const month    = parseInt(document.getElementById('bp-month')?.value);
  const year     = parseInt(document.getElementById('bp-year')?.value);
  const billType = document.getElementById('bp-type')?.value;
  const amount   = parseFloat(document.getElementById('bp-amount')?.value || 0);
  const note     = cleanText(document.getElementById('bp-note')?.value || '');

  if(!billType)    { toast('Select a bill type'); return; }
  if(amount <= 0)  { toast('Enter a valid amount'); return; }

  const key = monthKey(year, month);
  const data = {
    billType,
    amount,
    monthKey: key,
    monthName: MONTHS[month],
    year,
  };

  try {
    await dbSaveNotification({ type:'bill_payment', date: today(), data, note });
    toast('Bill payment submitted 📨', 'success');
    navigate('my-payments');
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function renderMessOverview(el) {
  const { month, year } = thisMonth();
  const key = monthKey(year, month);
  const [allM, allB] = await Promise.all([
    dbGetAll("meals"),
    dbGetAll("bazar"),
  ]);
  const mM = allM.filter((r) => r.date.startsWith(key)),
    mB = allB.filter((r) => r.date.startsWith(key));
  let totalM = 0,
    totalB = 0;
  mM.forEach((r) =>
    Object.values(r.meals || {}).forEach((v) => (totalM += Number(v))),
  );
  mB.forEach((r) =>
    Object.values(r.bazar || {}).forEach((v) => (totalB += Number(v))),
  );
  const mealRate = totalM > 0 ? round2(totalB / totalM) : 0;
  let memBazar = {};
  mB.forEach((r) =>
    Object.entries(r.bazar || {}).forEach(([k, v]) => {
      memBazar[k] = (memBazar[k] || 0) + Number(v);
    }),
  );
  const topB = Object.entries(memBazar)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6),
    maxB = topB[0]?.[1] || 1;
  el.innerHTML = `<div class="topbar"><div><div class="page-title">Mess Overview</div><div class="page-sub">${MONTHS[month]} ${year}</div></div></div><div class="content"><div class="stat-grid"><div class="stat-card"><div class="stat-label">Total meals</div><div class="stat-value">${round2(totalM)}</div></div><div class="stat-card"><div class="stat-label">Meal rate</div><div class="stat-value" style="font-size:17px">${fmtTk(mealRate)}</div></div><div class="stat-card"><div class="stat-label">Total bazar</div><div class="stat-value" style="font-size:17px">${fmtTk(totalB)}</div></div><div class="stat-card"><div class="stat-label">Members</div><div class="stat-value">${members.length}</div></div></div><div class="card" style="margin-bottom:12px"><div class="card-title">Bazar contributors</div>${topB.length ? topB.map(([name, amt]) => `<div class="mini-bar"><div class="mini-bar-label">${name}</div><div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.round((amt / maxB) * 100)}%"></div></div><div class="mini-bar-val">${fmtTk(amt)}</div></div>`).join("") : '<div class="empty">No bazar data</div>'}</div><div class="card"><div class="card-title">Member meal totals</div>${
    members.length
      ? `<div class="tbl-wrap"><table><thead><tr><th>Member</th><th>Meals</th><th>Bazar</th><th>Meal cost</th><th>Balance</th></tr></thead><tbody>${members
          .map((m) => {
            let myM = 0,
              myB = 0;
            mM.forEach((r) => {
              myM +=
                round2(
                  Number(r.meals[m.name + "_day"] ?? 0) +
                    Number(r.meals[m.name + "_night"] ?? 0),
                ) || Number(r.meals[m.name] || 0);
            });
            mB.forEach((r) => {
              myB += Number(r.bazar[m.name] || 0);
            });
            const mc = round2(myM * mealRate),
              bal = round2(myB - mc);
            return `<tr><td><b>${m.name}</b></td><td>${round2(myM)}</td><td style="color:var(--green)">${fmtTk(myB)}</td><td>${fmtTk(mc)}</td><td class="${bal >= 0 ? "net-pos" : "net-neg"}">${bal >= 0 ? "Get " + fmtTk(bal) : "Pay " + fmtTk(-bal)}</td></tr>`;
          })
          .join("")}</tbody></table></div>`
      : '<div class="empty">No members</div>'
  }</div></div>`;
}

/* ═══════════════════════════════════════════
   MODAL & TOAST
═══════════════════════════════════════════ */
function openModal() {
  document.getElementById("modal-bg").classList.add("open");
}
function closeModal() {
  document.getElementById("modal-bg").classList.remove("open");
  const m = document.querySelector(".modal");
  if (m) m.classList.remove("modal-wide");
}

let toastTimer;
function toast(msg, type) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "show" + (type ? " " + type : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 3200);
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
async function init() {
  loadTheme();
  loadSession();

  if(currentUser) {
    if(currentUser.role === 'superadmin') { bootSuperAdmin(); return; }

    // Re-fetch member's current role from DB on every page load
    // This ensures role changes (manager transfer) are reflected immediately
    if(currentUser.memberId) {
      try {
        const {data:fresh} = await sb.from('members')
          .select('role, name, username')
          .eq('id', currentUser.memberId)
          .maybeSingle();

        if(fresh) {
          // Update session with latest role from DB
          currentUser.role = fresh.role;
          saveSession(currentUser, currentMess);
        } else {
          // Member no longer exists, log out
          clearSession();
          showLanding();
          return;
        }
      } catch(e) {
        console.error('Role refresh failed:', e);
      }
    }

    await bootApp();
    return;
  }

  showLanding();
}

init();
