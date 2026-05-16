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

  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Meal Entry</div>
      <div class="page-sub">Update your own meal count directly</div>
    </div>
  </div>

  <div class="content">
    <div class="grid-2" style="align-items:start;margin-bottom:14px">
      <div class="card">
        <div class="card-title">My meal entry</div>

        <div class="auth-sub" style="margin-bottom:14px;font-size:13px;color:var(--text2)">
          Your meal will be saved directly. Manager will only receive an update notification.
        </div>

        <div class="date-row">
          <label>Date</label>
          <input type="date" class="input" id="my-meal-date" value="${today()}" style="width:170px" onchange="fillMyMealFromDate()"/>
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
        <div class="card-title">Month history</div>

        <div class="modal-sub" style="margin-bottom:12px">
          Click a month, like April 2026 or May 2026, to open your colored meal calendar.
        </div>

        ${buildMealMonthButtons(monthKeys, "openMyMealMonth", allMeals)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">My saved meal entries</div>

      ${
        myRows.length === 0
          ? `<div class="empty">No meal entries yet</div>`
          : `<div class="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Night</th>
                    <th>Total</th>
                  </tr>
                </thead>

                <tbody>
                  ${
                    myRows.map(r => {
                      const p = mealPartsFromObj(r.meals || {}, member.name);

                      return `
                      <tr>
                        <td><b>${r.date}</b></td>
                        <td>${p.day > 0 ? `<span class="badge badge-blue">${p.day}</span>` : "—"}</td>
                        <td>${p.night > 0 ? `<span class="badge badge-amber">${p.night}</span>` : "—"}</td>
                        <td><b>${p.total}</b></td>
                      </tr>`;
                    }).join("")
                  }
                </tbody>
              </table>
            </div>`
      }
    </div>
  </div>`;

  // Auto-load today's existing meal data as soon as the section renders
  fillMyMealFromDate();
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
    navigate("my-meals");
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
    navigate("my-bazar");
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
    navigate("my-payments");
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}