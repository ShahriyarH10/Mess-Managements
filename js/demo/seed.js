/* ═══════════════════════════════════════════════
   DEMO — Seed data (fictional mess, relative dates)

   Dates are generated relative to "today" so the demo always looks current:
   two full previous months + the current month so far. The generator is
   deterministic (seeded PRNG), so every visitor sees the same numbers and a
   reload restores exactly this state.
   ═══════════════════════════════════════════════ */
(function () {
  "use strict";

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  /* Every demo member shares this password (PBKDF2-SHA-256, 100k iterations). */
  const DEMO_PASSWORD = "Demo@1234";
  const DEMO_PASSWORD_HASH = "pbkdf2:6d6573736d616e616765722d64656d6f:84640b3ee03abedfe678879ebf027ddb84b22fb3b560a8c4e42cbc227cd40e92";

  const IDS = Object.freeze({
    mess: "demo-mess",
    manager: "demo-m-1", subManager: "demo-m-2", member: "demo-m-3",
  });

  const ACCOUNTS = Object.freeze({
    manager: { username: "demo_manager", label: "Manager", blurb: "Full control: meals, bazar, bills, rent, settlements, reports" },
    member:  { username: "demo_member",  label: "Member",  blurb: "Personal dashboard, meal log, payments, what I owe" },
  });

  /* ── tiny deterministic PRNG ── */
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    let a = hashStr(String(seed));
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const p2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const mkey = (y, m) => `${y}-${p2(m + 1)}`;
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const hoursAgo = (n) => new Date(Date.now() - n * 3600000).toISOString();

  function buildSeed() {
    const now = new Date();
    const todayStr = ymd(now);
    const curY = now.getFullYear(), curM = now.getMonth();
    const shift = (back) => { const d = new Date(curY, curM - back, 1); return { y: d.getFullYear(), m: d.getMonth() }; };
    const months = [shift(2), shift(1), shift(0)].map(x => ({ ...x, key: mkey(x.y, x.m) }));
    const [mA, mB, mC] = months; // two months ago, last month, this month

    const MESS = IDS.mess;

    /* ── members ── */
    const people = [
      { id: IDS.manager,    name: "Tanvir Ahmed",   username: "demo_manager", role: "manager",     room: "A-1", rent: 5000, phone: "01711-000001", joined: -420, dn: [1, 1] },
      { id: IDS.subManager, name: "Rakib Hasan",    username: "demo_rakib",   role: "sub_manager", room: "A-2", rent: 4500, phone: "01711-000002", joined: -380, dn: [1, 1] },
      { id: IDS.member,     name: "Sabbir Rahman",  username: "demo_member",  role: "member",      room: "B-1", rent: 4500, phone: "01711-000003", joined: -300, dn: [1, 1] },
      { id: "demo-m-4",     name: "Nayeem Khan",    username: "demo_nayeem",  role: "member",      room: "B-2", rent: 4500, phone: "01711-000004", joined: -260, dn: [1, 1] },
      { id: "demo-m-5",     name: "Imran Hossain",  username: "demo_imran",   role: "member",      room: "C-1", rent: 4000, phone: "01711-000005", joined: -180, dn: [0, 1] },
      { id: "demo-m-6",     name: "Mahfuz Alam",    username: "demo_mahfuz",  role: "member",      room: "C-2", rent: 4000, phone: "01711-000006", joined: -90,  dn: [1, 1] },
    ];
    const members = people.map((p, i) => ({
      id: p.id, mess_id: MESS, name: p.name, username: p.username, password: DEMO_PASSWORD_HASH,
      role: p.role, room: p.room, rent: p.rent, phone: p.phone,
      joined: ymd(new Date(now.getTime() + p.joined * 86400000)),
      created_at: daysAgo(-p.joined + i),
      meal_default_day: p.dn[0], meal_default_night: p.dn[1],
    }));

    const messes = [{ id: MESS, name: "Mirpur Bachelor Mess", location: "Mirpur-10, Dhaka", created_at: daysAgo(430) }];

    /* ── meals + bazar: first day of two months ago → today ── */
    const meals = [], bazar = [];
    const start = new Date(mA.y, mA.m, 1);
    let dayIdx = 0;
    for (let d = new Date(start); ymd(d) <= todayStr; d.setDate(d.getDate() + 1), dayIdx++) {
      const date = ymd(d);
      const r = rng("meal-" + date);
      const friday = d.getDay() === 5;
      const row = {};
      people.forEach(p => {
        const day   = r() < (p.dn[0] ? 0.86 : 0.35) ? 1 : 0;
        const night = r() < 0.93 ? 1 : 0;
        const guest = friday && r() < 0.18 ? 1 : 0;   // occasional guest meal on Friday
        row[p.name + "_day"] = day + guest;
        row[p.name + "_night"] = night;
        row[p.name] = day + guest + night;
      });
      meals.push({ id: "demo-meal-" + date, mess_id: MESS, date, meals: row, created_at: new Date(d).toISOString() });

      if (dayIdx % 2 === 0 || friday) {
        const rb = rng("bazar-" + date);
        const buyer = people[(dayIdx >> 1) % people.length];
        const amt = Math.round((friday ? 1500 + rb() * 900 : 650 + rb() * 750) / 10) * 10;
        const b = {}; people.forEach(p => { b[p.name] = p === buyer ? amt : 0; });
        bazar.push({ id: "demo-bazar-" + date, mess_id: MESS, date, bazar: b, utility: {}, created_at: new Date(d).toISOString() });
      }
    }

    /* ── rent: 2 months ago all paid · last month 1 partial + 1 unpaid · this month in progress ── */
    const rentPlan = {
      [mA.key]: () => ({ paid: 1, status: "paid" }),
      [mB.key]: (p, i) => i === 4 ? { paid: 0, status: "unpaid" } : i === 5 ? { paid: 2000, status: "partial" } : { paid: 1, status: "paid" },
      [mC.key]: (p, i) => i <= 2 ? { paid: 1, status: "paid" } : i === 3 ? { paid: 2500, status: "partial" } : { paid: 0, status: "unpaid" },
    };
    const rent = months.map((mo) => ({
      id: "demo-rent-" + mo.key, mess_id: MESS, month_key: mo.key, month: mo.m, year: mo.y, month_name: MONTH_NAMES[mo.m],
      created_at: daysAgo(1),
      entries: people.map((p, i) => {
        const plan = rentPlan[mo.key](p, i);
        return { name: p.name, rent: p.rent, paid: plan.paid === 1 ? p.rent : plan.paid, status: plan.status, notes: plan.status === "partial" ? "Rest by next week" : "" };
      }),
    }));

    /* ── utilities: bills + per-member payments (+ mess fund log in the bills JSON) ── */
    const billsFor = { [mA.key]: { elec: 4600, gas: 1500, wifi: 1200, khala: 3000, other: 450 },
                       [mB.key]: { elec: 5100, gas: 1500, wifi: 1200, khala: 3000, other: 600 },
                       [mC.key]: { elec: 4900, gas: 1500, wifi: 1200, khala: 3000, other: 0 } };
    const utilPaidPlan = {
      [mA.key]: () => 1,
      [mB.key]: (i) => (i === 4 ? 0 : i === 5 ? 0.5 : 1),
      [mC.key]: (i) => (i <= 1 ? 1 : 0),
    };
    const fund = (id, type, amount, date, note) => ({ id, type, amount, date, note, actor: "Tanvir Ahmed", created: new Date(date + "T10:00:00").toISOString() });
    const utility = months.map((mo) => {
      const bills = { ...billsFor[mo.key] };
      const prepaidShare = Math.round((bills.elec + bills.gas + bills.wifi) / people.length * 100) / 100;
      const payments = {};
      people.forEach((p, i) => {
        const f = utilPaidPlan[mo.key](i);
        const paid = Math.round(prepaidShare * f * 100) / 100;
        payments[p.name] = { paid, meal_paid: 0, prev_due_paid: 0, status: paid <= 0 ? "unpaid" : paid >= prepaidShare ? "paid" : "partial", notes: "" };
      });
      if (mo.key === mA.key) bills.locked = true; // oldest month is closed
      if (mo.key === mB.key) {
        bills.fund_entries = [
          fund("f1", "deposit", 6000, `${mB.key}-03`, "Monthly contribution (1,000 each)"),
          fund("f2", "withdrawal", 1800, `${mB.key}-12`, "Gas cylinder refill"),
          fund("f3", "withdrawal", 650, `${mB.key}-21`, "Cleaning supplies"),
        ];
      }
      if (mo.key === mC.key) bills.fund_entries = [fund("f4", "deposit", 6000, `${mC.key}-02`, "Monthly contribution (1,000 each)")];
      return { id: "demo-util-" + mo.key, mess_id: MESS, month_key: mo.key, month: mo.m, year: mo.y, month_name: MONTH_NAMES[mo.m], bills, payments, created_at: daysAgo(1) };
    });

    /* ── community content ── */
    const announcements = [
      { id: "demo-an-1", mess_id: MESS, title: "Monthly meeting this Friday", body: "We meet after Isha prayer on the rooftop to discuss next month's bazar budget and the WiFi plan upgrade. Please be there on time.", author: "Tanvir Ahmed", pinned: true,  created_at: daysAgo(2) },
      { id: "demo-an-2", mess_id: MESS, title: "Water tank cleaning", body: "The landlord will clean the overhead tank on Saturday morning. Store some water in advance — supply will be off from 9am to noon.", author: "Rakib Hasan", pinned: false, created_at: daysAgo(6) },
      { id: "demo-an-3", mess_id: MESS, title: "New cook starting next week", body: "Khala is on leave for a week. A substitute cook will start Sunday — please give feedback after the first few meals.", author: "Tanvir Ahmed", pinned: false, created_at: daysAgo(11) },
    ];
    const chores = [
      { id: "demo-ch-1", mess_id: MESS, task: "Clean kitchen & stove",      assignee: "Sabbir Rahman", frequency: "daily",  status: "pending", created_at: daysAgo(30) },
      { id: "demo-ch-2", mess_id: MESS, task: "Take out the trash",         assignee: "Nayeem Khan",   frequency: "daily",  status: "done",    created_at: daysAgo(30) },
      { id: "demo-ch-3", mess_id: MESS, task: "Mop the common room",        assignee: "Imran Hossain", frequency: "weekly", status: "pending", created_at: daysAgo(30) },
      { id: "demo-ch-4", mess_id: MESS, task: "Refill drinking water jars", assignee: "Mahfuz Alam",   frequency: "weekly", status: "done",    created_at: daysAgo(30) },
    ];
    const broadcasts = [
      { id: "demo-bc-1", mess_id: MESS, message: "⚠️ Gas supply is low — avoid heavy cooking tonight.", priority: "urgent", author: "Tanvir Ahmed", expires_at: null, pinned: true,  created_at: hoursAgo(5) },
      { id: "demo-bc-2", mess_id: MESS, message: "Biriyani on Friday night! Please mark your meal on/off by Thursday.", priority: "normal", author: "Rakib Hasan", expires_at: null, pinned: false, created_at: hoursAgo(26) },
    ];
    const mess_rules = [{
      id: "demo-rules", mess_id: MESS, wifi_pass: "mess-wifi-2025", updated_at: daysAgo(14), created_at: daysAgo(100),
      bank_info: "bKash (Manager): 01711-000001\nCash collection every 1st–5th of the month.",
      contacts: "Landlord: 01800-000010\nElectrician: 01800-000011\nGas delivery: 01800-000012",
      rules_text: "## House rules\n\n- **Meal on/off** must be updated before 9pm the previous night.\n- Guests must be informed to the manager in advance.\n- Quiet hours: **11pm – 6am**.\n- Keep the common areas clean — follow the chore roster.\n- Rent & bills are due by the **5th** of each month.",
      custom: {},
    }];

    /* ── member requests (manager notifications) ── */
    const notifications = [
      { id: "demo-nt-1", mess_id: MESS, type: "meal_update",  status: "new",  from_id: IDS.member, from_name: "Sabbir Rahman", date: todayStr, data: { member: "Sabbir Rahman", day: 1, night: 2, total: 3 }, note: "Guest tonight", created_at: hoursAgo(1) },
      { id: "demo-nt-2", mess_id: MESS, type: "bazar_update", status: "new",  from_id: "demo-m-4", from_name: "Nayeem Khan",   date: todayStr, data: { amount: 1240 }, note: "Fish, vegetables, oil", created_at: hoursAgo(3) },
      { id: "demo-nt-3", mess_id: MESS, type: "utility_update", status: "new", from_id: "demo-m-6", from_name: "Mahfuz Alam",   date: todayStr, data: { billType: "elec", amount: 800, monthName: MONTH_NAMES[mC.m], year: mC.y }, note: "Paid by bKash", created_at: hoursAgo(9) },
      { id: "demo-nt-4", mess_id: MESS, type: "rent_update",  status: "seen", from_id: "demo-m-4", from_name: "Nayeem Khan",   date: todayStr, data: { amount: 2500, monthName: MONTH_NAMES[mC.m], year: mC.y }, note: "Half now, rest soon", created_at: daysAgo(2) },
    ];

    /* ── audit trail ── */
    const aud = (i, actor, action, entity, entity_id, summary, ago) => ({ id: "demo-au-" + i, mess_id: MESS, actor_id: null, actor_name: actor, action, entity, entity_id, summary, details: {}, created_at: hoursAgo(ago) });
    const audit_log = [
      aud(1, "Tanvir Ahmed", "update", "meal",         todayStr,    `Meals saved for ${todayStr}`, 2),
      aud(2, "Tanvir Ahmed", "update", "bazar",        todayStr,    `Bazar saved for ${todayStr}`, 3),
      aud(3, "Rakib Hasan",  "update", "rent",         mC.key,      `Rent updated for ${MONTH_NAMES[mC.m]} ${mC.y}`, 20),
      aud(4, "Tanvir Ahmed", "create", "announcement", "demo-an-1", "Posted announcement: Monthly meeting this Friday", 48),
      aud(5, "Tanvir Ahmed", "update", "utility",      mC.key,      `Prepaid utility saved for ${MONTH_NAMES[mC.m]}`, 52),
      aud(6, "Tanvir Ahmed", "create", "fund",         `${mC.key}-02`, "Fund deposit: ৳6,000 — Monthly contribution", 120),
      aud(7, "Rakib Hasan",  "update", "bazar",        `${mB.key}-28`, `Bazar saved for ${mB.key}-28`, 400),
      aud(8, "Tanvir Ahmed", "update", "utility",      mA.key,      `Month closed: ${MONTH_NAMES[mA.m]} ${mA.y}`, 900),
    ];

    /* ── a few upcoming meal on/off toggles ── */
    const attendance = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getTime() + i * 86400000);
      attendance.push({ id: "demo-at-i" + i, mess_id: MESS, member_id: "demo-m-5", date: ymd(d), day_meal: false, night_meal: true, updated_at: nowIso() });
    }
    attendance.push({ id: "demo-at-s", mess_id: MESS, member_id: IDS.member, date: ymd(new Date(now.getTime() + 86400000)), day_meal: true, night_meal: false, updated_at: nowIso() });
    function nowIso() { return new Date().toISOString(); }

    return { messes, members, meals, bazar, rent, utility_payments: utility, announcements, chores, broadcasts, mess_rules, notifications, audit_log, meal_attendance: attendance };
  }

  window.MMDemo = Object.assign(window.MMDemo || {}, { buildSeed, IDS, ACCOUNTS, DEMO_PASSWORD });
})();
