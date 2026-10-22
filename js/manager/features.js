/* ═══════════════════════════════════════════════
   MANAGER — Features: absence calendar, broadcasts,
   mess rules, meal rate chart, month close
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   ABSENCE CALENDAR (loaded as tab inside Meal Entry)
═══════════════════════════════════════════ */
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

    // Fetch both attendance records AND meal entries — scoped to this month only
    const [{ data: attRows, error: attErr }, { data: mealRows, error: mealErr }] = await Promise.all([
      getClient().from("meal_attendance").select("*")
        .eq("mess_id", messId()).gte("date", startDate).lte("date", endDate),
      getClient().from("meals").select("*")
        .eq("mess_id", messId()).gte("date", startDate).lte("date", endDate),
    ]);
    if (attErr) throw attErr;
    if (mealErr) throw mealErr;

    // meal_attendance map: date → member_id → row
    const attMap = {}; // date → member_id → { day_meal, night_meal, source }
    (attRows || []).forEach(a => {
      if (!attMap[a.date]) attMap[a.date] = {};
      attMap[a.date][a.member_id] = { day_meal: a.day_meal, night_meal: a.night_meal, id: a.id, source: "toggle" };
    });

    // Track dates that have confirmed meal data (so we don't falsely say "All ate"
    // on days where nobody logged meals at all)
    const mealDataDates = new Set(); // dates where at least one member has a real meal entry

    // Merge 0-meal days from the meals table
    (mealRows || []).forEach(r => {
      const date = r.date;
      const mObj = r.meals || {};

      // Only process days where at least one member has ANY meals > 0
      const anyMeals = Object.values(mObj).some(v => Number(v) > 0);
      if (!anyMeals) return;

      // This date has confirmed meal data — mark it
      mealDataDates.add(date);

      if (!attMap[date]) attMap[date] = {};

      members.forEach(m => {
        // Explicit toggle takes priority
        if (attMap[date][m.id]) return;

        // Use the same helper used everywhere else — handles split/legacy/case/trim
        const parts = mealPartsFromObj(mObj, m.name);
        const ks = Object.keys(mObj);
        const hasSplit = ks.some(k => k.endsWith("_day") || k.endsWith("_night"));

        if (hasSplit) {
          if (parts.day === 0 && parts.night === 0) {
            attMap[date][m.id] = { day_meal: false, night_meal: false, source: "meal_zero" };
          } else if (parts.day === 0) {
            attMap[date][m.id] = { day_meal: false, night_meal: true,  source: "meal_zero" };
          } else if (parts.night === 0) {
            attMap[date][m.id] = { day_meal: true,  night_meal: false, source: "meal_zero" };
          }
          // both > 0 → present, no entry needed
        } else {
          // Legacy format: single total value
          if (parts.total === 0) {
            attMap[date][m.id] = { day_meal: false, night_meal: false, source: "meal_zero" };
          }
        }
      });
    });

    // Also mark dates that have explicit attendance toggles as having real data
    Object.keys(attMap).forEach(date => mealDataDates.add(date));

    // Build collision-aware initials map for this member list
    buildInitialsMap(members);
    const memIdx = {};
    members.forEach((m, i) => { memIdx[m.id] = i; }); // kept for legacy uses

    // Legend
    const legend = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;font-size:11px;align-items:center">
        <span style="font-weight:600;color:var(--text2);margin-right:2px">Legend:</span>
        <span style="display:flex;align-items:center;gap:5px;background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:3px 8px">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block"></span>
          <span style="color:var(--text2)">All ate</span>
        </span>
        <span style="display:flex;align-items:center;gap:5px;background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:3px 8px">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--red);display:inline-block"></span>
          <span style="color:var(--text2)">All meals off</span>
        </span>
        <span style="display:flex;align-items:center;gap:5px;background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:3px 8px">
          <span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;display:inline-block"></span>
          <span style="color:var(--text2)">Day off only</span>
        </span>
        <span style="display:flex;align-items:center;gap:5px;background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:3px 8px">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--accent);display:inline-block"></span>
          <span style="color:var(--text2)">Night off only</span>
        </span>
        <span style="display:flex;align-items:center;gap:5px;background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:3px 8px">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--bg3);border:1.5px dashed var(--text3);display:inline-block"></span>
          <span style="color:var(--text2)">From meal entry</span>
        </span>
        <span style="display:flex;align-items:center;gap:5px;background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:3px 8px">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--bg3);border:1.5px solid var(--border);display:inline-block"></span>
          <span style="color:var(--text3)">No data</span>
        </span>
      </div>`;

    // Day-of-week headers
    const dowHeaders = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
      .map(d => `<div style="text-align:center;font-size:10px;font-weight:700;color:var(--text3);padding:5px 0;text-transform:uppercase;letter-spacing:.5px">${d}</div>`)
      .join("");

    // Calendar cells
    const cells = [];

    // Empty cells before first day
    for (let i = 0; i < firstDow; i++) {
      cells.push(`<div></div>`);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${key}-${String(d).padStart(2, "0")}`;
      const isToday  = dateStr === todayStr;
      const isPast   = dateStr < todayStr;
      const isFuture = dateStr > todayStr;
      const dayMap   = attMap[dateStr] || {}; // member_id → { day_meal, night_meal, source }
      const hasData  = mealDataDates.has(dateStr); // confirmed meal data exists for this day

      // Categorise absences
      const allOff   = []; // { member, source }
      const dayOff   = [];
      const nightOff = [];

      members.forEach(m => {
        const a = dayMap[m.id];
        if (!a) return;
        const entry = { member: m, source: a.source };
        if (!a.day_meal && !a.night_meal) allOff.push(entry);
        else if (!a.day_meal &&  a.night_meal) dayOff.push(entry);
        else if ( a.day_meal && !a.night_meal) nightOff.push(entry);
      });

      const totalAbsent  = allOff.length + dayOff.length + nightOff.length;
      // Heat intensity: more absences → deeper red tint on cell background
      const heatOpacity  = totalAbsent > 0 ? Math.min(0.08 + (totalAbsent / members.length) * 0.18, 0.28) : 0;
      const heatStyle    = totalAbsent > 0 ? `background:rgba(239,68,68,${heatOpacity});` : "";

      // Cell state styling
      let cellBg, cellBorder, cellExtraStyle = "";
      if (isToday) {
        cellBg = "var(--accent-bg)";
        cellBorder = "2px solid var(--accent)";
      } else if (totalAbsent > 0) {
        cellBg = `var(--bg2)`;
        cellBorder = "1px solid rgba(239,68,68,0.35)";
        cellExtraStyle = heatStyle;
      } else if (isPast && hasData) {
        cellBg = "var(--bg2)";
        cellBorder = "1px solid rgba(34,197,94,0.3)";
        cellExtraStyle = "background:rgba(34,197,94,0.05);";
      } else {
        cellBg = "var(--bg2)";
        cellBorder = "1px solid var(--border)";
      }

      const dayNumColor = isToday ? "var(--accent)" : isPast ? "var(--text3)" : "var(--text)";

      function avatarDot(entry, borderColor, bgTint) {
        const m = entry.member;
        const col = avatarCol(m.id); // hash on member ID for stable colors
        const borderStyle = entry.source === "meal_zero" ? "dashed" : "solid";
        const label = avFace(m.id, m.name); // photo, else collision-aware initials
        return `<div title="${escapeHtml(m.name)}${entry.source === "meal_zero" ? " (from meal entry)" : " (marked absent)"}"
          style="width:24px;height:24px;border-radius:50%;background:${col.bg};color:${col.fg};
                 display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;
                 border:2px ${borderStyle} ${borderColor};flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,.15)">${label}</div>`;
      }

      // Status indicator bar at top of cell
      let statusBar = "";
      if (totalAbsent > 0) {
        const absentPct = Math.round((totalAbsent / members.length) * 100);
        statusBar = `<div style="height:3px;border-radius:2px;margin:-1px -1px 4px -1px;background:linear-gradient(90deg,
          rgba(239,68,68,.8) ${absentPct}%, rgba(34,197,94,.4) ${absentPct}%)"></div>`;
      } else if (isPast && hasData) {
        statusBar = `<div style="height:3px;border-radius:2px;margin:-1px -1px 4px -1px;background:rgba(34,197,94,.6)"></div>`;
      }

      // Content area: absence avatars OR status text
      let content;
      if (totalAbsent > 0) {
        // Group rows by type with tiny section labels
        const sections = [];
        if (allOff.length)   sections.push(`<div style="display:flex;flex-wrap:wrap;gap:2px">${allOff.map(e   => avatarDot(e, "var(--red)",     "#fef2f2")).join("")}</div>`);
        if (dayOff.length)   sections.push(`<div style="display:flex;flex-wrap:wrap;gap:2px">${dayOff.map(e   => avatarDot(e, "#f59e0b", "#fffbeb")).join("")}</div>`);
        if (nightOff.length) sections.push(`<div style="display:flex;flex-wrap:wrap;gap:2px">${nightOff.map(e => avatarDot(e, "var(--accent)", "#f0f9ff")).join("")}</div>`);
        content = `<div style="display:flex;flex-direction:column;gap:2px;margin-top:3px">${sections.join("")}</div>`;
      } else if (isPast && hasData) {
        // ✅ Only show "All ate" when we KNOW there was real meal data for this day
        content = `<div style="display:flex;align-items:center;gap:3px;margin-top:5px">
          <span style="width:14px;height:14px;border-radius:50%;background:rgba(34,197,94,.15);border:1.5px solid var(--green);display:flex;align-items:center;justify-content:center;font-size:8px;flex-shrink:0">✓</span>
          <span style="font-size:9px;color:var(--green);font-weight:600">All ate</span>
        </div>`;
      } else if (isPast && !hasData) {
        // Past day with no meal data logged at all — show "No data", NOT "All ate"
        content = `<div style="font-size:9px;color:var(--text3);margin-top:5px;opacity:.6;font-style:italic">No data</div>`;
      } else if (isToday) {
        content = `<div style="font-size:9px;color:var(--accent);margin-top:5px;font-weight:600">Today</div>`;
      } else {
        content = `<div style="font-size:9px;color:var(--text3);margin-top:5px;opacity:.4">—</div>`;
      }

      // Absence count badge (shown when there are absences)
      const badge = totalAbsent > 0
        ? `<div style="position:absolute;top:4px;right:4px;background:var(--red);color:#fff;border-radius:10px;font-size:8px;font-weight:700;padding:1px 5px;line-height:14px">${totalAbsent}</div>`
        : "";

      cells.push(`
        <div class="att-cal-cell" style="position:relative;${cellExtraStyle}border:${cellBorder};border-radius:8px;padding:5px 5px 5px;min-height:82px;cursor:default;transition:border-color .15s,box-shadow .15s;overflow:hidden"
             onmouseover="this.style.borderColor='var(--accent)';this.style.boxShadow='0 2px 8px rgba(0,0,0,.12)'"
             onmouseout="this.style.borderColor='${isToday ? "var(--accent)" : totalAbsent > 0 ? "rgba(239,68,68,.35)" : isPast && hasData ? "rgba(34,197,94,.3)" : "var(--border)"}';this.style.boxShadow='none'">
          ${statusBar}
          <div style="font-size:11px;font-weight:700;color:${dayNumColor};line-height:1">${d}</div>
          ${badge}
          ${content}
        </div>`);
    }

    // Total absence records across whole month
    let totalAbsenceDays = 0;
    Object.values(attMap).forEach(dayMap => {
      Object.values(dayMap).forEach(a => {
        if (!a.day_meal || !a.night_meal) totalAbsenceDays++;
      });
    });

    // Days with confirmed meal data
    const confirmedDays = mealDataDates.size;
    // Days where all members ate (has data, zero absences)
    let allAteDays = 0;
    mealDataDates.forEach(date => {
      const dayMap = attMap[date] || {};
      const hasAbsence = Object.values(dayMap).some(a => !a.day_meal || !a.night_meal);
      if (!hasAbsence) allAteDays++;
    });
    const attendancePct = confirmedDays > 0
      ? Math.round((allAteDays / confirmedDays) * 100)
      : null;

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
            <div class="stat-label">Days logged</div>
            <div class="stat-value" style="font-size:20px;margin-top:4px">${confirmedDays}<span style="font-size:12px;color:var(--text3);font-weight:400">/${daysInMonth}</span></div>
          </div>
          ${attendancePct !== null ? `
          <div class="stat-card" style="flex:1;min-width:90px;padding:10px">
            <div class="stat-label">Full attendance</div>
            <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
              <div class="stat-value" style="font-size:20px;color:${attendancePct >= 80 ? "var(--green)" : attendancePct >= 50 ? "#f59e0b" : "var(--red)"}">${attendancePct}%</div>
              <div style="height:4px;border-radius:2px;background:var(--border);overflow:hidden">
                <div style="height:100%;width:${attendancePct}%;background:${attendancePct >= 80 ? "var(--green)" : attendancePct >= 50 ? "#f59e0b" : "var(--red)"};border-radius:2px;transition:width .4s"></div>
              </div>
            </div>
          </div>` : ""}
        </div>

        ${legend}

        <div class="att-cal-scroll">
          <div class="att-cal-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">
            ${dowHeaders}
            ${cells.join("")}
          </div>
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
              const col = avatarCol(m.id);
              const allOffDays   = mEntries.filter(a => !a.day_meal && !a.night_meal).length;
              const dayOffDays   = mEntries.filter(a => !a.day_meal &&  a.night_meal).length;
              const nightOffDays = mEntries.filter(a =>  a.day_meal && !a.night_meal).length;
              return `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;display:flex;align-items:flex-start;gap:8px">
                <div style="width:28px;height:28px;border-radius:50%;background:${col.bg};color:${col.fg};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0">${avFace(m.id, m.name)}</div>
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

/* Upcoming days off (member Meal Log). Shared by the first render and every refresh. */
function buildUpcomingAbsences(upcoming) {
  if (!upcoming.length) return `<div class="ma-none">No days off planned — you're eating every meal 🍽️</div>`;
  const nice = d => { const [y, m, dd] = String(d).split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); };
  return upcoming.map(a => {
    const off = !a.day_meal && !a.night_meal ? "All day" : !a.day_meal ? "☀ Day" : "🌙 Night";
    return `<div class="ma-row">
      <span class="ma-date">${nice(a.date)}</span>
      <span class="badge badge-red">${off} off</span>
      <button class="btn btn-ghost btn-sm" onclick="cancelAbsence('${a.id}')" title="Cancel this day off">✕</button>
    </div>`;
  }).join("");
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
    wrap.innerHTML = buildUpcomingAbsences(upcoming);
  } catch (e) { console.warn("Refresh absences failed:", e); }
}


