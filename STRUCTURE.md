# MessManager — Folder Structure

```
mess-manager/
│
├── index.html
├── STRUCTURE.md
│
├── css/
│   ├── 01-variables.css          ← CSS tokens, dark/light theme, reset
│   ├── 02-landing.css            ← Landing page styles
│   ├── 03-auth.css               ← Login & create-mess screens
│   ├── 04-layout.css             ← App shell, sidebar, mobile nav, drawer
│   ├── 05-components.css         ← Cards, buttons, inputs, tables, badges, modals, toast
│   └── 06-animations-responsive.css  ← Keyframes + all @media breakpoints
│
└── js/
    │
    ├── core/                     ← Shared by both manager and member
    │   ├── config.js             ← Supabase client, global state, constants (MONTHS, PALETTE)
    │   ├── helpers.js            ← Utils (fmtTk, round2, today…), theme, session, modal, toast
    │   ├── db.js                 ← All Supabase query functions (meals, bazar, rent, util, members…)
    │   ├── auth.js               ← Login, create mess, logout, superadmin panel, bootApp
    │   └── nav.js                ← Nav icons, sidebar build, mobile drawer, page routing
    │
    ├── manager/                  ← Only loaded/used when role === "manager"
    │   ├── dashboard.js          ← Dashboard: stats, today's meals, bazar leaders, rent status
    │   ├── profiles.js           ← Member profiles: cards, detail modal, stats helpers,
    │   │                            getMemberStats, getPrevMonthMealBalance, getUtilityBalance,
    │   │                            buildWhatIOweHTML (shared helper used by member too)
    │   ├── meals.js              ← Meal entry: per-member day/night inputs, save, load by date
    │   ├── bazar.js              ← Bazar entry: per-member amounts, save, load by date
    │   ├── utility.js            ← Utility bills: elec/wifi/gas (prepaid), khala/other (postpaid),
    │   │                            payment tracking per member
    │   ├── log.js                ← Room rent entry + Monthly settlement log (prepaid/postpaid split)
    │   ├── announcements.js      ← Post/delete announcements, mark-read badge system
    │   ├── notifications.js      ← View/approve/reject member requests (meal, bazar, bill payment)
    │   └── members.js            ← Add/edit/delete members, transfer role, settings page
    │
    └── member/                   ← Only loaded/used when role === "member"
        ├── dashboard.js          ← My Dashboard: settlement stats, today's meals, What I Owe
        │                            My Profile: stats, history, mess share, recent months
        └── pages.js              ← My Meals (request), My Bazar (request), My Payments,
                                     Mess Overview, submit helpers (submitMealRequest etc.)
```

## Script load order in index.html

```html
<!-- Core (always loaded) -->
<script src="js/core/config.js"></script>    ← declares: sb, currentUser, MONTHS
<script src="js/core/helpers.js"></script>   ← declares: fmtTk, toast, sanitize, toggleTheme
<script src="js/core/db.js"></script>        ← declares: dbGetAll, dbSaveMember, etc.
<script src="js/core/auth.js"></script>      ← declares: doLogin, bootApp, doLogout
<script src="js/core/nav.js"></script>       ← declares: buildNav, navigate, renderPage

<!-- Manager pages -->
<script src="js/manager/dashboard.js"></script>
<script src="js/manager/profiles.js"></script>      ← also declares buildWhatIOweHTML (used by member)
<script src="js/manager/meals.js"></script>
<script src="js/manager/bazar.js"></script>
<script src="js/manager/utility.js"></script>
<script src="js/manager/log.js"></script>
<script src="js/manager/announcements.js"></script>
<script src="js/manager/notifications.js"></script>
<script src="js/manager/members.js"></script>       ← also declares renderSettings

<!-- Member pages -->
<script src="js/member/dashboard.js"></script>      ← renderMyDashboard, renderMyProfile
<script src="js/member/pages.js"></script>          ← renderMyMeals, renderMyBazar, renderMyPayments
```

## Who renders what

| Page key        | Function              | File                        |
|-----------------|-----------------------|-----------------------------|
| `dashboard`     | renderDashboard       | manager/dashboard.js        |
| `profiles`      | renderProfiles        | manager/profiles.js         |
| `meals`         | renderMeals           | manager/meals.js            |
| `bazar`         | renderBazar           | manager/bazar.js            |
| `utility`       | renderUtility         | manager/utility.js          |
| `rent` / `log`  | renderRent/renderLog  | manager/log.js              |
| `announce`      | renderAnnouncements   | manager/announcements.js    |
| `notifications` | renderNotifications   | manager/notifications.js    |
| `members`       | renderMembers         | manager/members.js          |
| `transfer`      | renderTransferRole    | manager/members.js          |
| `settings`      | renderSettings        | manager/members.js          |
| `my-dashboard`  | renderMyDashboard     | member/dashboard.js         |
| `my-profile`    | renderMyProfile       | member/dashboard.js         |
| `my-meals`      | renderMyMeals         | member/pages.js             |
| `my-bazar`      | renderMyBazar         | member/pages.js             |
| `my-payments`   | renderMyPayments      | member/pages.js             |
| `mess-overview` | renderMessOverview    | member/pages.js             |
| `my-announce`   | renderAnnouncements   | manager/announcements.js    |
| `my-chores`     | renderChores          | manager/announcements.js    |
