/* ═══════════════════════════════════════════════
   MEMBER — Pages: My Profile, Meal entry, Bazar, Payments, Mess Overview
   ═══════════════════════════════════════════════ */
function memberPrevMonthInfo(month, year) {
  const pm = Number(month) === 0 ? 11 : Number(month) - 1;
  const py = Number(month) === 0 ? Number(year) - 1 : Number(year);

  return {
    month: pm,
    year: py,
    key: monthKey(py, pm),
  };
}

async function notifyManagerUpdate(type, date, data, note) {
  await dbSaveNotification({
    type,
    date,
    data,
    note: note || "",
    status: "new",
  });
}

async function renderMyMeals(el) {
  const member = await getMe();
  if (!member) return;

  const allMeals = await historyRows("meals", true); // also feeds the month calendar pop-up

  const myRows = allMeals
    .filter(r => mealMemberTotal(r.meals || {}, member.name) > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 20);

  const dt = today();

  // Load upcoming absences for this member
  const upcoming = await (async () => {
    try {
      const { data } = await getClient().from("meal_attendance")
        .select("*")
        .eq("mess_id", messId())
        .eq("member_id", member.id)
        .gte("date", dt)
        .order("date", { ascending: true })
        .limit(30);
      return (data || []).filter(a => !a.day_meal || !a.night_meal);
    } catch { return []; }
  })();

  window._attMemberId = member.id;

  // ── This month, for the tiles + calendar ──
  const now = new Date(), y = now.getFullYear(), mo = now.getMonth(), key = monthKey(y, mo);
  const dim = new Date(y, mo + 1, 0).getDate(), gone = Math.min(now.getDate(), dim);
  const myDay = {};
  let messMeals = 0;
  const curRows = allMeals.filter(r => String(r.date).startsWith(key));
  curRows.forEach(r => {
    myDay[parseInt(String(r.date).slice(8), 10)] = mealMemberTotal(r.meals || {}, member.name);
    messMeals += members.reduce((t, m) => t + mealMemberTotal(r.meals || {}, m.name), 0);
  });
  const myTotal = round2(Object.values(myDay).reduce((a, b) => a + b, 0));
  const daysEaten = Object.values(myDay).filter(v => v > 0).length;
  const loggedDays = curRows.length;
  let bz = 0;
  ((await historyRows("bazar")) || []).filter(r => String(r.date).startsWith(key))
    .forEach(r => Object.values(r.bazar || {}).forEach(v => { bz += Number(v) || 0; }));
  const rate = messMeals > 0 ? bz / messMeals : 0;
  const offDays = {};
  upcoming.forEach(a => { if (String(a.date).startsWith(key)) offDays[parseInt(String(a.date).slice(8), 10)] = !a.day_meal && !a.night_meal ? "all" : !a.day_meal ? "day" : "night"; });
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const shift = n => ymd(new Date(now.getTime() + n * 86400000));
  const setDate = v => `document.getElementById('my-meal-date').value='${v}';fillMyMealFromDate()`;
  const lead = (new Date(y, mo, 1).getDay() + 1) % 7;          // Saturday-first week
  const myMax = Math.max(1, ...Object.values(myDay));
  const tile = (icon, label, value, sub) => `
    <div class="pf-tile">
      <div class="dk-head"><span class="dk-ico">${icon}</span><span class="dk-label">${label}</span></div>
      <div class="stat-value pf-val">${value}</div>
      <div class="dk-sub">${sub}</div>
    </div>`;
  const stepper = (id, icon, label) => `
    <div class="ms-step">
      <div class="ms-step-lbl">${icon} ${label}</div>
      <div class="ms-step-ctl">
        <button class="ms-btn" onclick="stepMyMeal('${id}',-1)" aria-label="One less ${label.toLowerCase()} meal">−</button>
        <input type="number" class="input" id="${id}" min="0" max="4" step="0.5" value="0"/>
        <button class="ms-btn" onclick="stepMyMeal('${id}',1)" aria-label="One more ${label.toLowerCase()} meal">+</button>
      </div>
    </div>`;

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Meal Log</div>
      <div class="page-sub">Your meals, days off and monthly history</div>
    </div>
  </div>

  <div class="content dk">
    <div class="pf-tiles">
      ${tile("🍽️", "Meals · " + MONTHS[mo], myTotal, `${daysEaten ? round2(myTotal / daysEaten) : 0}/day on days you ate`)}
      ${tile("📅", "Days eaten", daysEaten, `of ${loggedDays} logged day${loggedDays === 1 ? "" : "s"} so far`)}
      ${tile("🧾", "Meal cost so far", fmtTk(round2(myTotal * rate)), `at ${fmtTk(round2(rate))}/meal right now`)}
      ${tile("🌙", "Days off planned", upcoming.length, upcoming.length ? "next: " + new Date(upcoming[0].date + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "none coming up")}
    </div>

    <div class="ml-grid">
      <div>
        <div class="card ml-form">
          <div class="dk-card-title"><span>My meals for a day</span></div>
          <div class="field">
            <label>Date</label>
            <div class="ml-date">
              <input type="date" class="input" id="my-meal-date" value="${dt}" onchange="fillMyMealFromDate()"/>
            </div>
            <div class="ml-quick">
              <button class="ml-chip" onclick="${setDate(shift(-1))}">Yesterday</button>
              <button class="ml-chip" onclick="${setDate(shift(0))}">Today</button>
              <button class="ml-chip" onclick="${setDate(shift(1))}">Tomorrow</button>
            </div>
          </div>
          <div class="ms-steps">
            ${stepper("my-meal-day", "☀", "Day")}
            ${stepper("my-meal-night", "🌙", "Night")}
          </div>
          <div class="field">
            <label>Note <span style="color:var(--text3);font-weight:400">(optional)</span></label>
            <input type="text" class="input" id="my-meal-note" placeholder="e.g. Guest for dinner"/>
          </div>
          <button class="btn btn-primary ml-save" onclick="saveMyMealEntry()">✓ Save my meals</button>
          <div class="ml-hint">Saved straight away; the manager is notified. Tip: tap a day on the calendar to edit it.</div>
        </div>

        <div class="card ml-form">
          <div class="dk-card-title"><span>Days off</span></div>
          <div class="ml-2">
            <div class="field"><label>From</label><input type="date" class="input" id="abs-from" value="${dt}" min="${dt}"/></div>
            <div class="field"><label>To</label><input type="date" class="input" id="abs-to" value="${dt}" min="${dt}"/></div>
          </div>
          <div class="ma-skips">
            <label class="ma-skip"><input type="checkbox" id="abs-skip-day" checked/><span>☀ Skip day</span></label>
            <label class="ma-skip"><input type="checkbox" id="abs-skip-night" checked/><span>🌙 Skip night</span></label>
          </div>
          <div class="ml-2" style="margin-top:12px">
            <button class="btn btn-primary" style="justify-content:center" onclick="markAbsenceRange()">✗ Mark off</button>
            <button class="btn btn-ghost" style="justify-content:center" onclick="clearAbsenceRange()">✓ I'll eat</button>
          </div>
          <div class="ma-head">Coming up</div>
          <div id="upcoming-absences">${buildUpcomingAbsences(upcoming)}</div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="dk-card-title"><span>${MONTHS[mo]} ${y}</span><span class="dk-legend"><i class="ma-key"></i> day off</span></div>
          <div class="dk-cal ma-cal">
            ${["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"].map(d => `<span class="dk-wd">${d}</span>`).join("")}
            ${Array.from({ length: lead }, () => `<span></span>`).join("")}
            ${Array.from({ length: dim }, (_, i) => {
              const d = i + 1, v = myDay[d] || 0, off = offDays[d];
              const date = `${key}-${String(d).padStart(2, "0")}`;
              const a = v ? (0.3 + (v / myMax) * 0.7).toFixed(2) : 0;
              return `<button class="dk-day${d === now.getDate() ? " dk-today-cell" : ""}${d > gone && !off ? " dk-future" : ""}${off ? " ma-off" : ""}"
                ${v ? `style="--a:${a}"` : ""} title="${MONTHS[mo]} ${d}: ${v} meal${v === 1 ? "" : "s"}${off ? " · " + off + " off" : ""}"
                onclick="${setDate(date)}"><span>${d}</span>${v ? `<b>${v}</b>` : off ? `<b class="ma-x">✗</b>` : ""}</button>`;
            }).join("")}
          </div>
        </div>

        <div class="card">
          <div class="dk-card-title"><span>Month history</span><span class="dk-legend">tap a month for its calendar</span></div>
          ${buildMonthHistory(summarizeMonths(allMeals, mealsByMember),
            { onClick: "openMyMealMonth", memberName: member.name, id: "mh-my-meals", emptyText: "No meal months yet" })}
        </div>
      </div>
    </div>
  </div>`;

  // Auto-load today's existing meal data as soon as the section renders
  fillMyMealFromDate();
}

/* −/+ on the meal steppers (0–4, whole steps; type a .5 by hand if needed). */
function stepMyMeal(id, delta) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = Math.min(4, Math.max(0, (parseFloat(el.value) || 0) + delta));
  el.classList.remove("ms-bump"); void el.offsetWidth; el.classList.add("ms-bump");
}

function switchMyMealTab(tab) {
  ['meals','bazar'].forEach(t => {
    const pane = document.getElementById('myml-pane-' + t);
    if (pane) pane.style.display = t === tab ? '' : 'none';
    const btn = document.getElementById('myml-tab-' + t);
    if (btn) {
      btn.style.background = t === tab ? 'var(--accent)' : 'transparent';
      btn.style.color = t === tab ? '#0f0f0f' : 'var(--text2)';
    }
  });
  if (tab === 'bazar') { fillMyBazarFromDate(); loadMyBazarRecent(); }
}

async function loadMyBazarRecent() {
  const wrap = document.getElementById("my-bazar-recent-wrap"); if (!wrap) return;
  const member = await getMe(); if (!member) return;
  const allBazar = await dbGetAll("bazar");
  const myRows = allBazar
    .filter(r => Number((r.bazar||{})[member.name]||0) > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 15);
  if (!myRows.length) { wrap.innerHTML = '<div class="empty">No bazar entries yet.</div>'; return; }
  wrap.innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr><th>Date</th><th>Amount</th></tr></thead>
    <tbody>${myRows.map(r => `<tr><td>${r.date}</td><td style="color:var(--green);font-weight:600">${fmtTk(Number((r.bazar||{})[member.name]||0))}</td></tr>`).join("")}
    </tbody></table></div>`;
}

async function fillMyMealFromDate() {
  const member = await getMe();
  const date = document.getElementById("my-meal-date")?.value;

  if (!member || !date) return;

  const { data: existing } = await sb
    .from("meals")
    .select("*")
    .eq("mess_id", messId())
    .eq("date", date)
    .maybeSingle();

  const p = mealPartsFromObj(existing?.meals || {}, member.name);

  document.getElementById("my-meal-day").value = p.day || 0;
  document.getElementById("my-meal-night").value = p.night || 0;
  if (matchMedia("(max-width: 860px)").matches) document.getElementById("my-meal-date")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function openMyMealMonth(key) {
  const member = await getMe();
  if (!member) return;

  await openMemberMealMonth(member.name, key);
}

async function saveMyMealEntry() {
  const date = document.getElementById("my-meal-date")?.value;
  const day = parseFloat(document.getElementById("my-meal-day")?.value || 0);
  const night = parseFloat(document.getElementById("my-meal-night")?.value || 0);
  const note = cleanText(document.getElementById("my-meal-note")?.value || "");

  if (!date) {
    toast("Select a date");
    return;
  }

  if (day < 0 || night < 0) {
    toast("Meal count cannot be negative");
    return;
  }

  const member = await getMe();

  try {
    const { data: existing } = await sb
      .from("meals")
      .select("*")
      .eq("mess_id", messId())
      .eq("date", date)
      .maybeSingle();

    const merged = {
      ...(existing?.meals || {}),
    };

    merged[member.name + "_day"] = day;
    merged[member.name + "_night"] = night;
    merged[member.name] = round2(day + night);

    members.forEach(m => {
      const d = Number(merged[m.name + "_day"] || 0);
      const n = Number(merged[m.name + "_night"] || 0);

      if (
        merged[m.name + "_day"] != null ||
        merged[m.name + "_night"] != null
      ) {
        merged[m.name] = round2(d + n);
      }
    });

    await dbUpsertMeals(date, merged);

    await notifyManagerUpdate(
      "meal_update",
      date,
      {
        member: member.name,
        day,
        night,
        total: round2(day + night),
      },
      note
    );

    toast("Meal updated. Manager notified ✓", "success");
    // Small delay before re-render so Supabase write propagates
    setTimeout(() => navigate("my-meals"), 350);
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

async function renderMyBazar(el) {
  const member = await getMe();
  if (!member) return;

  const allBazar = await historyRows("bazar", true);
  const now = new Date(), key = monthKey(now.getFullYear(), now.getMonth());
  const prevKey = previousMonthFromKey(key).key;
  const yday = new Date(now.getTime() - 86400000);
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const mine = allBazar
    .map(r => ({ date: String(r.date), amt: Number((r.bazar || {})[member.name] || 0) }))
    .filter(x => x.amt > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const sumFor = k => round2(mine.filter(x => x.date.startsWith(k)).reduce((s, x) => s + x.amt, 0));
  const thisM = sumFor(key), lastM = sumFor(prevKey);
  const entriesThis = mine.filter(x => x.date.startsWith(key)).length;

  // Share + rank among this month's contributors
  const byName = {};
  allBazar.filter(r => String(r.date).startsWith(key)).forEach(r =>
    Object.entries(r.bazar || {}).forEach(([n, v]) => { byName[n] = (byName[n] || 0) + (Number(v) || 0); }));
  const messTotal = Object.values(byName).reduce((s, v) => s + v, 0);
  const share = messTotal > 0 ? Math.round((thisM / messTotal) * 100) : 0;
  const ranked = Object.entries(byName).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const rank = ranked.findIndex(([n]) => n === member.name) + 1;

  // History grouped by month (last 6 months with entries)
  const groups = [];
  mine.forEach(x => {
    const k = x.date.slice(0, 7);
    let g = groups.find(y => y.k === k);
    if (!g) { if (groups.length >= 6) return; groups.push(g = { k, items: [], total: 0 }); }
    g.items.push(x); g.total = round2(g.total + x.amt);
  });
  const maxAmt = Math.max(1, ...mine.slice(0, 60).map(x => x.amt));
  const niceDate = d => { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); };
  const tile = (icon, label, value, sub, bar) => `
    <div class="pf-tile">
      <div class="dk-head"><span class="dk-ico">${icon}</span><span class="dk-label">${label}</span></div>
      <div class="stat-value pf-val">${value}</div>
      <div class="dk-sub">${sub}</div>
      ${bar != null ? `<div class="dk-bar pf-share"><i style="width:${bar}%;background:var(--green)"></i></div>` : ""}
    </div>`;
  const setAmt = v => `document.getElementById('my-bazar-amount').value='${v}'`;

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Bazar Log</div>
      <div class="page-sub">What you spend on bazar is credited against your meals</div>
    </div>
  </div>

  <div class="content dk">
    <div class="pf-tiles">
      ${tile("🛒", "This month", fmtTk(thisM), `${share}% of ${fmtTk(round2(messTotal))} mess bazar`, share)}
      ${tile("🏅", "Your rank", rank ? "#" + rank : "—", rank ? `of ${ranked.length} contributor${ranked.length === 1 ? "" : "s"} this month` : "no bazar yet this month", null)}
      ${tile("🗓️", "Last month", fmtTk(lastM), lastM && thisM ? `${thisM >= lastM ? "↑" : "↓"} ${Math.abs(Math.round(((thisM - lastM) / lastM) * 100))}% so far vs last month` : MONTHS[Number(prevKey.slice(5)) - 1], null)}
      ${tile("🧾", "Entries", entriesThis, `this month · ${mine.length} in total`, null)}
    </div>

    <div class="ml-grid">
      <div class="card ml-form">
        <div class="dk-card-title"><span>Add bazar</span></div>
        <div class="field">
          <label>Date</label>
          <div class="ml-date">
            <input type="date" class="input" id="my-bazar-date" value="${today()}" onchange="fillMyBazarFromDate()"/>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('my-bazar-date').value='${ymd(now)}';fillMyBazarFromDate()">Today</button>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('my-bazar-date').value='${ymd(yday)}';fillMyBazarFromDate()">Yesterday</button>
          </div>
        </div>
        <div class="field">
          <label>Amount</label>
          <div class="ml-amt"><span>৳</span><input type="number" class="input" id="my-bazar-amount" min="0" placeholder="0" onkeydown="if(event.key==='Enter') saveMyBazarEntry()"/></div>
          <div class="ml-quick">
            ${[500, 1000, 1500, 2000].map(v => `<button class="ml-chip" onclick="${setAmt(v)}">${fmtTk(v)}</button>`).join("")}
          </div>
        </div>
        <div class="field">
          <label>Note <span style="color:var(--text3);font-weight:400">(optional)</span></label>
          <input type="text" class="input" id="my-bazar-note" placeholder="e.g. Vegetables and fish"/>
        </div>
        <button class="btn btn-primary ml-save" onclick="saveMyBazarEntry()">✓ Save bazar</button>
        <div class="ml-hint">Saving the same date again replaces that day's amount. The manager is notified.</div>
      </div>

      <div class="card">
        <div class="dk-card-title"><span>My bazar history</span><span class="dk-legend">${mine.length} entr${mine.length === 1 ? "y" : "ies"}</span></div>
        ${groups.length ? groups.map(g => `
          <div class="ml-month"><span>${monthLabelFromKey(g.k)}</span><b>${fmtTk(g.total)}</b></div>
          ${g.items.map(x => `
            <div class="ml-row">
              <span class="ml-day">${niceDate(x.date)}</span>
              <div class="dk-bar ml-bar"><i style="width:${Math.max(4, Math.round((x.amt / maxAmt) * 100))}%;background:var(--green)"></i></div>
              <b class="ml-val">${fmtTk(x.amt)}</b>
              <button class="btn btn-ghost btn-sm" onclick="document.getElementById('my-bazar-date').value='${x.date}';fillMyBazarFromDate()" title="Load this day into the form">Edit</button>
            </div>`).join("")}
        `).join("") : `<div class="empty"><div>🛒</div><div>No bazar yet — add your first one on the left.</div></div>`}
      </div>
    </div>
  </div>`;
}

async function fillMyBazarFromDate() {
  const member = await getMe();
  const date = document.getElementById("my-bazar-date")?.value;

  if (!member || !date) return;

  const { data: existing } = await sb
    .from("bazar")
    .select("*")
    .eq("mess_id", messId())
    .eq("date", date)
    .maybeSingle();

  const v = Number((existing?.bazar || {})[member.name] || 0);
  const amt = document.getElementById("my-bazar-amount");
  amt.value = v || "";
  if (matchMedia("(max-width: 860px)").matches) amt.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveMyBazarEntry() {
  const date = document.getElementById("my-bazar-date")?.value;
  const amount = parseFloat(document.getElementById("my-bazar-amount")?.value || 0);
  const note = cleanText(document.getElementById("my-bazar-note")?.value || "");

  if (!date) {
    toast("Select a date");
    return;
  }

  if (amount < 0) {
    toast("Amount cannot be negative");
    return;
  }

  const member = await getMe();

  try {
    const { data: existing } = await sb
      .from("bazar")
      .select("*")
      .eq("mess_id", messId())
      .eq("date", date)
      .maybeSingle();

    const merged = {
      ...(existing?.bazar || {}),
    };

    merged[member.name] = amount;

    await dbUpsertBazar(date, merged);

    await notifyManagerUpdate(
      "bazar_update",
      date,
      {
        member: member.name,
        amount,
      },
      note
    );

    toast("Bazar updated. Manager notified ✓", "success");
    setTimeout(() => navigate("my-bazar"), 350);
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

async function renderMyPayments(el) {
  const member = await getMe();

  if (!member) {
    el.innerHTML = `<div class="content"><div class="empty">Profile not found</div></div>`;
    return;
  }

  const [allRent, { data: allUtil }] = await Promise.all([
    dbGetAll("rent"),
    sb.from("utility_payments").select("*").eq("mess_id", messId()).order("month_key", { ascending: false }),
  ]);

  const n = new Date(), month = n.getMonth(), year = n.getFullYear(), key = monthKey(year, month);
  const prev = memberPrevMonthInfo(month, year);
  const utilBy = {}; (allUtil || []).forEach(r => { utilBy[r.month_key] = r; });

  // This month: rent due/paid and my utility share/paid (same share rule as saving)
  const rentRec   = (allRent || []).find(r => r.month_key === key);
  const rentEntry = (rentRec?.entries || []).find(e => e.name === member.name) || {};
  const rentDue   = Number(rentEntry.rent || 0), rentPaid = Number(rentEntry.paid || 0);
  const rentLeft  = round2(Math.max(0, rentDue - rentPaid));
  const utilTotal = utilTotalFromBills(utilBy[key]?.bills || {}, UTIL_PREPAID_KEYS) + utilTotalFromBills(utilBy[prev.key]?.bills || {}, UTIL_POSTPAID_KEYS);
  const utilShare = members.length ? round2(utilTotal / members.length) : 0;
  const utilPaid  = round2(Number(((utilBy[key]?.payments || {})[member.name] || {}).paid || 0));
  const utilLeft  = round2(Math.max(0, utilShare - utilPaid));
  const totalLeft = round2(rentLeft + utilLeft);

  // One history: rent + utility payments, newest month first
  const hist = [];
  (allRent || []).forEach(r => {
    const e = (r.entries || []).find(x => x.name === member.name);
    if (e && Number(e.paid || 0) > 0) hist.push({ key: r.month_key, type: "Rent", icon: "🏠", paid: Number(e.paid), of: Number(e.rent || 0), status: e.status, note: e.notes });
  });
  (allUtil || []).forEach(r => {
    const p = (r.payments || {})[member.name];
    if (p && Number(p.paid || 0) > 0) hist.push({ key: r.month_key, type: "Utility", icon: "⚡", paid: Number(p.paid), of: null, status: p.status, note: p.notes });
  });
  hist.sort((a, b) => b.key.localeCompare(a.key) || a.type.localeCompare(b.type));

  const tile = (icon, label, value, sub, pct, color) => `
    <div class="pf-tile">
      <div class="dk-head"><span class="dk-ico">${icon}</span><span class="dk-label">${label}</span></div>
      <div class="stat-value pf-val" ${color ? `style="color:${color}"` : ""}>${value}</div>
      <div class="dk-sub">${sub}</div>
      ${pct != null ? `<div class="dk-bar pf-share"><i style="width:${pct}%;background:${pct >= 100 ? "var(--green)" : "var(--accent)"}"></i></div>` : ""}
    </div>`;
  const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : null);
  const types = [["rent", "🏠", "Room rent"], ["elec", "⚡", "Electricity"], ["gas", "🔥", "Gas"], ["wifi", "📶", "WiFi"], ["khala", "👩", "Khala"], ["other", "📦", "Other"]];
  const statusBadge = st => `<span class="badge ${st === "paid" ? "badge-green" : st === "partial" ? "badge-amber" : "badge-red"}">${st === "paid" ? "Paid" : st === "partial" ? "Partial" : "Unpaid"}</span>`;

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Utility & Rent</div>
      <div class="page-sub">Record a rent or utility payment you made — it's credited right away</div>
    </div>
    <div class="topbar-actions">
      <button class="btn btn-ghost btn-sm" onclick="navigate('give-payment')" title="Or send money to the manager to confirm">💵 Give payment instead</button>
    </div>
  </div>

  <div class="content dk">
    <div class="pf-tiles ml-tiles3">
      ${tile("🏠", "Rent · " + MONTHS[month], rentDue ? (rentLeft ? fmtTk(rentLeft) + " due" : "✓ Paid") : "—",
          rentDue ? `${fmtTk(rentPaid)} of ${fmtTk(rentDue)} paid` : "no rent set yet", pct(rentPaid, rentDue), rentDue ? (rentLeft ? "var(--red)" : "var(--green)") : null)}
      ${tile("⚡", "Utility share · " + MONTHS[month], utilShare ? (utilLeft ? fmtTk(utilLeft) + " due" : "✓ Paid") : "—",
          utilShare ? `${fmtTk(utilPaid)} of ${fmtTk(utilShare)} paid` : "no bills yet", pct(utilPaid, utilShare), utilShare ? (utilLeft ? "var(--red)" : "var(--green)") : null)}
      ${tile("📌", "Left to pay", totalLeft ? fmtTk(totalLeft) : "✓ Nothing", "rent + utility this month", null, totalLeft ? "var(--red)" : "var(--green)")}
    </div>

    <div class="ml-grid">
      <div class="card ml-form">
        <div class="dk-card-title"><span>Record a payment</span></div>
        <input type="hidden" id="bp-type" value=""/>
        <div class="field">
          <label>What did you pay?</label>
          <div class="ml-types">
            ${types.map(([v, ic, t]) => `<button class="ml-type" data-type="${v}" onclick="pickBpType(this)">${ic}<span>${t}</span></button>`).join("")}
          </div>
        </div>
        <div class="ml-2">
          <div class="field"><label>Month</label>
            <select class="input" id="bp-month">${MONTHS.map((m, i) => `<option value="${i}"${i === month ? " selected" : ""}>${m}</option>`).join("")}</select></div>
          <div class="field"><label>Year</label>
            <select class="input" id="bp-year">${Array.from({ length: 5 }, (_, i) => year - 2 + i).map(y => `<option value="${y}"${y === year ? " selected" : ""}>${y}</option>`).join("")}</select></div>
        </div>
        <div class="field">
          <label>Amount</label>
          <div class="ml-amt"><span>৳</span><input type="number" class="input" id="bp-amount" min="0" placeholder="0"/></div>
          ${rentLeft || utilLeft ? `<div class="ml-quick">
            ${rentLeft ? `<button class="ml-chip" onclick="fillBpDue('rent',${rentLeft})">Remaining rent ${fmtTk(rentLeft)}</button>` : ""}
            ${utilLeft ? `<button class="ml-chip" onclick="fillBpDue('elec',${utilLeft})">Remaining utility ${fmtTk(utilLeft)}</button>` : ""}
          </div>` : ""}
        </div>
        <div class="field">
          <label>Note <span style="color:var(--text3);font-weight:400">(optional)</span></label>
          <input type="text" class="input" id="bp-note" placeholder="e.g. Paid the full electricity bill"/>
        </div>
        <button class="btn btn-primary ml-save" onclick="saveMyPaymentEntry()">✓ Save payment</button>
        <div class="ml-hint">Credited immediately and added to My Receipts. The manager is notified.</div>
      </div>

      <div class="card">
        <div class="dk-card-title"><span>Payment history</span><button class="btn btn-ghost btn-sm" onclick="navigate('my-receipts')">Receipts →</button></div>
        ${hist.length ? `<div class="tbl-wrap"><table class="ml-hist">
          <thead><tr><th>Month</th><th>For</th><th style="text-align:right">Paid</th><th>Status</th></tr></thead>
          <tbody>${hist.slice(0, 24).map(h => `<tr>
            <td style="white-space:nowrap"><b>${monthLabelFromKey(h.key)}</b></td>
            <td>${h.icon} ${h.type}${h.note ? `<div class="dk-mini">${escapeHtml(h.note)}</div>` : ""}</td>
            <td style="text-align:right;color:var(--green);font-weight:600;white-space:nowrap">${fmtTk(h.paid)}${h.of ? `<div class="dk-mini">of ${fmtTk(h.of)}</div>` : ""}</td>
            <td>${statusBadge(h.status)}</td></tr>`).join("")}</tbody>
        </table></div>` : `<div class="empty"><div>🧾</div><div>No rent or utility payments recorded yet</div></div>`}
      </div>
    </div>
  </div>`;
}

/* Payment-type chips → the hidden #bp-type the save reads. */
function pickBpType(btn) {
  document.querySelectorAll(".ml-type").forEach(b => b.classList.toggle("on", b === btn));
  const t = document.getElementById("bp-type");
  if (t) t.value = btn.dataset.type || "";
}
/* "Remaining rent/utility" chips: pick the type and fill the amount. */
function fillBpDue(type, amount) {
  const btn = document.querySelector(`.ml-type[data-type="${type}"]`);
  if (btn) pickBpType(btn);
  const a = document.getElementById("bp-amount");
  if (a) { a.value = amount; a.focus(); }
}

async function saveMyPaymentEntry() {
  const month = parseInt(document.getElementById("bp-month")?.value);
  const year = parseInt(document.getElementById("bp-year")?.value);
  const billType = document.getElementById("bp-type")?.value;
  const amount = parseFloat(document.getElementById("bp-amount")?.value || 0);
  const note = cleanText(document.getElementById("bp-note")?.value || "");

  if (!billType) {
    toast("Select a payment type");
    return;
  }

  if (amount <= 0) {
    toast("Enter a valid amount");
    return;
  }

  const member = await getMe();
  const key = monthKey(year, month);

  const billTypeLabel = {
    elec: "Electricity",
    wifi: "WiFi",
    gas: "Gas",
    khala: "Khala",
    other: "Other",
    rent: "Room Rent",
  };

  try {
    if (billType === "rent") {
      const { data: rentRec } = await sb
        .from("rent")
        .select("*")
        .eq("mess_id", messId())
        .eq("month_key", key)
        .maybeSingle();

      let entries = rentRec?.entries
        ? rentRec.entries.map(e => ({ ...e }))
        : members.map(m => ({
            name: m.name,
            rent: 0,
            paid: 0,
            status: "unpaid",
            notes: "",
          }));

      let found = false;

      entries = entries.map(e => {
        if (e.name !== member.name) return e;

        found = true;

        const rentDue = Number(e.rent || 0);
        const newPaid = round2(Number(e.paid || 0) + amount);

        return {
          ...e,
          paid: newPaid,
          status:
            rentDue > 0 && newPaid >= rentDue
              ? "paid"
              : newPaid > 0
                ? "partial"
                : "unpaid",
          notes: note || `Paid ${fmtTk(amount)} by member`,
        };
      });

      if (!found) {
        entries.push({
          name: member.name,
          rent: 0,
          paid: amount,
          status: "partial",
          notes: note || `Paid ${fmtTk(amount)} by member`,
        });
      }

      await dbUpsertRent(month, year, key, entries);

      await notifyManagerUpdate(
        "rent_update",
        today(),
        {
          member: member.name,
          monthKey: key,
          monthName: MONTHS[month],
          year,
          amount,
        },
        note
      );
    }

    else {
      const prev = memberPrevMonthInfo(month, year);

      const [curRes, prevRes] = await Promise.all([
        sb
          .from("utility_payments")
          .select("*")
          .eq("mess_id", messId())
          .eq("month_key", key)
          .maybeSingle(),

        sb
          .from("utility_payments")
          .select("*")
          .eq("mess_id", messId())
          .eq("month_key", prev.key)
          .maybeSingle(),
      ]);

      const curUtilRec = curRes.data;
      const prevUtilRec = prevRes.data;

      const currentPrepaid = utilTotalFromBills(
        curUtilRec?.bills || {},
        UTIL_PREPAID_KEYS
      );

      const previousPostpaid = utilTotalFromBills(
        prevUtilRec?.bills || {},
        UTIL_POSTPAID_KEYS
      );

      const myShare = members.length > 0
        ? round2((currentPrepaid + previousPostpaid) / members.length)
        : 0;

      const existingPayments = curUtilRec?.payments || {};
      const oldPayment = existingPayments[member.name] || {
        paid: 0,
        status: "unpaid",
        notes: "",
      };

      const newPaid = round2(Number(oldPayment.paid || 0) + amount);

      const updatedPayments = {
        ...existingPayments,
        [member.name]: {
          paid: newPaid,
          status: myShare > 0 && newPaid >= myShare ? "paid" : "partial",
          notes: note || `Paid ${fmtTk(amount)} for ${billTypeLabel[billType] || billType}`,
        },
      };

      await dbUpsertUtility(
        month,
        year,
        key,
        curUtilRec?.bills || {},
        updatedPayments
      );

      await notifyManagerUpdate(
        "utility_update",
        today(),
        {
          member: member.name,
          billType,
          billLabel: billTypeLabel[billType] || billType,
          monthKey: key,
          monthName: MONTHS[month],
          year,
          amount,
        },
        note
      );
    }

    // credited immediately, so it gets a confirmed receipt under My Receipts
    await recordCreditedReceipt({
      member, month, year, amount, source: "member",
      split: billType === "rent" ? { allocRent: amount } : { allocUtil: amount },
    });

    toast("Payment saved. Manager notified ✓", "success");
    setTimeout(() => navigate("my-payments"), 350);
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}
/* ═══════════════════════════════════════════════
   MEMBER — Monthly Log (read-only settlement view)
   ═══════════════════════════════════════════════ */
function renderMyMonthLog(el) {
  const n    = new Date();
  const opts = buildMonthOptions(n.getMonth(), n.getFullYear());

  el.innerHTML = `
    <div class="topbar">
      <div>
        <div class="page-title">Monthly Log</div>
        <div class="page-sub">Settlement report for each month</div>
      </div>
    </div>

    <div class="content">
      <div class="month-sel">
        <label>Settlement month</label>
        <select class="input" id="mylog-month" style="width:180px">
          ${opts.monthOptions}
        </select>
        <label>Year</label>
        <select class="input" id="mylog-year" style="width:95px">
          ${opts.yearOptions}
        </select>
        <button class="btn btn-primary" onclick="loadMyMonthLog()">Generate Report</button>
      </div>

      <div id="mylog-content">
        <div class="empty" style="padding:32px;text-align:center">
          <div style="font-size:32px;margin-bottom:8px">📋</div>
          <div>Select a month and click <b>Generate Report</b></div>
        </div>
      </div>
    </div>
  `;
}

async function loadMyMonthLog() {
  const month         = parseInt(document.getElementById("mylog-month").value);
  const year          = parseInt(document.getElementById("mylog-year").value);
  const settlementKey = monthKey(year, month);
  const prev          = previousMonth(month, year);
  const sourceKey     = prev.key;

  const logContent = document.getElementById("mylog-content");
  logContent.innerHTML = '<div class="loading"><div class="spinner"></div>Generating report…</div>';

  const [allMeals, allBazar, allRent, allUtilRes] = await Promise.all([
    dbGetAll("meals"),
    dbGetAll("bazar"),
    dbGetAll("rent"),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()),
  ]);

  const allUtil = allUtilRes.data || [];
  const rentByKey = {}; allRent.forEach(r => { rentByKey[r.month_key] = r; });
  const utilByKey = {}; allUtil.forEach(u => { utilByKey[u.month_key] = u; });

  const currentRentRec   = rentByKey[settlementKey] || null;
  const currentUtilRec   = utilByKey[settlementKey] || null;
  const previousUtilRec  = utilByKey[sourceKey]     || null;

  const payData = members.map(m => {
    const p = calcMemberSettlement(m, allMeals, allBazar, currentRentRec, currentUtilRec, previousUtilRec, settlementKey);
    p.prevDue = calcPrevDueForMember(m, allMeals, allBazar, allRent, allUtil, settlementKey);
    p.netWithPrevDue = round2(p.netPayable + p.prevDue);
    return p;
  });
  window._logPayData = payData;

  const totalMeals   = round2(payData[0]?.totalMeals || 0);
  const totalBazar   = round2(payData[0]?.totalBazar  || 0);
  const mealRate     = totalMeals > 0 ? round2(totalBazar / totalMeals) : 0;

  const prepaidTotal = utilTotalFromBills(currentUtilRec?.bills || {}, UTIL_PREPAID_KEYS);
  const elecAmt      = Number(currentUtilRec?.bills?.elec  || 0);
  const gasAmt       = Number(currentUtilRec?.bills?.gas   || 0);
  const wifiAmt      = Number(currentUtilRec?.bills?.wifi  || 0);
  const khalaTotal   = Number(previousUtilRec?.bills?.khala || 0);
  const otherTotal   = Number(previousUtilRec?.bills?.other || 0);
  const postpaidTotal = round2(khalaTotal + otherTotal);
  const prepaidShare  = members.length > 0 ? round2(prepaidTotal / members.length) : 0;

  const grandNetPayable = round2(payData.reduce((s, p) => s + p.netWithPrevDue, 0));
  const totalRent       = round2(payData.reduce((s, p) => s + p.roomRent, 0));
  const totalMealCost   = round2(payData.reduce((s, p) => s + p.mealCost, 0));
  const totalUtilPaid   = round2(payData.reduce((s, p) => s + p.utilityPaid, 0));
  const totalRentPaid   = round2(payData.reduce((s, p) => s + p.roomRentPaid, 0));
  const totalMealPaid   = round2(payData.reduce((s, p) => s + (p.mealPaid || 0), 0));

  logContent.innerHTML = `
    <!-- Summary banner -->
    <div style="
      background:linear-gradient(135deg,var(--bg3),var(--bg2));
      border:1px solid var(--border2);border-radius:var(--radius);
      padding:18px;margin-bottom:14px
    ">
      <div style="font-size:16px;font-weight:700;margin-bottom:12px">
        Settlement — ${MONTHS[month]} ${year}
        <span style="font-size:12px;color:var(--text3);font-weight:400;margin-left:8px">
          (Meal & Bazar data from ${MONTHS[prev.month]} ${prev.year})
        </span>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">🍽 Total meals (${MONTHS[prev.month].slice(0,3)})</div>
          <div class="stat-value">${totalMeals}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">📊 Meal rate</div>
          <div class="stat-value" style="font-size:17px">${fmtTk(mealRate)}</div>
          <div class="stat-sub">${fmtTk(totalBazar)} ÷ ${totalMeals} meals</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">🛒 Total bazar (${MONTHS[prev.month].slice(0,3)})</div>
          <div class="stat-value" style="font-size:17px">${fmtTk(totalBazar)}</div>
        </div>
        <div class="stat-card" style="border-color:rgba(91,155,213,.3)">
          <div class="stat-label" style="color:var(--blue)">🔵 Prepaid bills (${MONTHS[month].slice(0,3)})</div>
          <div class="stat-value" style="font-size:17px;color:var(--blue)">${fmtTk(prepaidTotal)}</div>
          <div class="stat-sub">Elec ${fmtTk(elecAmt)} + Gas ${fmtTk(gasAmt)} + WiFi ${fmtTk(wifiAmt)}</div>
        </div>
        <div class="stat-card" style="border-color:rgba(231,76,60,.3)">
          <div class="stat-label" style="color:var(--red)">🔴 Postpaid bills (${MONTHS[prev.month].slice(0,3)})</div>
          <div class="stat-value" style="font-size:17px;color:var(--red)">${fmtTk(postpaidTotal)}</div>
          <div class="stat-sub">Khala ${fmtTk(khalaTotal)} + Other ${fmtTk(otherTotal)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">⚡ Prepaid per member</div>
          <div class="stat-value" style="font-size:17px">${fmtTk(prepaidShare)}</div>
          <div class="stat-sub">${prepaidTotal} ÷ ${members.length} members</div>
        </div>
      </div>
    </div>

    <!-- Settlement table -->
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div class="card-title" style="margin:0">Member Settlement — ${MONTHS[month]} ${year}</div>
        <div style="display:flex;gap:10px;font-size:12px;font-weight:600;flex-wrap:wrap">
          <span><span style="display:inline-block;width:9px;height:9px;background:var(--red);border-radius:2px;margin-right:4px"></span>Postpaid from ${MONTHS[prev.month]} ${prev.year}</span>
          <span><span style="display:inline-block;width:9px;height:9px;background:var(--blue);border-radius:2px;margin-right:4px"></span>Prepaid for ${MONTHS[month]} ${year}</span>
          <span><span style="display:inline-block;width:9px;height:9px;background:var(--green);border-radius:2px;margin-right:4px"></span>Credits</span>
        </div>
      </div>

      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th rowspan="2">Member</th>
              <th rowspan="2">Meals<br><span style="font-size:10px;color:var(--text3)">${MONTHS[prev.month].slice(0,3)}</span></th>
              <th colspan="3" style="color:var(--red);background:rgba(231,76,60,.07)">
                🔴 Postpaid — ${MONTHS[prev.month].slice(0,3)} ${prev.year}
              </th>
              <th colspan="2" style="color:var(--blue);background:rgba(91,155,213,.07)">
                🔵 Prepaid — ${MONTHS[month].slice(0,3)} ${year}
              </th>
              <th colspan="6" style="color:var(--green);background:rgba(39,174,96,.07)">
                ✅ Credits
              </th>
              <th rowspan="2" style="background:var(--bg3)">Net</th>
            </tr>
            <tr>
              <th style="color:var(--red)">Meal cost</th>
              <th style="color:var(--red)">Khala</th>
              <th style="color:var(--red)">Other</th>
              <th style="color:var(--blue)">Util share</th>
              <th style="color:var(--blue)">Rent</th>
              <th style="color:var(--green)">Bazar paid</th>
              <th style="color:var(--green)">Meal paid</th>
              <th style="color:var(--green)">Rent paid</th>
              <th style="color:var(--green)">Util paid</th>
              <th style="color:var(--blue)">↩ Carried fwd</th>
              <th style="color:var(--red)">Prev due</th>
            </tr>
          </thead>

          <tbody>
            ${payData.map((p, idx) => `
              <tr>
                <td><b>${p.memberName}</b>
                  <div style="display:flex;gap:4px;margin-top:3px;flex-wrap:wrap">
                    <span class="badge ${p.rentStatus === 'paid' ? 'badge-green' : p.rentStatus === 'partial' ? 'badge-amber' : 'badge-red'}" style="font-size:9px">
                      rent ${p.rentStatus === 'paid' ? '✓' : p.rentStatus === 'partial' ? '~' : '✗'}
                    </span>
                    <span class="badge ${p.utilityStatus === 'paid' ? 'badge-green' : p.utilityStatus === 'partial' ? 'badge-amber' : 'badge-red'}" style="font-size:9px">
                      util ${p.utilityStatus === 'paid' ? '✓' : p.utilityStatus === 'partial' ? '~' : '✗'}
                    </span>
                  </div>
                </td>
                <td style="text-align:center">
                  <b>${p.memberMeals}</b>
                  <div style="font-size:10px;color:var(--text3)">${p.memberMeals} × ${fmtTk(p.mealRate)}</div>
                </td>
                <td style="color:var(--red)">${fmtTk(p.mealCost)}</td>
                <td style="color:var(--red)">${fmtTk(p.khalaShare)}</td>
                <td style="color:var(--red)">${fmtTk(p.otherShare)}</td>
                <td style="color:var(--blue)">
                  ${fmtTk(p.prepaidUtility)}
                  <div style="font-size:10px;color:var(--text3)">${fmtTk(p.prepaidTotal)} ÷ ${members.length}</div>
                </td>
                <td style="color:var(--blue)">${fmtTk(p.roomRent)}</td>
                <td style="color:var(--green)">${fmtTk(p.memberBazar)}</td>
                <td style="color:${(p.mealPaid||0) > 0 ? 'var(--green)' : 'var(--text3)'}">
                  ${(p.mealPaid||0) > 0 ? fmtTk(p.mealPaid) : '৳0'}
                </td>
                <td style="color:${p.roomRentPaid > 0 ? 'var(--green)' : 'var(--text3)'}">
                  ${p.roomRentPaid > 0 ? fmtTk(p.roomRentPaid) : '৳0'}
                </td>
                <td style="color:${p.utilityPaid > 0 ? 'var(--green)' : 'var(--text3)'}">
                  ${p.utilityPaid > 0 ? fmtTk(p.utilityPaid) : '৳0'}
                </td>
                <td style="color:${(p.messCredit||0) > 0 ? 'var(--blue)' : 'var(--text3)'}">
                  ${(p.messCredit||0) > 0 ? '↩ ' + fmtTk(p.messCredit) : '—'}
                </td>
                <td style="color:${(p.prevDue||0) > 0 ? 'var(--red)' : 'var(--text3)'}">
                  ${(p.prevDue||0) > 0 ? fmtTk(p.prevDue) : '—'}
                </td>
                <td style="background:var(--bg3)">
                  <button
                    class="btn btn-ghost btn-sm"
                    style="font-size:11px;padding:3px 7px;margin-bottom:3px"
                    onclick="showSettlementBreakdown(${idx})"
                  >Details</button>
                  <div>
                    <b class="${p.netWithPrevDue > 0 ? 'net-neg' : p.netWithPrevDue < 0 ? 'net-pos' : ''}" style="font-size:14px">
                      ${p.netWithPrevDue > 0 ? 'Pay ' + fmtTk(p.netWithPrevDue) : p.netWithPrevDue < 0 ? 'Get ' + fmtTk(Math.abs(p.netWithPrevDue)) : '✓ Settled'}
                    </b>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>

          <tfoot>
            <tr>
              <td><b>Total</b></td>
              <td>${totalMeals}</td>
              <td>${fmtTk(totalMealCost)}</td>
              <td>${fmtTk(khalaTotal)}</td>
              <td>${fmtTk(otherTotal)}</td>
              <td>${fmtTk(prepaidTotal)}</td>
              <td>${fmtTk(totalRent)}</td>
              <td>${fmtTk(totalBazar)}</td>
              <td>${fmtTk(totalMealPaid)}</td>
              <td>${fmtTk(totalRentPaid)}</td>
              <td>${fmtTk(totalUtilPaid)}</td>
              <td style="color:var(--blue)">${fmtTk(round2(payData.reduce((s,p) => s + (p.messCredit||0), 0)))}</td>
              <td style="color:var(--red)">${fmtTk(round2(payData.reduce((s,p) => s + (p.prevDue||0), 0)))}</td>
              <td><b class="${grandNetPayable > 0 ? 'net-neg' : grandNetPayable < 0 ? 'net-pos' : ''}">
                ${grandNetPayable > 0 ? 'Pay ' + fmtTk(grandNetPayable) : grandNetPayable < 0 ? 'Get ' + fmtTk(Math.abs(grandNetPayable)) : '✓ Balanced'}
              </b></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style="font-size:12px;color:var(--text3);margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        💡 Click <b>Details</b> on any row for a step-by-step breakdown. <b style="color:var(--blue)">↩ Carried fwd</b> = credit applied from last month's overpayment — reduces this month's net payable. <b style="color:var(--red)">Prev due</b> = unpaid balance from last month.
      </div>
    </div>
  `;
}