# MessManager v7 🏠

A production-ready mess management web app for shared housing (mess/hostel) in Bangladesh. Handles meals, bazar, rent, utility bills, member settlements, and monthly accounting — all from a single-page web app backed by Supabase.

---

## 📋 Table of Contents

- [Quick Setup](#-quick-setup)
- [File Structure](#-file-structure)
- [User Roles](#-user-roles)
- [Features](#-features)
- [Settlement Model](#-settlement-model)
- [Navigation & Routing](#-navigation--routing)
- [Database Schema](#-database-schema)
- [Security (Path C)](#-security-path-c)
- [Mobile Support](#-mobile-support)
- [Customization](#-customization)

---

## 🚀 Quick Setup

### Step 1 — Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project
2. Open **SQL Editor** → paste and run `database.sql`
3. For v7 features (attendance, broadcasts, mess rules, audit log) also run `supabase/migration-v7-features.sql`
4. Go to **Project Settings → API** and copy your **Project URL** and **Anon/Public key**

### Step 2 — Configure

Open `js/core/config.js` and update:

```js
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_KEY = "your-anon-public-key";
```

### Step 3 — Deploy

Pure static site — no build step needed. Upload the folder to any static host:

| Host | Method |
|---|---|
| **Netlify** | Drag & drop folder at netlify.com/drop |
| **Vercel** | `vercel deploy` |
| **GitHub Pages** | Push repo → enable Pages on `main` |
| **Any FTP host** | Upload all files as-is |

---

## 📁 File Structure

```
MessManager-v6/
├── index.html                          # Single-page app shell + all script tags
├── database.sql                        # Run once in Supabase SQL Editor
│
├── css/
│   ├── 01-variables.css                # Design tokens, colours, dark mode vars
│   ├── 02-landing.css                  # Landing & auth screen styles
│   ├── 03-auth.css                     # Login / create-mess form styles
│   ├── 04-layout.css                   # Sidebar, topbar, shell layout
│   ├── 05-components.css               # Cards, tables, modals, badges, forms
│   └── 06-animations-responsive.css    # Transitions + mobile breakpoints
│
├── js/
│   ├── core/
│   │   ├── config.js       # Supabase client, getClient(), _getSessionToken(), password hashing
│   │   ├── db.js           # dbGetAll, dbGetMonth, dbUpsertMeals, dbUpsertBazar, dbDeleteMember…
│   │   ├── db-ext.js       # Audit log, meal attendance, broadcasts, mess rules DB functions
│   │   ├── helpers.js      # calcMemberSettlement, fmtTk, round2, saveSession, loadSession…
│   │   ├── auth.js         # Login, create-mess, superadmin panel, signSessionJWT, bootApp
│   │   └── nav.js          # Page routing, sidebar builder, mobile nav, renderPage switch
│   │
│   ├── manager/
│   │   ├── dashboard.js    # Mess overview: stat cards, ring charts, heatmap, today's meals
│   │   ├── profiles.js     # Member profile popups: full stats, settlement, recent months
│   │   ├── meals.js        # Daily meal entry (day/night split), meal calendar view
│   │   ├── bazar.js        # Daily bazar entry per member
│   │   ├── utility.js      # Monthly utility bills (elec, gas, wifi, khala, other)
│   │   ├── collect.js      # Collect payment from member + print payment receipt
│   │   ├── log.js          # Monthly settlement report + print PDF layout
│   │   ├── announcements.js # Post, pin, delete mess-wide notices
│   │   ├── notifications.js # Approve/reject member requests (meal, bazar, bill)
│   │   ├── members.js      # Add, edit, remove members; password reset
│   │   ├── features.js     # Absence calendar, broadcasts, mess rules editor, meal rate chart
│   │   ├── audit.js        # Audit log viewer with entity filter and pagination
│   │   └── roles.js        # Promote/demote sub-managers
│   │
│   └── member/
│       ├── dashboard.js    # Personal dashboard: net payable, heatmap, broadcasts, mess snapshot
│       └── pages.js        # Meal log (with absence range picker), bazar log, payments, profile
│
└── supabase/
    ├── migration-v7-features.sql           # New tables: audit_log, meal_attendance, mess_rules, broadcasts
    ├── rls-policies.sql                    # Row Level Security policies (optional — see Security section)
    └── functions/
        └── sign-session-jwt/
            └── index.ts                   # Edge Function: signs mess-scoped JWT for RLS
```

---

## 👤 User Roles

### 👑 Manager
- Created automatically when a new mess is created
- Full access to all entry pages, reports, member management, and settings
- Can promote members to **Sub-manager**
- Can transfer the manager role to any other member at any time

### ⚡ Sub-manager
- Promoted by the manager from the **Manager Roles** page
- Can enter meals, bazar, utility, and rent; post announcements; collect payments
- Cannot add/remove members, change passwords, promote others, or transfer role

### 👤 Member
- Added by the manager with a unique username and password
- Personal dashboard showing their own net payable, meal activity, and mess snapshot
- Can submit meal/bazar/bill requests (pending manager approval)
- Can mark absence ranges in the Meal Log section
- Can view announcements, chore roster, and mess info

---

## 🗂️ Features

### Manager pages

| Page | Description |
|---|---|
| **Dashboard** | Stat cards with ring charts, meal activity heatmap, today's meals, bazar leaders, rent status, member meal comparison |
| **Member Profiles** | Per-member popup: full stats, settlement breakdown, recent months table, What I Owe section |
| **Meal Entry** | Enter day/night meals per member per date; view monthly calendar |
| **Bazar Entry** | Enter grocery amounts per member per date |
| **Utility Entry** | Enter monthly bills: electricity, gas, WiFi, khala, other; manage per-member payments |
| **Room Rent** | Set and track rent per member; mark paid/partial/unpaid |
| **Collect Payment** | Receive cash from a member, auto-allocate to meal/rent/utility, print receipt |
| **Absence Calendar** | Full-month calendar showing which members are absent each day (from both meal entries and explicit toggles) |
| **Monthly Log** | Full settlement report with all columns; print PDF layout |
| **Meal Rate Chart** | Bar chart of per-meal cost over all months with average line |
| **Audit Log** | Every data change logged with actor, timestamp, and summary; filterable by entity |
| **Announcements** | Post and manage mess-wide notices |
| **Broadcasts** | Send urgent banners that appear on every member's dashboard |
| **Mess Rules** | Set WiFi password, bank/payment info, rules text, emergency contacts |
| **Chore Roster** | Assign and track cleaning duties |
| **Notifications** | Review and approve/reject member requests |
| **Members** | Add, edit, remove members; reset passwords |
| **Manager Roles** | Promote/demote sub-managers with permission table |
| **Transfer Role** | Hand off manager role to another member |

### Member pages

| Page | Description |
|---|---|
| **My Dashboard** | Net payable hero card, broadcast banners, mess-wide stat cards, my meal heatmap, today's meals with personal status, who-ate-how-much chart, bazar leaderboard |
| **Meal Log** | Absence range picker (mark absent for a date range in one click), upcoming absences list, meal entry form, month history |
| **Bazar Log** | Personal bazar history |
| **Utility/Rent** | Submit bill payments; view payment status |
| **Mess Overview** | Mess-wide meal and bazar summary |
| **Announcements** | Read mess notices |
| **Chore Roster** | View assigned duties |
| **Mess Info** | Read WiFi password, payment info, rules, and contacts set by the manager |
| **My Profile** | Personal stats, settlement breakdown, recent months |

---

## 💰 Settlement Model

Settlement is calculated monthly. Each settlement month uses data from **two different months**:

### 🔴 Postpaid — from the **previous** month

These are settled at month end because the amounts are only known after the month closes:

| Item | Formula |
|---|---|
| **Meal cost** | meals eaten × (total bazar ÷ total meals) |
| **Khala salary share** | khala bill ÷ number of members |
| **Other charges share** | other bill ÷ number of members |

### 🔵 Prepaid — from the **current** month

These are fixed amounts known at the start of the month:

| Item | Formula |
|---|---|
| **Room rent** | fixed amount per member |
| **Utility share** | (electricity + gas + WiFi) ÷ number of members |

### ✅ Credits (deducted)

| Credit | Source |
|---|---|
| **Bazar contributed** | grocery amounts the member bought |
| **Rent paid** | amount marked paid in rent collection |
| **Utility paid** | amount paid in utility collection |
| **Meal cash paid** | direct cash payment for meal balance |
| **↩ Carried forward** | overpayment or mess-owes credit from previous month |

### Net formula

```
Net = Meal cost + Khala + Other + Rent + Utility
    − Bazar − Rent paid − Utility paid − Meal paid − Carried fwd

Positive → member owes the mess
Negative → mess owes the member
```

---

## 🧭 Navigation & Routing

All routing is client-side via `renderPage(page)` in `nav.js`. The URL does not change — the app is a true SPA.

**Access control:**

- `manager` role → sees full manager nav; blocked from member-only pages
- `sub_manager` role → sees manager nav minus: Members, Transfer Role, Manager Roles
- `member` role → sees member nav only; redirected away from any manager page
- `superadmin` → special login that shows a separate admin panel (all messes, metrics)

**Mobile nav** shows the 5 most-used pages as bottom tabs. All other pages are reachable via the **More** drawer.

---

## 🗄️ Database Schema

### Core tables (from `database.sql`)

| Table | Purpose |
|---|---|
| `messes` | One row per mess — `name`, `location`, `created_at` |
| `members` | All users — `name`, `username`, `password` (PBKDF2 hash), `role`, `room`, `rent`, `phone`, `joined` |
| `meals` | Daily meal log — `date`, `meals` (JSONB: `{ "Name_day": 1, "Name_night": 1 }`) |
| `bazar` | Daily grocery log — `date`, `bazar` (JSONB: `{ "Name": 250 }`) |
| `rent` | Monthly rent — `month_key`, `entries` (JSONB array with paid/status per member) |
| `utility_payments` | Monthly bills — `month_key`, `bills` (JSONB), `payments` (JSONB per member) |
| `announcements` | Mess notices — `title`, `body`, `pinned`, `author` |
| `chores` | Chore assignments — `week_label`, `assignments` (JSONB) |
| `notifications` | Member requests — `type`, `payload`, `status` (pending/approved/rejected) |

### v7 tables (from `supabase/migration-v7-features.sql`)

| Table | Purpose |
|---|---|
| `audit_log` | Every data change — `actor_name`, `action`, `entity`, `summary`, `details` (JSONB) |
| `meal_attendance` | Member absence records — `member_id`, `date`, `day_meal`, `night_meal` |
| `mess_rules` | Pinned info — `wifi_pass`, `bank_info`, `rules_text`, `contacts` |
| `broadcasts` | Urgent banners — `message`, `priority`, `author`, `expires_at` |

---

## 🛡️ Security (Path C)

The app ships with a client-side auth system (PBKDF2 password hashing). Optional **Row Level Security** can be enabled in three steps:

### Step 1 — Deploy the Edge Function

```bash
supabase functions deploy sign-session-jwt
```

Then in Supabase Dashboard → Edge Functions → **sign-session-jwt** → Secrets, add:

```
SESSION_JWT_SECRET = <64-char random hex>
```

Generate one with:
```bash
openssl rand -hex 32
```

### Step 2 — Tell Supabase to trust your JWT

Supabase Dashboard → **Settings → API → JWT Secret** → paste the same secret.

### Step 3 — Run RLS policies

In SQL Editor, run `supabase/rls-policies.sql`. This enables RLS on all tables and adds policies so each mess can only read its own data.

### How it works

```
Login → Edge Function signs JWT with { mess_id, member_id, role }
      → JWT stored in localStorage alongside session
      → All DB calls use getClient() which sends Authorization: Bearer <jwt>
      → Supabase RLS reads mess_id from JWT → blocks cross-mess queries
```

**Without Path C:** The app works normally using the anon key. `getClient()` falls back to `sb` (the anon client) when no JWT is present — zero impact on functionality.

---

## 📱 Mobile Support

- Responsive layout with sidebar hidden on mobile
- Bottom navigation bar with 5 primary tabs + More drawer
- All modals, tables, and cards adapt to narrow screens
- Profile popup, settlement sections, and report tables are horizontally scrollable
- Absence calendar, meal heatmap, and chart all have mobile-optimised sizing

---

## 🎨 Customization

### Change the currency symbol
In `js/core/helpers.js`:
```js
const fmtTk = (n) => "৳" + fmt(n);
// Change "৳" to any symbol
```

### Change avatar colours
In `js/core/config.js`, edit the `PALETTE` array (background/foreground colour pairs).

### Add a utility bill type
1. Add the key to `UTIL_PREPAID_KEYS` or the relevant array in `helpers.js`
2. Add its label to the label maps in `utility.js`

### Change superadmin credentials
In `js/core/config.js`, find the `SUPERADMIN` object and update `username` and `passwordHash`.

> ⚠️ Always use a strong random password and never use the default in production.

### Branding
In `index.html`, find all instances of the `M` monogram inside `.land-logo-icon` elements and replace with your own letter or SVG.

---

## 📊 Print / PDF

### Payment Receipt (Collect Payment page)
- Click **🖨 Print** after collecting a payment
- Opens a clean A5 receipt layout in the browser print dialog
- Shows: member name, amount received, allocation breakdown, remaining balances, change to return

### Monthly Settlement Print (Monthly Log page)
- Select a month → **Generate Report** → **🖨️ Print PDF**
- Page 1 (landscape): full settlement table matching the on-screen layout — stat cards, colour-coded columns (Postpaid/Prepaid/Credits), totals row
- Page 2+: one receipt card per member showing full charges, credits, and net amount

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML + CSS + JavaScript (no framework) |
| Backend | [Supabase](https://supabase.com) (PostgreSQL + Auth + Edge Functions) |
| Auth | Custom PBKDF2-SHA256 password hashing in browser |
| Hosting | Any static host (Netlify, Vercel, GitHub Pages, FTP) |
| PDF/Print | Browser native `window.print()` with iframe injection |
| Charts | Pure SVG (no chart library) |

---

Built with ❤️ · MessManager v7 · 2026
