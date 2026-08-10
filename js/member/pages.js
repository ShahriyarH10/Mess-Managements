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

  const allMeals = await dbGetAll("meals");
  const monthKeys = getMealMonthKeys(allMeals);

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

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Meal Log</div>
      <div class="page-sub">Mark absences &amp; update your meal count</div>
    </div>

  </div>

  <div class="content">

    <div class="grid-2" style="align-items:start">
      <!-- ── Left column: Meal entry + Absence stacked ── -->
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-title">My meal entry</div>

          <div class="auth-sub" style="margin-bottom:14px;font-size:13px;color:var(--text2)">
            Your meal will be saved directly. Manager will only receive an update notification.
          </div>

          <div class="date-row">
            <label>Date</label>
            <input type="date" class="input" id="my-meal-date" value="${dt}" style="width:170px" onchange="fillMyMealFromDate()"/>
            <button class="btn btn-ghost btn-sm" onclick="fillMyMealFromDate()">Load</button>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
            <div class="field">
              <label>Day meals</label>
              <input type="number" class="input" id="my-meal-day" min="0" max="4" step="0.5" value="0"/>
            </div>
            <div class="field">
              <label>Night meals</label>
              <input type="number" class="input" id="my-meal-night" min="0" max="4" step="0.5" value="0"/>
            </div>
          </div>

          <div class="field">
            <label>Note (optional)</label>
            <input type="text" class="input" id="my-meal-note" placeholder="e.g. Updated my night meal"/>
          </div>

          <button class="btn btn-primary" onclick="saveMyMealEntry()">✓ Save my meal</button>
        </div>

        <div class="card">
          <div class="card-title" style="margin-bottom:10px">🗓️ Mark Absence</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
            <div class="field" style="margin:0">
              <label>From date</label>
              <input type="date" class="input" id="abs-from" value="${dt}" min="${dt}"/>
            </div>
            <div class="field" style="margin:0">
              <label>To date</label>
              <input type="date" class="input" id="abs-to" value="${dt}" min="${dt}"/>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:8px 10px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border)">
              <input type="checkbox" id="abs-skip-day" checked style="width:16px;height:16px"> ☀ Skip day
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:8px 10px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border)">
              <input type="checkbox" id="abs-skip-night" checked style="width:16px;height:16px"> 🌙 Skip night
            </label>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:8px">
            <button class="btn btn-primary" onclick="markAbsenceRange()" style="flex:1;justify-content:center">✗ Mark Absent</button>
            <button class="btn btn-ghost" onclick="clearAbsenceRange()" style="flex:1;justify-content:center">✓ Present</button>
          </div>
          <div style="font-size:11px;color:var(--text3)">Mark a date range absent at once. Manager sees this on the Attendance Board.</div>
        </div>

        <div class="card" id="upcoming-absences">
          <div class="card-title" style="margin-bottom:8px">📋 Upcoming Absences</div>
          ${upcoming.length ? `
            <div style="display:flex;flex-direction:column;gap:6px">
              ${upcoming.map(a => {
                const skipDay = !a.day_meal, skipNight = !a.night_meal;
                return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;background:var(--red-bg);border:1px solid rgba(224,82,82,.2);border-radius:var(--radius-sm)">
                  <div style="min-width:0">
                    <div style="font-size:13px;font-weight:600">${a.date}</div>
                    <div style="font-size:11px;color:var(--text3)">${skipDay && skipNight ? "All meals off" : skipDay ? "☀ Day off" : "🌙 Night off"}</div>
                  </div>
                  <button class="btn btn-ghost btn-sm" onclick="cancelAbsence('${a.id}')" style="flex-shrink:0">✕</button>
                </div>`;
              }).join("")}
            </div>
          ` : '<div style="font-size:13px;color:var(--text3)">No upcoming absences — you\'re eating all meals! 🍽️</div>'}
        </div>
      </div>

      <!-- ── Right column: Month history ── -->
      <div class="card">
        <div class="card-title">Month history</div>
        <div class="modal-sub" style="margin-bottom:12px">
          Click a month to open your colored meal calendar.
        </div>
        ${buildMealMonthButtons(monthKeys, "openMyMealMonth", allMeals)}
      </div>
    </div>
  </div>

  </div>`;

  // Auto-load today's existing meal data as soon as the section renders
  fillMyMealFromDate();
  // Load bazar history for the bazar tab
  loadMyBazarRecent();
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

  const allBazar = await dbGetAll("bazar");

  const myRows = allBazar
    .filter(r => Number((r.bazar || {})[member.name] || 0) > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 20);

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Bazar Entry</div>
      <div class="page-sub">Update your own bazar spending directly</div>
    </div>
  </div>

  <div class="content">
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">My bazar entry</div>

      <div class="auth-sub" style="margin-bottom:14px;font-size:13px;color:var(--text2)">
        This will update your amount for the selected date. Manager will only receive an update notification.
      </div>

      <div class="date-row">
        <label>Date</label>
        <input type="date" class="input" id="my-bazar-date" value="${today()}" style="width:170px" onchange="fillMyBazarFromDate()"/>
        <button class="btn btn-ghost btn-sm" onclick="fillMyBazarFromDate()">Load</button>
      </div>

      <div class="field">
        <label>Amount (৳) *</label>
        <input type="number" class="input" id="my-bazar-amount" min="0" placeholder="e.g. 850"/>
      </div>

      <div class="field">
        <label>Note (optional)</label>
        <input type="text" class="input" id="my-bazar-note" placeholder="e.g. Bought vegetables from market"/>
      </div>

      <button class="btn btn-primary" onclick="saveMyBazarEntry()">✓ Save my bazar</button>
    </div>

    <div class="card">
      <div class="card-title">My saved bazar entries</div>

      ${
        myRows.length === 0
          ? `<div class="empty">No bazar entries yet</div>`
          : `<div class="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                  </tr>
                </thead>

                <tbody>
                  ${
                    myRows.map(r => `
                    <tr>
                      <td><b>${r.date}</b></td>
                      <td style="color:var(--green);font-weight:600">
                        ${fmtTk(Number((r.bazar || {})[member.name] || 0))}
                      </td>
                    </tr>`).join("")
                  }
                </tbody>
              </table>
            </div>`
      }
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

  document.getElementById("my-bazar-amount").value =
    Number((existing?.bazar || {})[member.name] || 0);
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
    sb
      .from("utility_payments")
      .select("*")
      .eq("mess_id", messId())
      .order("month_key", { ascending: false }),
  ]);

  const n = new Date();

  const rentRows = (allRent || [])
    .map(r => ({
      rec: r,
      entry: (r.entries || []).find(e => e.name === member.name),
    }))
    .filter(x => x.entry && Number(x.entry.paid || 0) > 0)
    .slice(-8)
    .reverse();

  const utilRows = (allUtil || [])
    .map(r => ({
      rec: r,
      payment: (r.payments || {})[member.name],
    }))
    .filter(x => x.payment && Number(x.payment.paid || 0) > 0)
    .slice(0, 8);

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Utility & Room Rent Entry</div>
      <div class="page-sub">Update your own utility or rent payment directly</div>
    </div>
  </div>

  <div class="content">
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">My utility / room-rent payment</div>

      <div class="auth-sub" style="margin-bottom:14px;font-size:13px;color:var(--text2)">
        The payment will be credited immediately. Manager will only receive an update notification.
      </div>

      <div class="grid-2">
        <div class="field">
          <label>Month</label>
          <select class="input" id="bp-month">
            ${
              MONTHS.map((m, i) => `
                <option value="${i}"${i === n.getMonth() ? " selected" : ""}>
                  ${m}
                </option>`).join("")
            }
          </select>
        </div>

        <div class="field">
          <label>Year</label>
          <select class="input" id="bp-year">
            ${
              Array.from({ length: 5 }, (_, i) => n.getFullYear() - 2 + i)
                .map(y => `
                  <option value="${y}"${y === n.getFullYear() ? " selected" : ""}>
                    ${y}
                  </option>`)
                .join("")
            }
          </select>
        </div>
      </div>

      <div class="field">
        <label>Payment type *</label>
        <select class="input" id="bp-type">
          <option value="">— Select payment —</option>
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
        <input type="text" class="input" id="bp-note" placeholder="e.g. Paid full electricity bill"/>
      </div>

      <button class="btn btn-primary" onclick="saveMyPaymentEntry()">✓ Save payment</button>
    </div>

    <div class="grid-2" style="align-items:start">
      <div class="card">
        <div class="card-title">My rent payment history</div>

        ${
          rentRows.length === 0
            ? `<div class="empty">No rent payment yet</div>`
            : `<div class="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Rent</th>
                      <th>Paid</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${
                      rentRows.map(x => `
                      <tr>
                        <td><b>${x.rec.month_name} ${x.rec.year}</b></td>
                        <td>${fmtTk(x.entry.rent || 0)}</td>
                        <td style="color:var(--green);font-weight:600">${fmtTk(x.entry.paid || 0)}</td>
                        <td>
                          <span class="badge ${
                            x.entry.status === "paid"
                              ? "badge-green"
                              : x.entry.status === "partial"
                                ? "badge-amber"
                                : "badge-red"
                          }">
                            ${x.entry.status || "unpaid"}
                          </span>
                        </td>
                      </tr>`).join("")
                    }
                  </tbody>
                </table>
              </div>`
        }
      </div>

      <div class="card">
        <div class="card-title">My utility payment history</div>

        ${
          utilRows.length === 0
            ? `<div class="empty">No utility payment yet</div>`
            : `<div class="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Paid</th>
                      <th>Status</th>
                      <th>Note</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${
                      utilRows.map(x => `
                      <tr>
                        <td><b>${x.rec.month_name} ${x.rec.year}</b></td>
                        <td style="color:var(--green);font-weight:600">${fmtTk(x.payment.paid || 0)}</td>
                        <td>
                          <span class="badge ${
                            x.payment.status === "paid"
                              ? "badge-green"
                              : x.payment.status === "partial"
                                ? "badge-amber"
                                : "badge-red"
                          }">
                            ${x.payment.status || "unpaid"}
                          </span>
                        </td>
                        <td style="color:var(--text3)">${x.payment.notes || "—"}</td>
                      </tr>`).join("")
                    }
                  </tbody>
                </table>
              </div>`
        }
      </div>
    </div>
  </div>`;
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