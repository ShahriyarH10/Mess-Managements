# MessManager 🏠
### Production-ready mess management web app for Dhaka

---

## 🚀 Quick Setup

### 1. Database Setup (Supabase)
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Open the **SQL Editor**
3. Copy the contents of `database.sql` and run it
4. Go to **Project Settings → API** and copy your:
   - **Project URL**
   - **Anon/Public key**

### 2. Configure the App
Open `script.js` and update lines 5–6:
```js
const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

### 3. Deploy
Upload the 3 files (`index.html`, `style.css`, `script.js`) to any static host:
- **Netlify** — drag & drop folder at netlify.com/drop
- **Vercel** — `vercel deploy`
- **GitHub Pages** — push to a repo and enable Pages
- **Any web host** — upload via FTP

---

## 👤 User Roles

### Super Admin
- **Username:** `superadmin`
- **Password:** `super@admin2025`
- Can view all messes, delete messes, see platform metrics
- ⚠️ Change this password in `script.js` before deploying

### Mess Admin
- Created when a new mess is registered via "Create Mess"
- Full access to all mess management features
- Can manage members, entry data, reports, announcements, chores

### Member
- Each member gets credentials set by the mess admin
- Personal dashboard: meals, bazar, payments, profile
- Can view mess-wide overview and announcements

---

## 🗂️ Features

| Feature           | Admin | Member |
|-------------------|-------|--------|
| Dashboard         | ✅    | ✅ (personal) |
| Member Profiles   | ✅    | ❌ |
| Meal Entry        | ✅    | ❌ |
| Bazar Entry       | ✅    | ❌ |
| Utility Entry     | ✅    | ❌ |
| Rent Collection   | ✅    | ❌ |
| Monthly Log       | ✅    | ❌ |
| Announcements     | ✅    | 👁️ (read) |
| Chore Roster      | ✅    | 👁️ (read) |
| My Meal Log       | ❌    | ✅ |
| My Bazar Log      | ❌    | ✅ |
| My Payments       | ❌    | ✅ |
| Mess Overview     | ❌    | ✅ |

---

## 🌙 Theme
- Light/Dark mode toggle available on login screen, landing page, and sidebar
- Theme preference is saved in browser localStorage

---

## 🛡️ Security Notes
- Change the superadmin password before going live
- Passwords are stored as plaintext in this version — add bcrypt hashing for production
- Enable Supabase Row Level Security (already in `database.sql`)
- Use HTTPS for all deployments

---

## 📁 File Structure
```
MessManager/
├── index.html      # Main app HTML (landing + all screens)
├── style.css       # All styles (themes, responsive)
├── script.js       # All app logic (auth, DB, pages)
├── database.sql    # Supabase schema (run once)
└── README.md       # This file
```

---

## 🔧 Customization

### Add more utility types
In `script.js`, search for `['elec','wifi','gas','khala','other']` and add new keys.
Add matching labels in the `renderUtility` function.

### Change default mess settings
Edit the `PALETTE` array in `script.js` to customize avatar colors.

### Branding
Replace `M` logo with your own SVG by editing the `land-logo-icon` elements in `index.html`.

---

Built with ❤️ for Dhaka messes · 2025
