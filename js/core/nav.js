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
  { section:"Reports" },
  { page:"log",           label:"Monthly Log",     icon:IC.log },
  { section:"Mess" },
  { page:"announce",      label:"Announcements",   icon:IC.announce },
  { page:"chores",        label:"Chore Roster",    icon:IC.chores },
  { page:"notifications", label:"Requests",        icon:IC.bell },
  { page:"members",       label:"Members",         icon:IC.members },
  { page:"transfer",      label:"Transfer Role",   icon:IC.transfer },
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
  { page:"my-payments",   label:"My Payments",    icon:IC.rent },
  { page:"mess-overview", label:"Mess Overview",  icon:IC.log },
  { page:"my-announce",   label:"Announcements",  icon:IC.announce },
  { page:"my-chores",     label:"Chore Roster",   icon:IC.chores },
];

/* ═══════════════════════════════════════════
   BUILD NAV
═══════════════════════════════════════════ */
function buildNav() {
  const isManager = currentUser.role === "manager";
  const nav = isManager ? MANAGER_NAV : MEMBER_NAV;

  // Build sidebar HTML using a loop to avoid nested backtick issues
  let sidebarHTML = "";
  for (const i of nav) {
    if (i.section) {
      sidebarHTML += '<div class="nav-section">' + i.section + '</div>';
    } else {
      let badge = "";
      if (i.page === "notifications") badge = '<span class="notif-badge" id="notif-badge" style="display:none">0</span>';
      if (i.page === "my-announce")   badge = '<span class="notif-badge" id="announce-notif-badge" style="display:none">0</span>';
      sidebarHTML += '<button class="nav-item" onclick="navigate(\'' + i.page + '\')" data-page="' + i.page + '">' + i.icon + i.label + badge + '</button>';
    }
  }
  document.getElementById("sidebar-nav").innerHTML = sidebarHTML;

  const managerMain = [
    {page:"dashboard",    label:"Home",    icon:IC.dash},
    {page:"meals",        label:"Meals",   icon:IC.meal},
    {page:"bazar",        label:"Bazar",   icon:IC.bazar},
    {page:"notifications",label:"Requests",icon:IC.bell},
  ];
  const memberMain = [
    {page:"my-dashboard", label:"Home",  icon:IC.dash},
    {page:"my-meals",     label:"Meals", icon:IC.meal},
    {page:"my-bazar",     label:"Bazar", icon:IC.bazar},
    {page:"my-payments",  label:"Pay",   icon:IC.rent},
  ];
  const mainItems = isManager ? managerMain : memberMain;

  // Mobile bottom nav — loop to avoid nested backtick issues
  let mobileNavHTML = "";
  for (const i of mainItems) {
    mobileNavHTML += '<button class="mob-nav-btn" onclick="navigate(\'' + i.page + '\')" data-page="' + i.page + '">' + i.icon + '<span>' + i.label + '</span></button>';
  }
  mobileNavHTML += `<button class="mob-nav-btn" onclick="toggleMobileMore()" id="mob-more-btn">
    <svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="3" cy="8" r="1.2" fill="currentColor"/>
      <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
      <circle cx="13" cy="8" r="1.2" fill="currentColor"/>
    </svg>
    <span>More</span>
  </button>`;
  document.getElementById("mobile-nav").innerHTML = mobileNavHTML;

  const managerMore = [
    {page:"rent",      label:"Room Rent",     icon:IC.rent},
    {page:"utility",   label:"Utility Entry", icon:IC.util},
    {page:"log",       label:"Monthly Log",   icon:IC.log},
    {page:"profiles",  label:"Profiles",      icon:IC.profile},
    {page:"announce",  label:"Announcements", icon:IC.announce},
    {page:"chores",    label:"Chore Roster",  icon:IC.chores},
    {page:"members",   label:"Members",       icon:IC.members},
    {page:"transfer",  label:"Transfer Role", icon:IC.transfer},
    {page:"my-profile",label:"My Profile",    icon:IC.profile},
  ];
  const memberMore = [
    {page:"mess-overview",label:"Mess Overview", icon:IC.log},
    {page:"my-profile",   label:"My Profile",    icon:IC.profile},
    {page:"my-announce",  label:"Announcements", icon:IC.announce},
    {page:"my-chores",    label:"Chore Roster",  icon:IC.chores},
  ];
  const moreItems = isManager ? managerMore : memberMore;

  const existing = document.getElementById("mobile-more-drawer");
  if (existing) existing.remove();
  const existingBg = document.getElementById("mobile-more-bg");
  if (existingBg) existingBg.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "mobile-more-bg";
  backdrop.onclick = closeMobileMore;
  document.body.appendChild(backdrop);

  // Build drawer HTML using loop to avoid nested backtick issues
  let drawerItemsHTML = "";
  for (const i of moreItems) {
    let badge = "";
    if (i.page === "my-announce") badge = '<span class="notif-badge" id="announce-notif-badge-drawer" style="display:none">0</span>';
    drawerItemsHTML += '<button class="mob-drawer-item" onclick="closeMobileMore();navigate(\'' + i.page + '\')" data-page="' + i.page + '">' + i.icon + '<span>' + i.label + '</span>' + badge + '</button>';
  }

  const drawer = document.createElement("div");
  drawer.id = "mobile-more-drawer";
  drawer.innerHTML = `
    <div class="mob-drawer-handle"></div>
    <div class="mob-drawer-header">
      <div class="mob-drawer-title">More options</div>
      <button onclick="closeMobileMore()" class="mob-drawer-close">✕</button>
    </div>
    <div class="mob-drawer-user">
      <div class="avatar" style="background:${currentUser._col?.bg||"#2a2218"};color:${currentUser._col?.fg||"#d4a853"};width:36px;height:36px;font-size:13px">${initials(currentUser.name)}</div>
      <div>
        <div style="font-weight:600;font-size:14px">${currentUser.name}</div>
        <div style="font-size:11px;color:var(--text3)">${isManager?"👑 Manager":"Member"} · @${currentUser.username}</div>
      </div>
    </div>
    <div class="mob-drawer-grid">${drawerItemsHTML}</div>
    <div class="mob-drawer-footer">
      <button class="btn btn-ghost" style="width:100%;justify-content:center;font-size:13px" onclick="doLogout()">Sign out</button>
    </div>`;
  document.body.appendChild(drawer);

  const logoutBtn = document.getElementById("sidebar-logout");
  if (logoutBtn) logoutBtn.innerHTML = IC.logout + "Sign out";

  if (isManager) refreshNotifBadge();
  else refreshMemberAnnounceBadge();
}

