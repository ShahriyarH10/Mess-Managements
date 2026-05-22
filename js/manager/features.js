/* ═══════════════════════════════════════════════
   MANAGER — Features: attendance board, broadcasts,
   mess rules, PDF/Excel export, meal rate chart
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   ABSENCE CALENDAR (Manager view — full month)
═══════════════════════════════════════════ */
async function renderAttendanceBoard(el) {
  const now = new Date();
  const { month, year } = thisMonth();
  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">📅 Absence Calendar</div><div class="page-sub">Full month view of who is absent each day</div></div>
    <div class="topbar-actions">
      <select class="input" id="cal-month" style="width:130px" onchange="loadAbsenceCalendar()">
        ${MONTHS.map((m, i) => `<option value="${i}" ${i === month ? "selected" : ""}>${m}</option>`).join("")}
      </select>
      <select class="input" id="cal-year" style="width:88px" onchange="loadAbsenceCalendar()">
        ${[-1, 0, 1].map(d => year + d).map(y => `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`).join("")}
      </select>
    </div>
  </div>
  <div class="content">
    <div id="absence-cal-wrap"><div class="empty" style="padding:32px;text-align:center"><div class="spinner"></div></div></div>
  </div>`;
  await loadAbsenceCalendar();
}

async function loadAbsenceCalendar() {
  const wrap = document.getElementById("absence-cal-wrap");
  if (!wrap) return;
  const month = parseInt(document.getElementById("cal-month")?.value ?? new Date().getMonth());
  const year  = parseInt(document.getElementById("cal-year")?.value  ?? new Date().getFullYear());
  const key   = monthKey(year, month);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow    = new Date(year, month, 1).getDay(); // 0=Sun
  const todayStr    = today();

  wrap.innerHTML = `<div class="empty" style="padding:16px;text-align:center"><div class="spinner"></div> Loading…</div>`;

  try {
    const startDate = `${key}-01`;
    const endDate   = `${key}-${String(daysInMonth).padStart(2, "0")}`;

    // Fetch both attendance records AND actual meal entries for the month
    const [{ data: attRows, error: attErr }, allMeals] = await Promise.all([
      getClient().from("meal_attendance").select("*")
        .eq("mess_id", messId()).gte("date", startDate).lte("date", endDate),
      dbGetAll("meals"),
    ]);
    if (attErr) throw attErr;

    // meal_attendance map: date → member_id → row
    const attMap = {}; // date → member_id → { day_meal, night_meal, source }
    (attRows || []).forEach(a => {
      if (!attMap[a.date]) attMap[a.date] = {};
      attMap[a.date][a.member_id] = { day_meal: a.day_meal, night_meal: a.night_meal, id: a.id, source: "toggle" };
    });

    // Merge 0-meal days from the meals table
    // If the manager logged a meal entry for a day and a member has 0 total → absent
    const mealRows = allMeals.filter(r => String(r.date || "").startsWith(key));
    mealRows.forEach(r => {
      const date = r.date;
      members.forEach(m => {
        const mObj = r.meals || {};
        const dayVal   = Number(mObj[m.name + "_day"]  ?? mObj[m.name] ?? 0);
        const nightVal = Number(mObj[m.name + "_night"] ?? 0);
        const total    = dayVal + nightVal;

        // Only mark absent from meals table if manager actually logged the day
        // (i.e. at least one member has meals > 0 on this date)
        const anyMeals = Object.values(mObj).some(v => Number(v) > 0);
        if (!anyMeals) return;

        if (!attMap[date]) attMap[date] = {};

        // If already marked via toggle, keep toggle data (more precise)
        if (attMap[date][m.id]) return;

        if (total === 0) {
          // 0 meals logged → absent all day
          attMap[date][m.id] = { day_meal: false, night_meal: false, source: "meal_zero" };
        } else if (dayVal === 0 && nightVal > 0) {
          attMap[date][m.id] = { day_meal: false, night_meal: true,  source: "meal_zero" };
        } else if (dayVal > 0 && nightVal === 0) {
          attMap[date][m.id] = { day_meal: true,  night_meal: false, source: "meal_zero" };
        }
        // dayVal>0 && nightVal>0 → eating both, not absent, skip
      });
    });

    // Member id → index for colour lookup
    const memIdx = {};
    members.forEach((m, i) => { memIdx[m.id] = i; });

    // Legend
    const legend = `
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;font-size:11px;color:var(--text3)">
        <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:var(--red);opacity:.8;display:inline-block"></span>All meals off</span>
        <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:var(--blue);opacity:.7;display:inline-block"></span>Day off only</span>
        <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:var(--accent);opacity:.8;display:inline-block"></span>Night off only</span>
        <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;border:1.5px solid var(--border);display:inline-block"></span>From meal entry</span>
      </div>`;

    // Day-of-week headers
    const dowHeaders = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
      .map(d => `<div style="text-align:center;font-size:10px;font-weight:700;color:var(--text3);padding:4px 0;text-transform:uppercase;letter-spacing:.4px">${d}</div>`)
      .join("");

    // Calendar cells
    const cells = [];

    // Empty cells before first day
    for (let i = 0; i < firstDow; i++) {
      cells.push(`<div></div>`);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${key}-${String(d).padStart(2, "0")}`;
      const isToday = dateStr === todayStr;
      const isPast  = dateStr < todayStr;
      const dayMap  = attMap[dateStr] || {}; // member_id → { day_meal, night_meal, source }

      // Categorise absences
      const allOff    = []; // { member, source }
      const dayOff    = [];
      const nightOff  = [];

      members.forEach(m => {
        const a = dayMap[m.id];
        if (!a) return;
        const entry = { member: m, source: a.source };
        if (!a.day_meal && !a.night_meal) allOff.push(entry);
        else if (!a.day_meal &&  a.night_meal) dayOff.push(entry);
        else if ( a.day_meal && !a.night_meal) nightOff.push(entry);
      });

      const totalAbsent = allOff.length + dayOff.length + nightOff.length;
      const cellBg     = isToday ? "var(--accent-bg)" : "var(--bg2)";
      const cellBorder = isToday ? "2px solid var(--accent)" : "1px solid var(--border)";
      const dayNumColor = isToday ? "var(--accent)" : isPast ? "var(--text3)" : "var(--text)";

      function avatarDot(entry, borderColor) {
        const m = entry.member;
        const col = avatarCol(memIdx[m.id] ?? 0);
        // Dashed border = inferred from meal entry, solid = explicit toggle
        const borderStyle = entry.source === "meal_zero" ? "dashed" : "solid";
        return `<div title="${escapeHtml(m.name)}${entry.source === "meal_zero" ? " (from meal entry)" : " (marked absent)"}"
          style="width:26px;height:26px;border-radius:50%;background:${col.bg};color:${col.fg};
                 display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;
                 border:2px ${borderStyle} ${borderColor};flex-shrink:0">${initials(m.name)}</div>`;
      }

      const dots = totalAbsent > 0
        ? `<div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:4px">
            ${allOff.map(e   => avatarDot(e, "var(--red)")).join("")}
            ${dayOff.map(e   => avatarDot(e, "var(--blue)")).join("")}
            ${nightOff.map(e => avatarDot(e, "var(--accent)")).join("")}
           </div>`
        : isPast
          ? `<div style="font-size:9px;color:var(--green);margin-top:4px;opacity:.7">✓ All ate</div>`
          : `<div style="font-size:9px;color:var(--text3);margin-top:4px">—</div>`;

      cells.push(`
        <div style="background:${cellBg};border:${cellBorder};border-radius:6px;padding:6px 6px 5px;min-height:80px;cursor:default;transition:border-color .15s"
             onmouseover="this.style.borderColor='var(--accent)'"
             onmouseout="this.style.borderColor='${isToday ? "var(--accent)" : "var(--border)"}'">
          <div style="font-size:11px;font-weight:700;color:${dayNumColor};line-height:1">${d}</div>
          ${dots}
        </div>`);
    }

    // Total absence records across whole month
    let totalAbsenceDays = 0;
    Object.values(attMap).forEach(dayMap => {
      Object.values(dayMap).forEach(a => {
        if (!a.day_meal || !a.night_meal) totalAbsenceDays++;
      });
    });

    wrap.innerHTML = `
      <div class="card">
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
          <div class="stat-card" style="flex:1;min-width:90px;padding:10px">
            <div class="stat-label">Month</div>
            <div style="font-size:15px;font-weight:700;margin-top:4px">${MONTHS[month]} ${year}</div>
          </div>
          <div class="stat-card" style="flex:1;min-width:90px;padding:10px">
            <div class="stat-label">Members</div>
            <div class="stat-value" style="font-size:20px;margin-top:4px">${members.length}</div>
          </div>
          <div class="stat-card" style="flex:1;min-width:90px;padding:10px">
            <div class="stat-label">Absence records</div>
            <div class="stat-value" style="font-size:20px;margin-top:4px;color:var(--red)">${totalAbsenceDays}</div>
          </div>
          <div class="stat-card" style="flex:1;min-width:90px;padding:10px">
            <div class="stat-label">Days in month</div>
            <div class="stat-value" style="font-size:20px;margin-top:4px">${daysInMonth}</div>
          </div>
        </div>

        ${legend}

        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">
          ${dowHeaders}
          ${cells.join("")}
        </div>

        ${totalAbsenceDays > 0 ? `
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
          <div class="card-title" style="margin-bottom:8px">Member absence summary — ${MONTHS[month]}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">
            ${members.map((m, i) => {
              const mEntries = Object.entries(attMap)
                .flatMap(([, dm]) => dm[m.id] ? [dm[m.id]] : [])
                .filter(a => !a.day_meal || !a.night_meal);
              if (!mEntries.length) return "";
              const col = avatarCol(i);
              const allOffDays   = mEntries.filter(a => !a.day_meal && !a.night_meal).length;
              const dayOffDays   = mEntries.filter(a => !a.day_meal &&  a.night_meal).length;
              const nightOffDays = mEntries.filter(a =>  a.day_meal && !a.night_meal).length;
              return `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;display:flex;align-items:flex-start;gap:8px">
                <div style="width:28px;height:28px;border-radius:50%;background:${col.bg};color:${col.fg};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0">${initials(m.name)}</div>
                <div style="min-width:0">
                  <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m.name)}</div>
                  <div style="font-size:10px;color:var(--text3);margin-top:3px;display:flex;flex-direction:column;gap:1px">
                    ${allOffDays   > 0 ? `<span style="color:var(--red)">All off: ${allOffDays}d</span>` : ""}
                    ${dayOffDays   > 0 ? `<span style="color:var(--blue)">☀ Day off: ${dayOffDays}d</span>` : ""}
                    ${nightOffDays > 0 ? `<span style="color:var(--accent)">🌙 Night off: ${nightOffDays}d</span>` : ""}
                  </div>
                </div>
              </div>`;
            }).filter(Boolean).join("")}
          </div>
        </div>` : ""}
      </div>`;
  } catch (e) {
    wrap.innerHTML = `<div class="card"><div class="empty">Error: ${escapeHtml(e.message)}</div></div>`;
  }
}

