/* ═══════════════════════════════════════════
   NAV ICONS
═══════════════════════════════════════════ */
const IC = {
  dash:    `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>`,
  profile: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>`,
  meal:    `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2v12M8 2v4M13 2v12M8 6c0 2.5-2 3-2 5"/></svg>`,
  bazar:   `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4h12l-1.5 7H3.5L2 4z"/><circle cx="6" cy="13" r="1"/><circle cx="11" cy="13" r="1"/></svg>`,
  util:    `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1v3M8 12v3M3.5 3.5l2 2M10.5 10.5l2 2M1 8h3M12 8h3M3.5 12.5l2-2M10.5 5.5l2-2"/></svg>`,
  rent:    `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="5" width="12" height="9" rx="1"/><path d="M5 5V4a3 3 0 016 0v1"/><path d="M8 9v2"/></svg>`,
  log:     `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M5 6h6M5 9h4"/></svg>`,
  members: `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="5" r="2.5"/><path d="M1 13c0-2.8 2.2-5 5-5"/><circle cx="12" cy="7" r="2"/><path d="M9 14c0-1.7 1.3-3 3-3s3 1.3 3 3"/></svg>`,
  announce:`<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 5L8 8 3 5M3 4h10a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg>`,
  chores:  `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8h12M2 4h12M2 12h8"/></svg>`,
  bell:    `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1a5 5 0 015 5v3l1.5 2H1.5L3 9V6a5 5 0 015-5zM6.5 13a1.5 1.5 0 003 0"/></svg>`,
  transfer:`<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 3l3 3-3 3M2 6h12M5 13l-3-3 3-3M14 10H2"/></svg>`,
  logout:  `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6"/></svg>`,
  moon:    `<svg class="nav-icon moon-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 10.5A5.5 5.5 0 015.5 3 6 6 0 1013 10.5z"/></svg>`,
  sun:     `<svg class="nav-icon sun-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M13 3l-1.5 1.5M4.5 11.5L3 13"/></svg>`,
  chart:   `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12l3-4 3 2 3-5 3 3"/><path d="M2 14h12"/></svg>`,
  export:  `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1v8M5 6l3 3 3-3"/><path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"/></svg>`,
  audit:   `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></svg>`,
  attend:  `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="11" rx="1"/><path d="M5 1v3M11 1v3M2 7h12M6 11l1.5 1.5L11 9"/></svg>`,
  rules:   `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2h8a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M5 6h6M5 9h4M5 12h3"/></svg>`,
  broadcast:`<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8c0 0 3-5 7-5s7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>`,
  roles:   `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="5" cy="5" r="2"/><circle cx="11" cy="5" r="2"/><path d="M1 13c0-2.2 1.8-4 4-4"/><path d="M8 13c0-2.2 1.8-4 4-4s4 1.8 4 4"/><path d="M7 9h2"/></svg>`,
  lock:    `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="10" height="8" rx="1"/><path d="M5 7V5a3 3 0 016 0v2"/><circle cx="8" cy="11" r="1" fill="currentColor" stroke="none"/></svg>`,
  fund:    `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v6M6 7h3a1 1 0 010 2H7a1 1 0 000 2h3"/></svg>`,
};

const MANAGER_NAV = [
  { section:"Overview" },
  { page:"dashboard",     label:"Dashboard",       icon:IC.dash },
  { page:"profiles",      label:"Member Profiles", icon:IC.profile },

  { section:"Entry" },
  { page:"meals",         label:"Meal Entry",      icon:IC.meal },
  { page:"bazar",         label:"Bazar Entry",     icon:IC.bazar },
  { page:"utility",       label:"Utility Entry",   icon:IC.util },
  { page:"rent",          label:"Room Rent",       icon:IC.rent },
  { page:"collect",       label:"Collect Payment", icon:IC.bazar },

  { section:"Reports" },
  { page:"log",           label:"Monthly Log",     icon:IC.log },
  { page:"rate-chart",    label:"Meal Rate Chart", icon:IC.chart },
  { page:"audit-log",     label:"Audit Log",       icon:IC.audit },
  { page:"mess-rules",    label:"Mess Rules",      icon:IC.rules },
  { page:"month-lock",    label:"Month Close",     icon:IC.lock },
  { page:"mess-fund",     label:"Mess Fund",       icon:IC.fund },

  { section:"Mess" },
  { page:"messages",      label:"Messages",        icon:IC.broadcast },
  { page:"notifications", label:"Notifications",   icon:IC.bell },
  { page:"members",       label:"Members",         icon:IC.members },

  { section:"Account" },
  { page:"my-profile",    label:"My Profile",      icon:IC.profile },
];