function toggleMobileMore() {
  const drawer=document.getElementById("mobile-more-drawer"), bg=document.getElementById("mobile-more-bg");
  if(!drawer) return;
  if(drawer.classList.contains("open")) { closeMobileMore(); }
  else { drawer.classList.add("open"); bg.classList.add("open"); document.getElementById("mob-more-btn")?.classList.add("active"); }
}
function closeMobileMore() {
  const drawer=document.getElementById("mobile-more-drawer"), bg=document.getElementById("mobile-more-bg");
  if(drawer) drawer.classList.remove("open");
  if(bg) bg.classList.remove("open");
  document.getElementById("mob-more-btn")?.classList.remove("active");
}

async function refreshNotifBadge() {
  const count = await getPendingCount();
  const badge = document.getElementById("notif-badge");
  if (!badge) return;
  badge.textContent = count; badge.style.display = count > 0 ? "inline-flex" : "none";
}
async function refreshMemberAnnounceBadge() {
  const badge       = document.getElementById("announce-notif-badge");
  const badgeDrawer = document.getElementById("announce-notif-badge-drawer");
  if (!badge && !badgeDrawer) return;
  const count = await getUnreadAnnouncementCount();
  [badge, badgeDrawer].forEach(b => {
    if (!b) return;
    b.textContent = count; b.style.display = count > 0 ? "inline-flex" : "none";
  });
}