/* ═══════════════════════════════════════════
   ABSENCE RANGE FUNCTIONS (used in Meal Log)
═══════════════════════════════════════════ */
async function markAbsenceRange() {
  const from = document.getElementById("abs-from")?.value;
  const to   = document.getElementById("abs-to")?.value;
  const skipDay   = document.getElementById("abs-skip-day")?.checked ?? true;
  const skipNight = document.getElementById("abs-skip-night")?.checked ?? true;

  if (!from || !to) { toast("Select both dates", "error"); return; }
  if (to < from)    { toast("To date must be after from date", "error"); return; }
  if (!skipDay && !skipNight) { toast("Select at least one meal to skip", "error"); return; }

  const memberId = window._attMemberId;
  if (!memberId) { toast("Member not loaded", "error"); return; }

  // Enumerate all dates in range
  const dates = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  if (dates.length > 90) { toast("Range too large (max 90 days)", "error"); return; }

  try {
    await Promise.all(dates.map(d =>
      dbSetAttendance(memberId, d, !skipDay, !skipNight)
    ));
    await logAudit("update", "attendance", `${from}→${to}`,
      `${currentUser.name} marked absent ${from} to ${to} (${dates.length} days)`);
    toast(`Marked absent for ${dates.length} day${dates.length > 1 ? "s" : ""} ✓`, "success");
    // Refresh the upcoming absences list
    await refreshUpcomingAbsences(memberId);
  } catch (e) { toast("Error: " + e.message, "error"); }
}