const MEMBER_NAV = [
  { section:"My Account" },
  { page:"my-dashboard",  label:"My Dashboard",   icon:IC.dash },
  { page:"my-profile",    label:"My Profile",     icon:IC.profile },

  { section:"Mess" },
  { page:"my-meals",      label:"Meal Log",       icon:IC.meal },
  { page:"my-bazar",      label:"Bazar Log",      icon:IC.bazar },
  { page:"my-payments",   label:"Utility/Rent",   icon:IC.rent },
  { page:"my-messages",   label:"Messages",       icon:IC.broadcast },
  { page:"my-rules",      label:"Mess Info",      icon:IC.rules },
];

/* ═══════════════════════════════════════════
   BUILD NAV
═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   BUILD NAV
═══════════════════════════════════════════ */
function buildNav() {
  const isManager = currentUser.role === "manager";
  const isSubMgr  = currentUser.role === "sub_manager";
  const nav = (isManager || isSubMgr) ? MANAGER_NAV : MEMBER_NAV;

  // Filter out pages sub_manager can't access
  const subMgrBlocked = ["members","transfer","manager-roles"];
  const filteredNav = isSubMgr
    ? nav.filter(i => !i.page || !subMgrBlocked.includes(i.page))
    : nav;

  /* Sidebar */
  let sidebarHTML = "";

  for (const i of filteredNav) {
    if (i.section) {
      sidebarHTML += '<div class="nav-section">' + i.section + '</div>';
    } else {
      let badge = "";

      if (i.page === "notifications") {
        badge = '<span class="notif-badge" id="notif-badge" style="display:none">0</span>';
      }

      if (i.page === "my-announce") {
        badge = '<span class="notif-badge" id="announce-notif-badge" style="display:none">0</span>';
      }

      sidebarHTML +=
        '<button class="nav-item" onclick="navigate(\'' + i.page + '\')" data-page="' + i.page + '">' +
          i.icon +
          i.label +
          badge +
        '</button>';
    }
  }

  document.getElementById("sidebar-nav").innerHTML = sidebarHTML;

  /* Mobile bottom nav: only main options + More */
  const managerMainPages = [
    "dashboard",
    "meals",
    "bazar",
    "notifications",
  ];

  const memberMainPages = [
    "my-dashboard",
    "my-meals",
    "my-bazar",
    "my-payments",
  ];

  const mainPages = isManager ? managerMainPages : memberMainPages;

  const mobileMainItems = filteredNav.filter(i =>
    !i.section && mainPages.includes(i.page)
  );

  const mobileMoreItems = filteredNav.filter(i =>
    !i.section && !mainPages.includes(i.page)
  );

  let mobileNavHTML = "";

  for (const i of mobileMainItems) {
    let badge = "";

    if (i.page === "notifications") {
      badge = '<span class="notif-badge mob-inline-badge" id="notif-badge-mobile" style="display:none">0</span>';
    }

    if (i.page === "my-announce") {
      badge = '<span class="notif-badge mob-inline-badge" id="announce-notif-badge-mobile" style="display:none">0</span>';
    }

    mobileNavHTML +=
      '<button class="mob-nav-btn" onclick="navigate(\'' + i.page + '\')" data-page="' + i.page + '">' +
        i.icon +
        '<span>' + i.label + '</span>' +
        badge +
      '</button>';
  }

  mobileNavHTML += `
    <button class="mob-nav-btn" onclick="toggleMobileMore()" id="mob-more-btn" data-page="more">
      <svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="3" cy="8" r="1.2" fill="currentColor"/>
        <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
        <circle cx="13" cy="8" r="1.2" fill="currentColor"/>
      </svg>
      <span>More</span>
    </button>`;

  document.getElementById("mobile-nav").innerHTML = mobileNavHTML;

  /* Remove old drawer if exists */
  const existing = document.getElementById("mobile-more-drawer");
  if (existing) existing.remove();

  const existingBg = document.getElementById("mobile-more-bg");
  if (existingBg) existingBg.remove();

  /* More drawer backdrop */
  const backdrop = document.createElement("div");
  backdrop.id = "mobile-more-bg";
  backdrop.onclick = closeMobileMore;
  document.body.appendChild(backdrop);

  /* More drawer items */
  let drawerItemsHTML = "";

  for (const i of mobileMoreItems) {
    let badge = "";

    if (i.page === "my-announce") {
      badge = '<span class="notif-badge" id="announce-notif-badge-drawer" style="display:none">0</span>';
    }

    drawerItemsHTML +=
      '<button class="mob-drawer-item" onclick="closeMobileMore();navigate(\'' + i.page + '\')" data-page="' + i.page + '">' +
        i.icon +
        '<span>' + i.label + '</span>' +
        badge +
      '</button>';
  }

  drawerItemsHTML += `
    <button class="mob-drawer-item" onclick="toggleTheme();closeMobileMore()" data-page="theme">
      ${IC.moon}
      ${IC.sun}
      <span class="drawer-theme-label">Light mode</span>
    </button>

    <button class="mob-drawer-item" onclick="closeMobileMore();openChangePasswordModal(currentUser?.memberId)" data-page="change-pw">
      <svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 016 0v2"/><circle cx="8" cy="11" r="1" fill="currentColor" stroke="none"/></svg>
      <span>Change Password</span>
    </button>

    <button class="mob-drawer-item mob-drawer-signout" onclick="doLogout()" data-page="logout">
      ${IC.logout}
      <span>Sign out</span>
    </button>`;

  const drawer = document.createElement("div");
  drawer.id = "mobile-more-drawer";

  drawer.innerHTML = `
    <div class="mob-drawer-handle"></div>

    <div class="mob-drawer-header">
      <div class="mob-drawer-title">More options</div>
      <button onclick="closeMobileMore()" class="mob-drawer-close">✕</button>
    </div>

    <div class="mob-drawer-user">
      <div class="avatar" style="background:${currentUser._col?.bg || "#2a2218"};color:${currentUser._col?.fg || "#d4a853"};width:36px;height:36px;font-size:13px">
        ${initials(currentUser.name)}
      </div>

      <div>
        <div style="font-weight:600;font-size:14px">${currentUser.name}</div>
        <div style="font-size:11px;color:var(--text3)">
          ${isManager ? "👑 Manager" : "Member"} · @${currentUser.username}
        </div>
      </div>
    </div>

    <div class="mob-drawer-grid">
      ${drawerItemsHTML}
    </div>`;

  document.body.appendChild(drawer);

  const logoutBtn = document.getElementById("sidebar-logout");
  if (logoutBtn) logoutBtn.innerHTML = IC.logout + "Sign out";

  if (isManager) refreshNotifBadge();
  else refreshMemberAnnounceBadge();
}