function updateSidebarUser() {
  if (!currentUser) return;
  const isManager = currentUser.role === "manager";
  const idx = members.findIndex(m => m.id === currentUser.memberId);
  const col = isManager ? { bg:"#2a2218", fg:"#d4a853" } : avatarCol(idx);
  document.getElementById("sidebar-user").innerHTML = `
    <div class="su-avatar" style="background:${col.bg};color:${col.fg}">${initials(currentUser.name)}</div>
    <div class="su-info"><div class="su-name">${currentUser.name}</div><div class="su-role">${isManager?"👑 Manager":"Member"}</div></div>`;
  const mob = document.getElementById("mob-user-badge");
  if (mob) { mob.style.background=col.bg; mob.style.color=col.fg; mob.textContent=initials(currentUser.name); }
}

/* ═══════════════════════════════════════════
   PAGE ROUTING
═══════════════════════════════════════════ */
function navigate(page) {
  currentPage = page;
  closeMobileMore();
  document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.page===page));
  document.querySelectorAll(".mob-nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page===page));
  document.querySelectorAll(".mob-drawer-item").forEach(b => b.classList.toggle("active", b.dataset.page===page));
  const mainPages = currentUser.role==="manager"
    ? ["dashboard","meals","bazar","notifications"]
    : ["my-dashboard","my-meals","my-bazar","my-payments"];
  const moreBtn = document.getElementById("mob-more-btn");
  if (moreBtn) moreBtn.classList.toggle("mob-more-active", !mainPages.includes(page));
  const main = document.getElementById("main-content");
  main.innerHTML = '<div class="loading" style="min-height:200px"><div class="spinner"></div>Loading…</div>';
  renderPage(page);
}

async function renderPage(page) {
  members = await dbGetMembers();
  updateSidebarUser();
  const main = document.getElementById("main-content");
  const isManager = currentUser.role === "manager";
  const managerOnly = ["dashboard","profiles","meals","bazar","utility","rent","log","members","announce","chores","transfer","notifications"];
  if (!isManager && managerOnly.includes(page)) page = "my-dashboard";
  main.innerHTML = "";
  const div = document.createElement("div");
  div.className = "page-enter"; div.style.minHeight = "100%";
  main.appendChild(div);
  try {
    switch (page) {
      case "dashboard":     await renderDashboard(div);              break;
      case "profiles":      await renderProfiles(div);               break;
      case "meals":               renderMeals(div);                  break;
      case "bazar":               renderBazar(div);                  break;
      case "utility":       await renderUtility(div);                break;
      case "rent":                renderRent(div);                   break;
      case "log":                 renderLog(div);                    break;
      case "members":             renderMembers(div);                break;
      case "announce":      await renderAnnouncements(div, true);    break;
      case "chores":        await renderChores(div, true);           break;
      case "transfer":      await renderTransferRole(div);           break;
      case "my-profile":    await renderMyProfile(div);              break;
      case "my-dashboard":  await renderMyDashboard(div);            break;
      case "my-meals":      await renderMyMeals(div);                break;
      case "my-bazar":      await renderMyBazar(div);                break;
      case "my-payments":   await renderMyPayments(div);             break;
      case "mess-overview": await renderMessOverview(div);           break;
      case "my-announce":   await renderAnnouncements(div, false);   break;
      case "my-chores":     await renderChores(div, false);          break;
      case "notifications": await renderNotifications(div);          break;
      default: div.innerHTML = '<div class="content"><div class="empty">Page not found</div></div>';
    }
  } catch (e) {
    div.innerHTML = `<div class="content"><div class="empty">Error loading page: ${e.message}</div></div>`;
    console.error(e);
  }
}