async function clearAbsenceRange() {
  const from = document.getElementById("abs-from")?.value;
  const to   = document.getElementById("abs-to")?.value;
  if (!from || !to) { toast("Select both dates", "error"); return; }
  if (to < from)    { toast("To date must be after from date", "error"); return; }

  const memberId = window._attMemberId;
  if (!memberId) return;

  const dates = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  try {
    await Promise.all(dates.map(d => dbSetAttendance(memberId, d, true, true)));
    toast(`Marked present for ${dates.length} day${dates.length > 1 ? "s" : ""} ✓`, "success");
    await refreshUpcomingAbsences(memberId);
  } catch (e) { toast("Error: " + e.message, "error"); }
}

async function cancelAbsence(id) {
  try {
    const { error } = await getClient().from("meal_attendance").delete().eq("id", id);
    if (error) throw error;
    toast("Absence cancelled ✓", "success");
    await refreshUpcomingAbsences(window._attMemberId);
  } catch (e) { toast("Error: " + e.message, "error"); }
}

async function refreshUpcomingAbsences(memberId) {
  const wrap = document.getElementById("upcoming-absences");
  if (!wrap) return;
  const dt = today();
  try {
    const { data } = await getClient().from("meal_attendance")
      .select("*").eq("mess_id", messId()).eq("member_id", memberId)
      .gte("date", dt).order("date", { ascending: true }).limit(30);
    const upcoming = (data || []).filter(a => !a.day_meal || !a.night_meal);
    wrap.innerHTML = `<div class="card-title" style="margin-bottom:8px">📋 Upcoming Absences</div>` + (upcoming.length
      ? `<div style="display:flex;flex-direction:column;gap:6px">
          ${upcoming.map(a => {
            const skipDay = !a.day_meal, skipNight = !a.night_meal;
            return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;background:var(--red-bg);border:1px solid rgba(224,82,82,.2);border-radius:var(--radius-sm)">
              <div>
                <span style="font-size:13px;font-weight:600">${a.date}</span>
                <span style="font-size:11px;color:var(--text3);margin-left:8px">${skipDay && skipNight ? "All meals off" : skipDay ? "☀ Day off" : "🌙 Night off"}</span>
              </div>
              <button class="btn btn-ghost btn-sm" onclick="cancelAbsence('${a.id}')">✕ Cancel</button>
            </div>`;
          }).join("")}
        </div>`
      : `<div style="font-size:13px;color:var(--text3)">No upcoming absences — you're eating all meals! 🍽️</div>`);
  } catch (e) { console.warn("Refresh absences failed:", e); }
}