function toggleMobileMore() {
  const drawer = document.getElementById("mobile-more-drawer");
  const bg = document.getElementById("mobile-more-bg");
  const moreBtn = document.getElementById("mob-more-btn");

  if (!drawer || !bg) return;

  if (drawer.classList.contains("open")) {
    closeMobileMore();
  } else {
    drawer.classList.add("open");
    bg.classList.add("open");
    moreBtn?.classList.add("active");
  }
}

function closeMobileMore() {
  const drawer = document.getElementById("mobile-more-drawer");
  const bg = document.getElementById("mobile-more-bg");
  const moreBtn = document.getElementById("mob-more-btn");

  if (drawer) drawer.classList.remove("open");
  if (bg) bg.classList.remove("open");

  moreBtn?.classList.remove("active");
}

function removeMobileMoreDrawer() {
  const existing = document.getElementById("mobile-more-drawer");
  if (existing) existing.remove();

  const existingBg = document.getElementById("mobile-more-bg");
  if (existingBg) existingBg.remove();

  document.getElementById("mob-more-btn")?.classList.remove("active");
}

/* ═══════════════════════════════════════════
   BADGES
═══════════════════════════════════════════ */
async function refreshNotifBadge() {
  const count = await getPendingCount();

  const badges = [
    document.getElementById("notif-badge"),
    document.getElementById("notif-badge-mobile"),
  ];

  badges.forEach(badge => {
    if (!badge) return;

    badge.textContent = count;
    badge.style.display = count > 0 ? "inline-flex" : "none";
  });
}

async function refreshMemberAnnounceBadge() {
  const badges = [
    document.getElementById("announce-notif-badge"),
    document.getElementById("announce-notif-badge-mobile"),
    document.getElementById("announce-notif-badge-drawer"),
  ];

  if (!badges.some(Boolean)) return;

  const count = await getUnreadAnnouncementCount();

  badges.forEach(badge => {
    if (!badge) return;

    badge.textContent = count;
    badge.style.display = count > 0 ? "inline-flex" : "none";
  });
}

