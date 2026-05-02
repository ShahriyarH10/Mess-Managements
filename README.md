# MessManager 🏠
### Production-ready mess management web app for Dhaka

---

## 🚀 Quick Setup

### Step 1 — Database (Supabase)
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Open **SQL Editor**
3. Then paste and run the full `database.sql` file
5. Go to **Project Settings → API** and copy your:
   - **Project URL**
   - **Anon/Public key**

### Step 2 — Configure
Open `script.js` and update lines 5–6:
```js
const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

### Step 3 — Deploy
Upload `index.html`, `style.css`, `script.js` to any static host:
- **Netlify** — drag & drop at netlify.com/drop
- **Vercel** — `vercel deploy`
- **GitHub Pages** — push to repo, enable Pages
- **Any web host** — upload via FTP

---

## 👤 User Roles

### 👑 Manager
- The person who **creates the mess** becomes the first manager
- Manager is a **member with a role** — not a separate account
- Full access: all entry pages, reports, member management
- Can **transfer the manager role** to any other member at any time
- After transfer, becomes a regular member instantly

### 👤 Member
- Added by the manager with a username & password
- Personal dashboard: own meals, bazar, payments, profile
- Can **submit requests** to the manager for meal entries, bazar entries, and bill payments
- Can view mess-wide announcements, chore roster, and mess overview

---

## 🗂️ Features

| Feature | Manager | Member |
|---|---|---|
| Dashboard | ✅ Full mess overview | ✅ Personal dashboard |
| Member Profiles | ✅ All members with stats | ❌ |
| Meal Entry | ✅ Direct entry | ✅ Submit request |
| Bazar Entry | ✅ Direct entry | ✅ Submit request |
| Utility Entry | ✅ Full bill management | ❌ |
| Room Rent | ✅ Collection tracking | ❌ |
| Monthly Log | ✅ Full settlement report | ❌ |
| Announcements | ✅ Post & pin | 👁️ Read only |
| Chore Roster | ✅ Assign & manage | 👁️ Read only |
| Members | ✅ Add/edit/remove | ❌ |
| Transfer Role | ✅ Hand off to any member | ❌ |
| Requests | ✅ Approve/reject | ✅ Submit |
| My Profile | ❌ | ✅ With period filter |
| My Payments | ❌ | ✅ Submit bill payments |
| Mess Overview | ❌ | ✅ |

---

## 💰 Payment Model

MessManager separates costs into two types:

### 🔴 Postpaid (settle at month end)
| Cost | How it works |
|---|---|
| **Meal cost** | meals eaten × meal rate (total bazar ÷ total meals) |
| **Khala salary** | khala bill ÷ number of members |

### 🔵 Prepaid (pay at month start)
| Cost | How it works |
|---|---|
| **Room rent** | fixed amount per member per month |
| **Utility bills** | electricity + WiFi + gas + other ÷ members |

The **Monthly Log** shows both columns separately so the manager knows what to collect upfront vs what to settle at month end.

---

## 📨 Request & Approval Flow

Members can submit three types of requests — all go through manager approval:

```
Member submits request
       ↓
notifications table (status: pending)
       ↓
Manager sees 🔴 badge on "Requests" in sidebar
       ↓
Manager opens Requests page → reviews details
       ↓
Approve → auto-writes to meals/bazar/utility/rent tables
Reject  → marked rejected, member sees status in their history
```

### Request types
- **🍽️ Meal request** — member submits day/night meal count for a date
- **🛒 Bazar request** — member submits grocery amount for a date
- **💡 Bill payment** — member submits a bill they paid directly (electricity, khala, rent, etc.)

---

## 👑 Manager Role Transfer

1. Manager goes to **Transfer Role** in the sidebar
2. Selects any other member
3. Confirms the transfer
4. The selected member immediately becomes the new manager
5. The previous manager becomes a regular member
6. The new manager's dashboard updates on next page load or refresh — no re-login needed

---

## 📊 Monthly Log — Settlement Report

The settlement table shows each member's full breakdown:

| Column | Type | Description |
|---|---|---|
| Meal cost | 🔴 Postpaid | meals × meal rate |
| Khala | 🔴 Postpaid | khala ÷ members |
| Utility | 🔵 Prepaid | elec+wifi+gas+other ÷ members |
| Rent | 🔵 Prepaid | fixed per member |
| Bazar credit | Credit | what the member bought |
| **Net** | | positive = member owes, negative = member is owed |

---

## 🌙 Theme
- Light/Dark mode toggle on landing page, login screen, and sidebar
- Saved in `localStorage` — persists across sessions

---

## 📁 File Structure
```
MessManager/
├── index.html       # Full app — landing, auth, all screens
├── style.css        # All styles — themes, layout, responsive
├── script.js        # All logic — auth, DB, pages, requests
├── database.sql     # Supabase schema — run once to set up
└── README.md        # This file
```

---

## 🗄️ Database Tables

| Table | Purpose |
|---|---|
| `messes` | One row per mess — name, location |
| `members` | All members including manager — has `role` column |
| `meals` | Daily meal log per member (day + night) |
| `bazar` | Daily grocery spending per member |
| `rent` | Monthly rent entries per member |
| `utility_payments` | Monthly utility bills + who paid |
| `announcements` | Mess-wide notices |
| `chores` | Cleaning duty assignments |
| `notifications` | Member requests — meal, bazar, bill payment |

---

## 🛡️ Security Notes
- Change the superadmin password in `script.js` before going live
- Passwords are stored as plaintext — add bcrypt hashing for production
- Supabase RLS is enabled with anon-allow policies — tighten for production
- Always use HTTPS in deployment

---

## 🔧 Customization

### Add a new utility bill type
In `script.js`, add the key to all arrays like `['elec','wifi','gas','khala','other']` and add its label to the label maps like `{elec:'Electricity', ...}`.

### Change avatar colors
Edit the `PALETTE` array in `script.js`.

### Change superadmin credentials
Find `const SUPERADMIN` in `script.js` and update the username/password.

### Branding
Replace the `M` in `land-logo-icon` elements in `index.html` with your own initial or SVG.

---

## 📱 Mobile Support
- Full responsive design — works on phones and tablets
- Bottom navigation bar on mobile with 5 quick-access buttons
- Modals, tables, and cards all adapt to small screens

---

Built with ❤️ for Dhaka messes · 2026