/* ═══════════════════════════════════════════
   BROADCASTS (Manager) — with ⑪ Pin to top
═══════════════════════════════════════════ */
async function renderBroadcasts(el) { await renderMessages(el, true); }


function openBroadcastModal() {
  document.getElementById("modal-content").innerHTML = `
    <div class="modal-title">📢 New Broadcast</div>
    <div class="modal-sub">This message will appear as a banner on every member's dashboard.</div>
    <div class="field"><label>Message *</label><textarea class="input" id="bc-msg" rows="3" placeholder="e.g. Pay rent by Friday!"></textarea></div>
    <div class="grid-2">
      <div class="field"><label>Priority</label><select class="input" id="bc-priority"><option value="normal">Normal</option><option value="urgent">🔴 Urgent</option></select></div>
      <div class="field"><label>Auto-expire after</label><select class="input" id="bc-expiry"><option value="">Never</option><option value="6">6 hours</option><option value="12">12 hours</option><option value="24">1 day</option><option value="72">3 days</option><option value="168">1 week</option></select></div>
    </div>
    <div class="field"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="bc-pin" style="width:16px;height:16px"> 📌 Pin to top (always visible first)</label></div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="sendBroadcast()">📢 Send</button></div>`;
  openModal();
}

async function sendBroadcast() {
  const msg = document.getElementById("bc-msg")?.value?.trim();
  if (!msg) { toast("Message is required"); return; }
  const priority = document.getElementById("bc-priority")?.value || "normal";
  const expHours = document.getElementById("bc-expiry")?.value || null;
  const pinned   = document.getElementById("bc-pin")?.checked || false;
  try {
    const { error } = await getClient().from("broadcasts").insert({
      mess_id: messId(), message: msg, priority, pinned,
      author: currentUser?.name || "Manager",
      expires_at: expHours ? new Date(Date.now() + parseInt(expHours)*3600000).toISOString() : null,
    });
    if (error) throw error;
    await logAudit("create", "broadcast", "", `Broadcast${pinned?" (pinned)":""}: "${msg.slice(0,50)}${msg.length>50?"…":""}"`, { priority, pinned });
    closeModal(); toast("Broadcast sent ✓", "success");
    await loadBroadcastList();
  } catch (e) { toast("Error: " + e.message, "error"); }
}