/* ═══════════════════════════════════════════
   BROADCASTS (Manager)
═══════════════════════════════════════════ */
async function renderBroadcasts(el) {
  el.innerHTML = `
  <div class="topbar">
    <div><div class="page-title">📢 Broadcasts</div><div class="page-sub">Send urgent messages to all members</div></div>
    <div class="topbar-actions">
      <button class="btn btn-primary btn-sm" onclick="openBroadcastModal()">+ New broadcast</button>
    </div>
  </div>
  <div class="content">
    <div class="card" id="broadcast-list"><div class="empty">Loading…</div></div>
  </div>`;
  await loadBroadcastList();
}

async function loadBroadcastList() {
  const wrap = document.getElementById("broadcast-list"); if (!wrap) return;
  try {
    const all = await dbGetBroadcasts();
    if (!all.length) { wrap.innerHTML = '<div class="empty" style="padding:20px">No active broadcasts. Create one to notify all members.</div>'; return; }
    wrap.innerHTML = all.map(b => {
      const dt = new Date(b.created_at).toLocaleString("en-IN", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit", hour12:true });
      const isUrgent = b.priority === "urgent";
      return `<div style="background:${isUrgent ? "var(--red-bg)" : "var(--bg3)"};border:1px solid ${isUrgent ? "rgba(224,82,82,.25)" : "var(--border)"};border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="font-size:16px">${isUrgent ? "🔴" : "📢"}</span>
              ${isUrgent ? '<span style="font-size:10px;background:var(--red);color:#fff;padding:1px 6px;border-radius:99px;font-weight:700">URGENT</span>' : ""}
            </div>
            <div style="font-size:13px;color:var(--text);line-height:1.5">${escapeHtml(b.message)}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:4px">${escapeHtml(b.author)} · ${dt}${b.expires_at ? ` · Expires ${new Date(b.expires_at).toLocaleDateString("en-IN")}` : ""}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="deleteBroadcastItem('${b.id}')" style="flex-shrink:0">✕</button>
        </div>
      </div>`;
    }).join("");
  } catch (e) { wrap.innerHTML = `<div class="empty">Error: ${e.message}</div>`; }
}

function openBroadcastModal() {
  document.getElementById("modal-content").innerHTML = `
    <div class="modal-title">📢 New Broadcast</div>
    <div class="modal-sub">This message will appear as a banner on every member's dashboard.</div>
    <div class="field"><label>Message *</label><textarea class="input" id="bc-msg" rows="3" placeholder="e.g. Pay rent by Friday!"></textarea></div>
    <div class="grid-2">
      <div class="field"><label>Priority</label><select class="input" id="bc-priority"><option value="normal">Normal</option><option value="urgent">🔴 Urgent</option></select></div>
      <div class="field"><label>Auto-expire after</label><select class="input" id="bc-expiry"><option value="">Never</option><option value="6">6 hours</option><option value="12">12 hours</option><option value="24">1 day</option><option value="72">3 days</option><option value="168">1 week</option></select></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="sendBroadcast()">📢 Send</button></div>`;
  openModal();
}

async function sendBroadcast() {
  const msg = document.getElementById("bc-msg")?.value?.trim();
  if (!msg) { toast("Message is required"); return; }
  const priority = document.getElementById("bc-priority")?.value || "normal";
  const expHours = document.getElementById("bc-expiry")?.value || null;
  try {
    await dbPostBroadcast(msg, priority, expHours ? parseInt(expHours) : null);
    await logAudit("create", "broadcast", "", `Broadcast: "${msg.slice(0,50)}${msg.length>50?"…":""}"`, { priority });
    closeModal(); toast("Broadcast sent ✓", "success");
    await loadBroadcastList();
  } catch (e) { toast("Error: " + e.message, "error"); }
}

async function deleteBroadcastItem(id) {
  try { await dbDeleteBroadcast(id); toast("Broadcast removed"); await loadBroadcastList(); }
  catch (e) { toast("Error: " + e.message, "error"); }
}

/* ═══════════════════════════════════════════
   MESS RULES / PINNED INFO (Manager + Member)
═══════════════════════════════════════════ */
async function renderMessRules(el, isManager) {
  const rules = await dbGetMessRules();
  if (isManager) {
    el.innerHTML = `
    <div class="topbar"><div><div class="page-title">📌 Mess Rules & Info</div><div class="page-sub">Set WiFi password, bank details, rules, contacts</div></div></div>
    <div class="content"><div class="card" style="max-width:600px">
      <div class="field"><label>WiFi Password</label><input type="text" class="input" id="mr-wifi" value="${escapeHtml(rules?.wifi_pass||"")}" placeholder="e.g. MyWiFi@123"/></div>
      <div class="field"><label>Bank / Payment Info</label><textarea class="input" id="mr-bank" rows="3" placeholder="e.g. bKash: 01712345678 (Personal)">${escapeHtml(rules?.bank_info||"")}</textarea></div>
      <div class="field"><label>Mess Rules</label><textarea class="input" id="mr-rules" rows="5" placeholder="e.g. No guests after 11pm, everyone must clean their dishes...">${escapeHtml(rules?.rules_text||"")}</textarea></div>
      <div class="field"><label>Emergency Contacts</label><textarea class="input" id="mr-contacts" rows="3" placeholder="e.g. Landlord: 017xxx, Gas: 016xxx">${escapeHtml(rules?.contacts||"")}</textarea></div>
      <button class="btn btn-primary" onclick="saveMessRules()" style="width:100%;justify-content:center;margin-top:12px">💾 Save</button>
    </div></div>`;
  } else {
    // Member read-only view
    const hasAny = rules && (rules.wifi_pass || rules.bank_info || rules.rules_text || rules.contacts);
    el.innerHTML = `
    <div class="topbar"><div><div class="page-title">📌 Mess Info</div><div class="page-sub">Rules, WiFi, payment info, contacts</div></div></div>
    <div class="content">${hasAny ? `
      ${rules.wifi_pass ? `<div class="card" style="margin-bottom:12px"><div class="card-title">🔑 WiFi Password</div><div style="font-size:18px;font-weight:700;font-family:monospace;background:var(--bg4);padding:10px 14px;border-radius:var(--radius-sm);user-select:all;margin-top:6px">${escapeHtml(rules.wifi_pass)}</div></div>` : ""}
      ${rules.bank_info ? `<div class="card" style="margin-bottom:12px"><div class="card-title">💳 Payment Info</div><div style="font-size:13px;white-space:pre-wrap;color:var(--text2);margin-top:6px;line-height:1.6">${escapeHtml(rules.bank_info)}</div></div>` : ""}
      ${rules.rules_text ? `<div class="card" style="margin-bottom:12px"><div class="card-title">📜 Mess Rules</div><div style="font-size:13px;white-space:pre-wrap;color:var(--text2);margin-top:6px;line-height:1.6">${escapeHtml(rules.rules_text)}</div></div>` : ""}
      ${rules.contacts ? `<div class="card" style="margin-bottom:12px"><div class="card-title">📞 Emergency Contacts</div><div style="font-size:13px;white-space:pre-wrap;color:var(--text2);margin-top:6px;line-height:1.6">${escapeHtml(rules.contacts)}</div></div>` : ""}
    ` : '<div class="card"><div class="empty" style="padding:24px">No mess info has been set by the manager yet.</div></div>'}</div>`;
  }
}

async function saveMessRules() {
  if (!requireManager("saveMessRules")) return;
  try {
    await dbSaveMessRules({
      wifi_pass:  document.getElementById("mr-wifi")?.value || "",
      bank_info:  document.getElementById("mr-bank")?.value || "",
      rules_text: document.getElementById("mr-rules")?.value || "",
      contacts:   document.getElementById("mr-contacts")?.value || "",
    });
    await logAudit("update", "mess_rules", "", "Updated mess rules & info");
    toast("Mess info saved ✓", "success");
  } catch (e) { toast("Error: " + e.message, "error"); }
}

/* ═══════════════════════════════════════════
   HISTORICAL MEAL RATE CHART
═══════════════════════════════════════════ */
async function renderMealRateChart(el) {
  const allMeals = await dbGetAll("meals");
  const allBazar = await dbGetAll("bazar");

  // Compute per-month totals
  const monthData = {};
  allMeals.forEach(r => {
    const mk = String(r.date || "").slice(0, 7);
    if (!mk) return;
    if (!monthData[mk]) monthData[mk] = { meals: 0, bazar: 0 };
    const mObj = r.meals || {}, keys = Object.keys(mObj);
    const hasSplit = keys.some(k => k.endsWith("_day") || k.endsWith("_night"));
    if (hasSplit) keys.forEach(k => { if (k.endsWith("_day") || k.endsWith("_night")) monthData[mk].meals += Number(mObj[k]) || 0; });
    else Object.values(mObj).forEach(v => { monthData[mk].meals += Number(v) || 0; });
  });
  allBazar.forEach(r => {
    const mk = String(r.date || "").slice(0, 7);
    if (!mk) return;
    if (!monthData[mk]) monthData[mk] = { meals: 0, bazar: 0 };
    Object.values(r.bazar || {}).forEach(v => { monthData[mk].bazar += Number(v) || 0; });
  });

  const sortedKeys = Object.keys(monthData).sort();
  const rates = sortedKeys.map(k => ({
    key: k,
    label: MONTHS[parseInt(k.slice(5)) - 1]?.slice(0, 3) + " '" + k.slice(2, 4),
    rate: monthData[k].meals > 0 ? round2(monthData[k].bazar / monthData[k].meals) : 0,
    meals: round2(monthData[k].meals),
    bazar: round2(monthData[k].bazar),
  }));

  if (!rates.length) {
    el.innerHTML = `<div class="topbar"><div><div class="page-title">📈 Meal Rate History</div></div></div><div class="content"><div class="card"><div class="empty" style="padding:32px">No meal data yet.</div></div></div>`;
    return;
  }

  const maxRate = Math.max(...rates.map(r => r.rate), 1);
  const avgRate = round2(rates.reduce((s, r) => s + r.rate, 0) / rates.length);

  // SVG chart dimensions
  const CHART_H = 200;
  const LABEL_H = 36;
  const BAR_GAP = 8;
  const MIN_BAR_W = 36;
  const n = rates.length;
  // We'll use a viewBox approach — bars evenly spaced
  const SVG_W = Math.max(n * (MIN_BAR_W + BAR_GAP), 400);
  const barW = Math.floor((SVG_W - BAR_GAP * (n + 1)) / n);

  const bars = rates.map((r, i) => {
    const barH = r.rate > 0 ? Math.max(24, Math.round((r.rate / maxRate) * CHART_H)) : 4;
    const x = BAR_GAP + i * (barW + BAR_GAP);
    const y = CHART_H - barH;
    const isLast = i === rates.length - 1;
    const barColor = isLast ? "var(--accent)" : "var(--blue)";
    const labelX = x + barW / 2;
    // Label inside bar center — white text, only if bar tall enough
    const labelInsideY = y + barH / 2 + 4;
    const showInside = barH >= 22;
    return `
      <g>
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${barColor}" opacity="${isLast ? 1 : 0.75}">
          <title>${r.label}: ${fmtTk(r.rate)}/meal (${r.meals} meals, ${fmtTk(r.bazar)} bazar)</title>
        </rect>
        ${showInside
          ? `<text x="${labelX}" y="${labelInsideY}" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="700" fill="white" pointer-events="none">${fmtTk(r.rate)}</text>`
          : `<text x="${labelX}" y="${y - 4}" text-anchor="middle" font-size="9" font-weight="700" fill="${isLast ? "var(--accent)" : "var(--text2)"}" pointer-events="none">${fmtTk(r.rate)}</text>`
        }
        <text x="${labelX}" y="${CHART_H + 14}" text-anchor="middle" font-size="9" fill="var(--text3)">${r.label}</text>
      </g>`;
  }).join("");

  // Average line
  const avgY = CHART_H - Math.round((avgRate / maxRate) * CHART_H);
  const avgLine = `
    <line x1="0" y1="${avgY}" x2="${SVG_W}" y2="${avgY}" stroke="var(--green)" stroke-width="1.5" stroke-dasharray="5,4" opacity="0.7"/>
    <text x="${SVG_W - 4}" y="${avgY - 4}" text-anchor="end" font-size="9" fill="var(--green)">avg ${fmtTk(avgRate)}</text>`;

  el.innerHTML = `
  <div class="topbar"><div><div class="page-title">📈 Meal Rate History</div><div class="page-sub">Per-meal cost trend across months</div></div></div>
  <div class="content">
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        <div class="stat-card" style="flex:1;min-width:100px;padding:10px">
          <div class="stat-label">Months tracked</div>
          <div class="stat-value" style="font-size:22px">${rates.length}</div>
        </div>
        <div class="stat-card" style="flex:1;min-width:100px;padding:10px">
          <div class="stat-label">Average rate</div>
          <div class="stat-value" style="font-size:22px;color:var(--green)">${fmtTk(avgRate)}</div>
        </div>
        <div class="stat-card" style="flex:1;min-width:100px;padding:10px">
          <div class="stat-label">Highest rate</div>
          <div class="stat-value" style="font-size:22px;color:var(--red)">${fmtTk(Math.max(...rates.map(r => r.rate)))}</div>
        </div>
        <div class="stat-card" style="flex:1;min-width:100px;padding:10px">
          <div class="stat-label">Lowest rate</div>
          <div class="stat-value" style="font-size:22px;color:var(--blue)">${fmtTk(Math.min(...rates.filter(r => r.rate > 0).map(r => r.rate)))}</div>
        </div>
      </div>

      <!-- SVG bar chart — horizontally scrollable on mobile -->
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px">
        <svg viewBox="0 0 ${SVG_W} ${CHART_H + LABEL_H}" width="${SVG_W}" height="${CHART_H + LABEL_H}"
             style="display:block;min-width:${SVG_W}px;font-family:var(--font)">
          ${avgLine}
          ${bars}
        </svg>
      </div>
      <div style="display:flex;gap:14px;margin-top:8px;font-size:11px;color:var(--text3)">
        <span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:12px;height:3px;background:var(--accent);border-radius:2px"></span>Latest month</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:12px;height:3px;background:var(--blue);border-radius:2px;opacity:.7"></span>Previous months</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:12px;height:1px;border-top:2px dashed var(--green)"></span>Average</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title" style="margin-bottom:10px">Month-by-month breakdown</div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Month</th><th>Meals</th><th>Total Bazar</th><th>Meal Rate</th><th>vs Avg</th></tr></thead>
        <tbody>${rates.slice().reverse().map(r => {
          const diff = round2(r.rate - avgRate);
          const diffColor = diff > 0 ? "var(--red)" : diff < 0 ? "var(--green)" : "var(--text3)";
          const diffStr = diff > 0 ? `+${fmtTk(diff)}` : diff < 0 ? `-${fmtTk(Math.abs(diff))}` : "—";
          return `<tr>
            <td><b>${r.label}</b></td>
            <td>${r.meals}</td>
            <td style="color:var(--green)">${fmtTk(r.bazar)}</td>
            <td style="color:var(--accent);font-weight:700">${fmtTk(r.rate)}</td>
            <td style="color:${diffColor};font-size:12px">${diffStr}</td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════
   MONTHLY PDF/EXCEL REPORT EXPORT
═══════════════════════════════════════════ */
async function renderExport(el) {
  const { month, year } = thisMonth();
  el.innerHTML = `
  <div class="topbar"><div><div class="page-title">📥 Monthly Report</div><div class="page-sub">Export settlement data as text report</div></div></div>
  <div class="content">
    <div class="card" style="max-width:500px">
      <div class="card-title">Select month to export</div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <select class="input" id="exp-month" style="flex:1">${MONTHS.map((m, i) => `<option value="${i}" ${i===month?"selected":""}>${m}</option>`).join("")}</select>
        <select class="input" id="exp-year" style="width:90px">${[year-1,year,year+1].map(y => `<option value="${y}" ${y===year?"selected":""}>${y}</option>`).join("")}</select>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn btn-primary" onclick="doExportText()" style="flex:1;justify-content:center">📋 Copy Report</button>
      </div>
    </div>
  </div>`;
}

async function doExportText() {
  const month = parseInt(document.getElementById("exp-month")?.value);
  const year  = parseInt(document.getElementById("exp-year")?.value);
  const key = monthKey(year, month);
  const prevInfo = previousMonth(month, year);

  const [allMeals, allBazar, rentRec, utilRes, prevUtilRes] = await Promise.all([
    dbGetAll("meals"), dbGetAll("bazar"), dbGetMonth("rent", key),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle(),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", prevInfo.key).maybeSingle(),
  ]);

  const messName = currentMess?.name || "Mess";
  const lines = [];
  lines.push(`═══════════════════════════════════════`);
  lines.push(`${messName} — Monthly Report`);
  lines.push(`${MONTHS[month]} ${year}`);
  lines.push(`Generated: ${new Date().toLocaleString("en-IN")}`);
  lines.push(`═══════════════════════════════════════`);
  lines.push(``);

  // Summary
  let totalMeals = 0, totalBazar = 0;
  const mM = allMeals.filter(r => r.date.startsWith(key));
  const mB = allBazar.filter(r => r.date.startsWith(key));
  mM.forEach(r => { const mObj = r.meals || {}, ks = Object.keys(mObj), hasSplit = ks.some(k => k.endsWith("_day") || k.endsWith("_night")); if (hasSplit) ks.forEach(k => { if (k.endsWith("_day") || k.endsWith("_night")) totalMeals += Number(mObj[k]) || 0; }); else Object.values(mObj).forEach(v => { totalMeals += Number(v) || 0; }); });
  mB.forEach(r => Object.values(r.bazar || {}).forEach(v => { totalBazar += Number(v); }));
  const mealRate = totalMeals > 0 ? round2(totalBazar / totalMeals) : 0;

  lines.push(`SUMMARY`);
  lines.push(`───────────────────────────────────────`);
  lines.push(`Total Meals:  ${round2(totalMeals)}`);
  lines.push(`Total Bazar:  ${fmtTk(totalBazar)}`);
  lines.push(`Meal Rate:    ${fmtTk(mealRate)} per meal`);
  lines.push(`Members:      ${members.length}`);
  lines.push(`Days Logged:  ${mM.length}`);
  lines.push(``);

  // Per-member settlement
  lines.push(`PER-MEMBER SETTLEMENT`);
  lines.push(`───────────────────────────────────────`);
  const utilRec = utilRes.data;
  const prevUtilRec = prevUtilRes.data;
  members.forEach(m => {
    const c = calcMemberSettlement(m, allMeals, allBazar, rentRec, utilRec, prevUtilRec, key);
    const net = c.netPayable;
    lines.push(`${m.name}:`);
    lines.push(`  Meals: ${c.memberMeals} | Bazar: ${fmtTk(c.memberBazar)} | Meal cost: ${fmtTk(c.mealCost)}`);
    lines.push(`  Rent: ${fmtTk(c.roomRent)} | Utility: ${fmtTk(round2(c.prepaidUtility + c.postpaidUtility))}`);
    lines.push(`  Net: ${net > 0 ? "Pay " + fmtTk(net) : net < 0 ? "Get " + fmtTk(Math.abs(net)) : "Settled"}`);
    lines.push(``);
  });

  // Rent status
  if (rentRec?.entries?.length) {
    lines.push(`RENT STATUS`);
    lines.push(`───────────────────────────────────────`);
    rentRec.entries.forEach(e => {
      lines.push(`  ${e.name}: ${e.status} (${fmtTk(e.paid)}/${fmtTk(e.rent)})`);
    });
    lines.push(``);
  }

  lines.push(`— End of report —`);

  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    toast("Report copied to clipboard ✓", "success");
  } catch (e) {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Report copied ✓", "success"); }
    catch (_) { toast("Copy failed", "error"); }
    document.body.removeChild(ta);
  }
}