/* ═══════════════════════════════════════════
   SIDEBAR USER
═══════════════════════════════════════════ */
function updateSidebarUser() {
  if (!currentUser) return;

  const isManager = currentUser.role === "manager";
  const isSubMgr  = currentUser.role === "sub_manager";
  const idx = members.findIndex(m => m.id === currentUser.memberId);
  const col = isManager
    ? { bg:"#2a2218", fg:"#d4a853" }
    : isSubMgr
      ? { bg:"#1a2a3a", fg:"#5b9bd5" }
      : avatarCol(idx);

  document.getElementById("sidebar-user").innerHTML = `
    <div class="su-avatar" style="background:${col.bg};color:${col.fg}">
      ${initials(currentUser.name)}
    </div>

    <div class="su-info">
      <div class="su-name">${currentUser.name}</div>
      <div class="su-role">${isManager ? "👑 Manager" : isSubMgr ? "⚡ Sub-manager" : "Member"}</div>
    </div>`;

  const mob = document.getElementById("mob-user-badge");

  if (mob) {
    mob.style.background = col.bg;
    mob.style.color = col.fg;
    mob.textContent = initials(currentUser.name);
  }
}

/* ═══════════════════════════════════════════
   PAGE ROUTING
═══════════════════════════════════════════ */
function navigate(page) {
  currentPage = page;

  closeMobileMore();

  document.querySelectorAll(".nav-item").forEach(n => {
    n.classList.toggle("active", n.dataset.page === page);
  });

  document.querySelectorAll(".mob-nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.page === page);
  });

  const moreBtn = document.getElementById("mob-more-btn");
  if (moreBtn) moreBtn.classList.remove("mob-more-active");

  const main = document.getElementById("main-content");

  main.innerHTML = `
    <div class="loading" style="min-height:200px">
      <div class="spinner"></div>
      Loading…
    </div>`;

  renderPage(page);
}

async function renderPage(page) {
  members = await dbGetMembers(); buildInitialsMap(members);

  updateSidebarUser();

  const main = document.getElementById("main-content");
  const isManager = currentUser.role === "manager";
  const isSubMgr  = currentUser.role === "sub_manager";

  // Pages only full manager can access
  const fullManagerOnly = [
    "members", "transfer", "manager-roles",
  ];

  // Pages manager OR sub_manager can access
  const managerOrSubOnly = [
    "dashboard", "profiles", "meals", "bazar", "utility", "rent",
    "collect", "log", "notifications",
    "rate-chart", "audit-log",
    "messages", "mess-rules", "month-lock", "mess-fund",
  ];

  if (!isManager && fullManagerOnly.includes(page)) {
    page = isSubMgr ? "dashboard" : "my-dashboard";
  }
  if (!isManager && !isSubMgr && managerOrSubOnly.includes(page)) {
    page = "my-dashboard";
  }

  main.innerHTML = "";

  const div = document.createElement("div");
  div.className = "page-enter";
  div.style.minHeight = "100%";

  main.appendChild(div);

  try {
    switch (page) {
      case "dashboard":      await renderDashboard(div);              break;
      case "profiles":       await renderProfiles(div);               break;
      case "meals":                renderMeals(div);                  break;
      case "bazar":                renderBazar(div);                  break;
      case "utility":        await renderUtility(div);                break;
      case "rent":                 renderRent(div);                   break;
      case "collect":        await renderCollect(div);                break;
      case "log":                  renderLog(div);                    break;
      case "members":              renderMembers(div);                break;
      case "transfer":       await renderTransferRole(div);           break;
      case "notifications":  await renderNotifications(div);          break;

      // ── New manager pages ──
      case "rate-chart":     await renderMealRateChart(div);          break;
      case "audit-log":      await renderAuditLog(div);               break;
      case "month-lock":     await renderMonthLock(div);              break;
      case "messages":       await renderMessages(div, true);          break;


      case "mess-fund":      await renderMessFund(div);               break;
      case "mess-rules":     await renderMessRules(div, true);        break;

      // ── Member pages ──
      case "my-profile":     await renderMyProfile(div);              break;
      case "my-dashboard":   await renderMyDashboard(div);            break;
      case "my-meals":       await renderMyMeals(div);                break;
      case "my-bazar":       await renderMyBazar(div);                break;
      case "my-payments":    await renderMyPayments(div);             break;
      case "mess-overview":  await renderMessOverview(div);           break;

      // ── New member pages ──
      case "my-messages":    await renderMessages(div, false);         break;
      case "my-rules":       await renderMessRules(div, false);       break;

      default:
        div.innerHTML = '<div class="content"><div class="empty">Page not found</div></div>';
    }
  } catch (e) {
    div.innerHTML = `
      <div class="content">
        <div class="empty">Error loading page: ${e.message}</div>
      </div>`;

    console.error(e);
  }
}