/* ═══════════════════════════════════════════
   MESS RULES — Markdown editor + live preview
═══════════════════════════════════════════ */
/* Small, safe Markdown → HTML for mess rules: # headings, - lists, **bold**, *italic*,
   paragraphs. Escapes first, works line by line, so lists stay one <ul>. */
function renderMarkdown(text) {
  if (!text) return "";
  const esc = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>");
  const out = []; let para = [], list = false;
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join("<br>"))}</p>`); para = []; } };
  const close = () => { if (list) { out.push("</ul>"); list = false; } };
  esc.split(/\r?\n/).forEach(line => {
    let m;
    if ((m = /^(#{1,3})\s+(.+)$/.exec(line))) { flush(); close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = /^\s*[-*•]\s+(.+)$/.exec(line))) { flush(); if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (!line.trim()) { flush(); close(); }
    else { close(); para.push(line); }
  });
  flush(); close();
  return out.join("");
}

async function renderMessRules(el, isManager) {
  const rules = await dbGetMessRules();
  if (isManager) {
    el.innerHTML = `
    <div class="topbar"><div><div class="page-title">Mess Rules & Info</div><div class="page-sub">What members see on their Mess Info page</div></div>
      <div class="topbar-actions"><button class="btn btn-primary btn-sm" id="mr-save" onclick="saveMessRules()">💾 Save</button></div>
    </div>
    <div class="content dk">
      <div class="mr-grid">
        <div class="card mr-info">
          <div class="dk-card-title"><span>Quick info</span></div>
          <div class="field">
            <label>📶 WiFi password</label>
            <input type="text" class="input mr-mono" id="mr-wifi" value="${escapeHtml(rules?.wifi_pass||"")}" placeholder="e.g. MyWiFi@123" oninput="markRulesDirty()"/>
          </div>
          <div class="field">
            <label>💳 Payment info</label>
            <textarea class="input" id="mr-bank" rows="3" placeholder="e.g. bKash: 01712345678 (Personal)" oninput="markRulesDirty()">${escapeHtml(rules?.bank_info||"")}</textarea>
          </div>
          <div class="field" style="margin-bottom:0">
            <label>📞 Emergency contacts</label>
            <textarea class="input" id="mr-contacts" rows="3" placeholder="e.g. Landlord: 017xxx&#10;Gas: 016xxx" oninput="markRulesDirty()">${escapeHtml(rules?.contacts||"")}</textarea>
          </div>
        </div>

        <div class="card mr-rules">
          <div class="dk-card-title">
            <span>📜 House rules</span>
            <div class="an-seg" id="mr-tabs">
              <button class="an-seg-btn on" data-tab="write" onclick="setRulesTab('write')">Write</button>
              <button class="an-seg-btn" data-tab="preview" onclick="setRulesTab('preview')">Preview</button>
            </div>
          </div>
          <div id="mr-pane-write">
            <div class="mr-tools">
              <button class="ml-chip" onclick="insertMd('**','**')" title="Bold"><b>B</b></button>
              <button class="ml-chip" onclick="insertMd('*','*')" title="Italic"><i>I</i></button>
              <button class="ml-chip" onclick="insertMd('## ','')" title="Heading">Heading</button>
              <button class="ml-chip" onclick="insertMd('- ','')" title="Bullet">• List</button>
              <span class="mr-hint">**bold** · *italic* · ## heading · - list</span>
            </div>
            <textarea class="input mr-mono" id="mr-rules" rows="14" placeholder="## House rules&#10;&#10;- No guests after 11pm&#10;- Clean dishes right away&#10;- **Rent by the 5th of every month**" oninput="updateRulesPreview();markRulesDirty()">${escapeHtml(rules?.rules_text||"")}</textarea>
          </div>
          <div id="mr-pane-preview" style="display:none">
            <div id="mr-preview" class="md-body">${renderMarkdown(rules?.rules_text||"") || '<span style="color:var(--text3)">Nothing written yet.</span>'}</div>
          </div>
        </div>
      </div>
    </div>`;
  } else {
    const hasAny = rules && (rules.wifi_pass || rules.bank_info || rules.rules_text || rules.contacts);
    const info = (icon, title, body, extra = "") => `<div class="card mi-card"><div class="dk-card-title"><span>${icon} ${title}</span>${extra}</div>${body}</div>`;
    el.innerHTML = `
    <div class="topbar"><div><div class="page-title">Mess Info</div><div class="page-sub">WiFi, how to pay, contacts and the house rules</div></div></div>
    <div class="content dk">${hasAny ? `
      <div class="mi-grid">
        ${rules.wifi_pass ? info("📶", "WiFi", `<div class="mi-wifi" id="mi-wifi">${escapeHtml(rules.wifi_pass)}</div>`, `<button class="btn btn-ghost btn-sm" onclick="copyMessWifi(this)">Copy</button>`) : ""}
        ${rules.bank_info ? info("💳", "How to pay", `<div class="mi-text">${escapeHtml(rules.bank_info)}</div>`, `<button class="btn btn-ghost btn-sm" onclick="navigate('give-payment')">Give payment</button>`) : ""}
        ${rules.contacts ? info("📞", "Contacts", `<div class="mi-text">${escapeHtml(rules.contacts)}</div>`) : ""}
      </div>
      ${rules.rules_text ? info("📜", "House rules", `<div class="md-body">${renderMarkdown(rules.rules_text)}</div>`) : ""}
    ` : '<div class="card"><div class="empty" style="padding:28px"><div>📌</div><div>The manager hasn\'t added any mess info yet.</div></div></div>'}</div>`;
  }
}

function setRulesTab(tab) {
  ["write", "preview"].forEach(t => { const p = document.getElementById("mr-pane-" + t); if (p) p.style.display = t === tab ? "" : "none"; });
  document.querySelectorAll("#mr-tabs .an-seg-btn").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  if (tab === "preview") updateRulesPreview();
}
function markRulesDirty() {
  const b = document.getElementById("mr-save");
  if (b && !b.classList.contains("mr-dirty")) { b.classList.add("mr-dirty"); b.innerHTML = "💾 Save changes"; }
}
async function copyMessWifi(btn) {
  const t = document.getElementById("mi-wifi")?.textContent || "";
  try { await navigator.clipboard.writeText(t); if (btn) { btn.textContent = "✓ Copied"; setTimeout(() => btn.textContent = "Copy", 1500); } }
  catch (_) { toast("Copy failed — press and hold to copy", "error"); }
}

function updateRulesPreview() {
  const text = document.getElementById("mr-rules")?.value || "";
  const preview = document.getElementById("mr-preview");
  if (preview) preview.innerHTML = renderMarkdown(text) || '<span style="color:var(--text3)">Nothing written yet.</span>';
}

function insertMd(before, after) {
  const ta = document.getElementById("mr-rules"); if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e) || "text";
  ta.value = ta.value.slice(0,s) + before + sel + after + ta.value.slice(e);
  ta.selectionStart = s + before.length;
  ta.selectionEnd   = s + before.length + sel.length;
  ta.focus(); updateRulesPreview();
}

async function saveMessRules() {
  if (!requireManager("saveMessRules")) return;
  try {
    await dbSaveMessRules({
      wifi_pass:  document.getElementById("mr-wifi")?.value    || "",
      bank_info:  document.getElementById("mr-bank")?.value    || "",
      rules_text: document.getElementById("mr-rules")?.value   || "",
      contacts:   document.getElementById("mr-contacts")?.value || "",
    });
    await logAudit("update", "mess_rules", "", "Updated mess rules & info");
    toast("Mess info saved ✓", "success");
    const b = document.getElementById("mr-save");
    if (b) { b.classList.remove("mr-dirty"); b.innerHTML = "💾 Save"; }
  } catch (e) { toast("Error: " + e.message, "error"); }
}


/* ═══════════════════════════════════════════
   ANALYTICS (nav: "Analytics", route #/app/rate-chart)
   Monthly meal rate, bazar (with this month's projection), member bazar vs
   meal cost, weekday pattern and a month table. Charts are drawn at the
   container's real pixel width so text stays readable on phones, and are
   redrawn on resize. Styles: .an-* in css/05-components.css.
═══════════════════════════════════════════ */
let _anRange = 12;      // months shown: 6 | 12 | 0 (= all)
let _anData  = null;    // last loaded rows, for range switches / resize
let _anResizeT = null;

async function renderMealRateChart(el) {
  el.innerHTML = `<div class="topbar"><div><div class="page-title">Analytics</div><div class="page-sub">Loading…</div></div></div>
    <div class="content"><div class="loading"><div class="spinner"></div></div></div>`;
  const [allMeals, allBazar] = await Promise.all([historyRows("meals", true), historyRows("bazar", true)]);
  _anData = { el, allMeals, allBazar };
  drawAnalytics();
  window.removeEventListener("resize", _anOnResize);
  window.addEventListener("resize", _anOnResize, { passive: true });
}

function _anOnResize() {
  clearTimeout(_anResizeT);
  _anResizeT = setTimeout(() => {
    if (!_anData || !_anData.el.isConnected) { window.removeEventListener("resize", _anOnResize); return; }
    _anDrawCharts();
  }, 150);
}

function setAnalyticsRange(n) { _anRange = n; drawAnalytics(); }

function _anMonths() {
  const { allMeals, allBazar } = _anData;
  const by = {};
  const get = k => by[k] || (by[k] = { key: k, meals: 0, bazar: 0, days: new Set(), memMeals: {}, memBazar: {} });
  allMeals.forEach(r => {
    const k = String(r.date || "").slice(0, 7); if (!/^\d{4}-\d{2}$/.test(k)) return;
    const g = get(k); let t = 0;
    members.forEach(m => { const v = mealMemberTotal(r.meals || {}, m.name); g.memMeals[m.name] = (g.memMeals[m.name] || 0) + v; t += v; });
    g.meals += t; if (t > 0) g.days.add(r.date);
  });
  allBazar.forEach(r => {
    const k = String(r.date || "").slice(0, 7); if (!/^\d{4}-\d{2}$/.test(k)) return;
    const g = get(k);
    Object.entries(r.bazar || {}).forEach(([n, v]) => { g.memBazar[n] = (g.memBazar[n] || 0) + (Number(v) || 0); g.bazar += Number(v) || 0; });
  });
  const keys = Object.keys(by).sort();
  const cur = monthKey(new Date().getFullYear(), new Date().getMonth());
  return (_anRange ? keys.slice(-_anRange) : keys).map(k => {
    const g = by[k], [y, mm] = k.split("-").map(Number);
    const dim = new Date(y, mm, 0).getDate();
    const isCur = k === cur, gone = isCur ? Math.min(new Date().getDate(), dim) : dim;
    return {
      ...g, dim, isCur, gone,
      label: MONTHS[mm - 1].slice(0, 3) + (keys.length > 12 || _anRange === 0 ? " '" + String(y).slice(2) : ""),
      long:  MONTHS[mm - 1] + " " + y,
      rate:  g.meals > 0 ? round2(g.bazar / g.meals) : 0,
      perDay: g.days.size ? round2(g.meals / g.days.size) : 0,
      proj:  isCur && gone < dim && gone > 0 ? round2((g.bazar / gone) * dim) : null,
    };
  });
}

function drawAnalytics() {
  const { el } = _anData;
  const months = _anMonths();
  _anData.months = months;
  const seg = [[6, "6 months"], [12, "12 months"], [0, "All"]]
    .map(([n, t]) => `<button class="an-seg-btn${_anRange === n ? " on" : ""}" onclick="setAnalyticsRange(${n})">${t}</button>`).join("");
  const head = `<div class="topbar">
      <div><div class="page-title">Analytics</div>
        <div class="page-sub">${months.length ? `${months[0].long} – ${months[months.length - 1].long} · ${members.length} members` : "No data yet"}</div></div>
      <div class="topbar-actions"><div class="an-seg">${seg}</div></div>
    </div>`;

  if (!months.length || months.every(m => !m.meals && !m.bazar)) {
    el.innerHTML = head + `<div class="content"><div class="card"><div class="empty" style="padding:32px">No meals or bazar yet — analytics appear once you start logging.</div></div></div>`;
    return;
  }

  const cur = months[months.length - 1], prev = months[months.length - 2];
  const rated = months.filter(m => m.rate > 0);
  const avgRate = rated.length ? round2(rated.reduce((s, m) => s + m.rate, 0) / rated.length) : 0;
  const lo = rated.reduce((a, m) => (!a || m.rate < a.rate ? m : a), null);
  const hi = rated.reduce((a, m) => (!a || m.rate > a.rate ? m : a), null);
  const full = months.filter(m => !m.isCur && m.bazar > 0);
  const avgBazar = full.length ? round2(full.reduce((s, m) => s + m.bazar, 0) / full.length) : 0;
  const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
  const tr = (p, goodDown, vs) => p == null ? `<span class="dk-trend">no earlier data</span>`
    : !p ? `<span class="dk-trend">→ same as ${vs}</span>`
    : `<span class="dk-trend ${goodDown == null ? "" : (p < 0) === goodDown ? "dk-good" : "dk-bad"}">${p > 0 ? "↑" : "↓"} ${Math.abs(p)}% vs ${vs}</span>`;
  const kpi = (cls, icon, label, value, sub, graphic) => `
    <div class="dk-card ${cls}">
      <div class="dk-head"><span class="dk-ico">${icon}</span><span class="dk-label">${label}</span></div>
      <div class="stat-value dk-value">${value}</div>
      <div class="dk-sub">${sub}</div>${graphic}
    </div>`;
  const projBazar = cur.proj ?? cur.bazar;

  // Members (current month): bazar given vs meal cost at this month's rate
  const memRows = members.map((m, i) => {
    const meals = round2(cur.memMeals[m.name] || 0), bz = round2(cur.memBazar[m.name] || 0);
    const cost = round2(meals * cur.rate);
    return { m, i, meals, bz, cost, net: round2(bz - cost) };
  });
  const memMax = Math.max(1, ...memRows.map(r => Math.max(r.bz, r.cost)));

  // Weekday pattern over the range (Sat-first)
  const wdSum = Array(7).fill(0), wdN = Array(7).fill(0);
  const inRange = new Set(months.map(m => m.key));
  _anData.allMeals.forEach(r => {
    if (!inRange.has(String(r.date).slice(0, 7))) return;
    const t = members.reduce((s, m) => s + mealMemberTotal(r.meals || {}, m.name), 0);
    if (!t) return;
    const [y, mo, d] = String(r.date).split("-").map(Number);
    const wd = (new Date(y, mo - 1, d).getDay() + 1) % 7;
    wdSum[wd] += t; wdN[wd]++;
  });
  const wdAvg = wdSum.map((s, i) => (wdN[i] ? round2(s / wdN[i]) : 0));
  const wdMax = Math.max(1, ...wdAvg), wdTop = wdAvg.indexOf(Math.max(...wdAvg));
  const WD = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

  el.innerHTML = head + `
  <div class="content dk an">
    <div class="stat-grid dk-kpis">
      ${kpi("dk-blue", "📊", "Meal rate · " + MONTHS[Number(cur.key.slice(5)) - 1].slice(0, 3), fmtTk(cur.rate),
          `${tr(pct(cur.rate, avgRate), true, "avg " + fmtTk(avgRate))}`, buildSparkline(months.map(m => m.rate), "var(--blue)", { fit: true }))}
      ${kpi("dk-green", "🛒", cur.proj != null ? "Bazar · projected" : "Bazar this month", fmtTk(projBazar),
          cur.proj != null ? `${fmtTk(round2(cur.bazar))} so far · ${tr(pct(projBazar, prev?.bazar), null, prev ? prev.label : "")}` : tr(pct(cur.bazar, prev?.bazar), null, prev ? prev.label : ""),
          buildSparkline(months.map(m => m.proj ?? m.bazar), "var(--green)"))}
      ${kpi("dk-gold", "🍽️", "Meals per day", cur.perDay, `${round2(cur.meals)} meals · ${tr(pct(cur.perDay, prev?.perDay), null, prev ? prev.label : "")}`,
          buildSparkline(months.map(m => m.perDay), "var(--accent)", { fit: true }))}
      ${kpi("dk-gray", "🏷️", "Cheapest month", lo ? fmtTk(lo.rate) : "—",
          lo && hi ? `${lo.label} · priciest ${hi.label} ${fmtTk(hi.rate)}` : "",
          `<div class="an-range"><i style="left:${hi && lo && hi.rate > lo.rate ? Math.round(((cur.rate - lo.rate) / (hi.rate - lo.rate)) * 100) : 50}%" title="This month"></i></div>`)}
    </div>

    <div class="card">
      <div class="dk-card-title"><span>Meal rate per month</span><span class="dk-legend"><i class="an-key" style="background:var(--blue)"></i> rate <i class="an-key an-key-dash"></i> average ${fmtTk(avgRate)}</span></div>
      <div class="an-chart" id="an-rate"></div>
    </div>

    <div class="dk-row">
      <div class="card">
        <div class="dk-card-title"><span>Bazar per month</span><span class="dk-legend">${cur.proj != null ? `<i class="an-key an-key-ghost"></i> projected` : ""}${avgBazar ? ` · avg ${fmtTk(avgBazar)}` : ""}</span></div>
        <div class="an-chart" id="an-bazar"></div>
      </div>
      <div class="card">
        <div class="dk-card-title"><span>Meals by weekday</span><span class="dk-legend">busiest: ${WD[wdTop]}</span></div>
        <div class="an-wd">
          ${wdAvg.map((v, i) => `<div class="an-wd-col${i === wdTop ? " top" : ""}" title="${WD[i]}: ${v} meals on average">
            <b>${v || "—"}</b><div class="an-wd-bar"><i style="height:${Math.round((v / wdMax) * 100)}%"></i></div><span>${WD[i]}</span></div>`).join("")}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="dk-card-title"><span>Bazar vs meal cost · ${cur.long}</span><span class="dk-legend"><i class="an-key" style="background:var(--green)"></i> bazar given <i class="an-key" style="background:var(--accent)"></i> meal cost at ${fmtTk(cur.rate)}</span></div>
      <div class="an-mem">
        ${memRows.map(r => {
          const col = avatarCol(r.i);
          return `<div class="an-mem-row">
            <div class="dk-who"><span class="dk-av" style="background:${col.bg};color:${col.fg}">${avFace(r.m.id, r.m.name)}</span><span class="an-mem-name">${escapeHtml(r.m.name)}</span></div>
            <div class="an-mem-bars">
              <div class="dk-bar"><i style="width:${Math.round((r.bz / memMax) * 100)}%;background:var(--green)"></i></div>
              <div class="dk-bar"><i style="width:${Math.round((r.cost / memMax) * 100)}%;background:var(--accent)"></i></div>
            </div>
            <div class="an-mem-vals"><span style="color:var(--green)">${fmtTk(r.bz)}</span><span style="color:var(--accent)">${fmtTk(r.cost)}</span></div>
            <span class="badge ${Math.abs(r.net) < 0.01 ? "" : r.net > 0 ? "badge-green" : "badge-red"} an-mem-net">${Math.abs(r.net) < 0.01 ? "Even" : (r.net > 0 ? "Gets " : "Owes ") + fmtTk(Math.abs(r.net))}</span>
          </div>`;
        }).join("")}
      </div>
    </div>

    <div class="card">
      <div class="dk-card-title"><span>Month by month</span></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Month</th><th>Meals</th><th>Per day</th><th>Bazar</th><th>Meal rate</th><th>vs avg</th></tr></thead>
        <tbody>${months.slice().reverse().map(m => {
          const d = round2(m.rate - avgRate);
          return `<tr><td><b>${m.long}</b>${m.isCur ? ` <span class="badge badge-amber">so far</span>` : ""}</td><td>${round2(m.meals)}</td><td>${m.perDay}</td>
            <td style="color:var(--green)">${fmtTk(round2(m.bazar))}${m.proj != null ? `<div class="dk-mini">→ ${fmtTk(m.proj)} projected</div>` : ""}</td>
            <td style="color:var(--blue);font-weight:700">${m.rate ? fmtTk(m.rate) : "—"}</td>
            <td style="color:${!m.rate ? "var(--text3)" : d > 0 ? "var(--red)" : d < 0 ? "var(--green)" : "var(--text3)"}">${!m.rate || !d ? "—" : (d > 0 ? "+" : "−") + fmtTk(Math.abs(d))}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>
  </div>`;
  _anData.avgRate = avgRate;
  _anDrawCharts();
}

/* SVG charts at real pixel width (1 unit = 1px). */
function _anDrawCharts() {
  const { months, avgRate } = _anData;
  const rateBox = document.getElementById("an-rate"), bzBox = document.getElementById("an-bazar");
  if (rateBox) rateBox.innerHTML = _anLineChart(rateBox.clientWidth, months, avgRate);
  if (bzBox)   bzBox.innerHTML   = _anBarChart(bzBox.clientWidth, months);
}

function _anTicks(lo, hi, n) {
  const span = hi - lo || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(round2(v));
  return out;
}
const _anShortTk = v => v >= 100000 ? "৳" + round2(v / 100000) + "L" : v >= 1000 ? "৳" + round2(v / 1000) + "k" : "৳" + round2(v);

function _anLineChart(w, months, avg) {
  w = Math.max(w, 260);
  const H = 210, L = 46, R = 14, T = 22, B = 26, pw = w - L - R, ph = H - T - B;
  const pts = months.filter(m => m.rate > 0);
  if (!pts.length) return `<div class="empty">No meal rate yet</div>`;
  const vals = pts.map(m => m.rate).concat(avg || []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.25, hi * 0.03, 1);
  lo = Math.max(0, lo - pad); hi = hi + pad;
  const x = i => L + (pts.length === 1 ? pw / 2 : (i / (pts.length - 1)) * pw);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * ph;
  const ticks = _anTicks(lo, hi, 4);
  const line = pts.map((m, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(m.rate).toFixed(1)).join(" ");
  const every = Math.max(1, Math.ceil((pts.length * 44) / pw));
  const showVal = (i) => pts.length <= Math.floor(pw / 56) || i === pts.length - 1 || pts[i] === pts.reduce((a, m) => m.rate > a.rate ? m : a) || pts[i] === pts.reduce((a, m) => m.rate < a.rate ? m : a);
  return `<svg class="an-svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="Meal rate per month">
    ${ticks.map(t => `<line class="an-grid" x1="${L}" x2="${w - R}" y1="${y(t)}" y2="${y(t)}"/><text class="an-ax" x="${L - 8}" y="${y(t) + 3.5}" text-anchor="end">${_anShortTk(t)}</text>`).join("")}
    ${avg ? `<line class="an-avg" x1="${L}" x2="${w - R}" y1="${y(avg)}" y2="${y(avg)}"/>` : ""}
    <path class="an-area" d="${line} L${x(pts.length - 1)} ${T + ph} L${x(0)} ${T + ph} Z" fill="var(--blue)"/>
    <path class="an-line" d="${line}" stroke="var(--blue)" pathLength="1"/>
    ${pts.map((m, i) => `<g class="an-pt" style="--d:${(0.5 + (i / pts.length) * 1.1).toFixed(2)}s">
      <circle cx="${x(i)}" cy="${y(m.rate)}" r="${m.isCur ? 5 : 4}" class="${m.isCur ? "an-dot-cur" : "an-dot"}"><title>${m.long}: ${fmtTk(m.rate)}/meal${m.isCur ? " (so far)" : ""}</title></circle>
      ${showVal(i) ? `<text class="an-val" x="${x(i)}" y="${y(m.rate) - 10}" text-anchor="${i === 0 && pts.length > 1 ? "start" : i === pts.length - 1 && pts.length > 1 ? "end" : "middle"}">${fmtTk(m.rate)}${m.isCur ? " so far" : ""}</text>` : ""}
    </g>`).join("")}
    ${pts.map((m, i) => i % every && i !== pts.length - 1 ? "" : `<text class="an-ax" x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 && pts.length > 1 ? "start" : i === pts.length - 1 && pts.length > 1 ? "end" : "middle"}">${m.label}</text>`).join("")}
  </svg>`;
}

function _anBarChart(w, months) {
  w = Math.max(w, 240);
  const H = 210, L = 44, R = 8, T = 18, B = 26, pw = w - L - R, ph = H - T - B;
  const max = Math.max(1, ...months.map(m => Math.max(m.bazar, m.proj || 0))) * 1.08;
  const ticks = _anTicks(0, max, 4);
  const slot = pw / months.length, bw = Math.min(34, slot * 0.62);
  const y = v => T + (1 - v / max) * ph;
  const every = Math.max(1, Math.ceil((months.length * 40) / pw));
  return `<svg class="an-svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="Bazar per month">
    ${ticks.map(t => `<line class="an-grid" x1="${L}" x2="${w - R}" y1="${y(t)}" y2="${y(t)}"/><text class="an-ax" x="${L - 8}" y="${y(t) + 3.5}" text-anchor="end">${_anShortTk(t)}</text>`).join("")}
    ${months.map((m, i) => {
      const cx = L + slot * i + slot / 2, x0 = cx - bw / 2;
      return `<g style="--d:${(0.15 + i * 0.05).toFixed(2)}s">
        ${m.proj != null ? `<rect class="an-ghost" x="${x0}" y="${y(m.proj)}" width="${bw}" height="${y(0) - y(m.proj)}" rx="4"><title>${m.long}: projected ${fmtTk(m.proj)}</title></rect>` : ""}
        <rect class="an-bar${m.isCur ? " cur" : ""}" x="${x0}" y="${y(m.bazar)}" width="${bw}" height="${Math.max(0, y(0) - y(m.bazar))}" rx="4"><title>${m.long}: ${fmtTk(round2(m.bazar))}${m.isCur ? " so far" : ""}</title></rect>
        ${i % every && i !== months.length - 1 ? "" : `<text class="an-ax" x="${cx}" y="${H - 8}" text-anchor="middle">${m.label}</text>`}
      </g>`;
    }).join("")}
  </svg>`;
}


/* ═══════════════════════════════════════════
   MONTH CLOSE / LOCK
   Stores a `locked` flag in utility_payments.bills.
   When set, all save functions block writes for that month.
═══════════════════════════════════════════ */
async function renderMonthLock(el) {
  el.innerHTML = `
  <div class="topbar">
    <div>
      <div class="page-title">Month Close</div>
      <div class="page-sub">Lock a month to prevent any further edits to meals, bazar, utility, and rent</div>
    </div>
  </div>
  <div class="content">
    <div id="ml-wrap"><div class="empty" style="padding:32px;text-align:center"><div class="spinner"></div></div></div>
  </div>`;
  await loadMonthLockList();
}

async function loadMonthLockList() {
  const wrap = document.getElementById("ml-wrap");
  if (!wrap) return;

  try {
    // Get all utility_payments rows (they carry the lock flag) + rent rows for month coverage
    const [utilRes, rentRes, allMeals, allBazar] = await Promise.all([
      getClient().from("utility_payments").select("month_key,bills").eq("mess_id", messId()).order("month_key", { ascending: false }),
      getClient().from("rent").select("month_key").eq("mess_id", messId()).order("month_key", { ascending: false }),
      dbGetAll("meals"),
      dbGetAll("bazar"),
    ]);

    // Build union of all month keys that have any data
    const keySet = new Set();
    (utilRes.data || []).forEach(r => keySet.add(r.month_key));
    (rentRes.data || []).forEach(r => keySet.add(r.month_key));
    allMeals.forEach(r => keySet.add(String(r.date || "").slice(0, 7)));
    allBazar.forEach(r => keySet.add(String(r.date || "").slice(0, 7)));
    keySet.delete("");

    const lockMap = {};
    (utilRes.data || []).forEach(r => { lockMap[r.month_key] = !!(r.bills?.locked); });

    const keys = Array.from(keySet).filter(Boolean).sort().reverse().slice(0, 18);

    if (!keys.length) {
      wrap.innerHTML = '<div class="card"><div class="empty" style="padding:24px">No months with data yet.</div></div>';
      return;
    }

    wrap.innerHTML = `
      <div class="info-banner" style="margin-bottom:14px">
        🔒 Locking a month prevents any new saves to meals, bazar, utility, and rent for that period. You can unlock at any time.
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
        ${keys.map(k => {
          const locked = lockMap[k] || false;
          const [y, m] = k.split("-").map(Number);
          const label  = MONTHS[m - 1] + " " + y;
          const mealCount = allMeals.filter(r => String(r.date || "").startsWith(k)).length;
          const bazarCount = allBazar.filter(r => String(r.date || "").startsWith(k)).length;

          return `
          <div style="
            background:var(--bg2);
            border:1.5px solid ${locked ? "var(--green)" : "var(--border)"};
            border-radius:var(--radius);
            padding:16px;
            transition:border-color .2s;
          ">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
              <div>
                <div style="font-family:var(--font-serif);font-size:16px;font-weight:700">${label}</div>
                <div style="font-size:11px;color:var(--text3);margin-top:2px">${mealCount} meal days · ${bazarCount} bazar days</div>
              </div>
              <span style="
                font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;
                background:${locked ? "var(--green-bg)" : "var(--bg3)"};
                color:${locked ? "var(--green)" : "var(--text3)"};
                border:1px solid ${locked ? "rgba(76,175,130,.3)" : "var(--border)"};
              ">${locked ? "🔒 Locked" : "🔓 Open"}</span>
            </div>
            ${locked ? `
              <div style="font-size:11px;color:var(--green);margin-bottom:10px">
                ✓ No edits can be made to this month's data
              </div>` : `
              <div style="font-size:11px;color:var(--text3);margin-bottom:10px">
                Edits are still allowed for this month
              </div>`}
            <button class="btn btn-sm ${locked ? "btn-ghost" : "btn-primary"}"
              style="width:100%;justify-content:center"
              onclick="toggleMonthLock('${k}', ${!locked})">
              ${locked ? "🔓 Unlock month" : "🔒 Close & lock month"}
            </button>
          </div>`;
        }).join("")}
      </div>`;
  } catch (e) {
    wrap.innerHTML = `<div class="card"><div class="empty">Error: ${escapeHtml(e.message)}</div></div>`;
  }
}

async function toggleMonthLock(key, lock) {
  if (!requireManager('toggleMonthLock')) return;
  const [y, m] = key.split("-").map(Number);
  const label  = MONTHS[m - 1] + " " + y;

  showConfirm({
    title: lock ? `🔒 Lock ${label}?` : `🔓 Unlock ${label}?`,
    body:  lock
      ? `This will prevent any further saves to meals, bazar, utility, and rent for ${label}. You can unlock it later.`
      : `This will allow edits to ${label} again. Make sure you re-lock after any corrections.`,
    confirmLabel: lock ? "Lock month" : "Unlock",
    danger: false,
    onConfirm: async () => {
      try {
        await dbSetMonthLocked(m - 1, y, key, lock);
        await logAudit("update", "month_lock", key, `${lock ? "Locked" : "Unlocked"} month ${label}`);
        toast(lock ? `🔒 ${label} locked` : `🔓 ${label} unlocked`, "success");
        await loadMonthLockList();
      } catch (e) {
        toast("Error: " + e.message, "error");
      }
    },
  });
}
