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
        ${Array.from({length:6},(_,i)=>new Date().getFullYear()-2+i).map(y=>`<option value="${y}" ${y===year?"selected":""}>${y}</option>`).join("")}
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

    // Merge 0-meal days from the meals table
    (mealRows || []).forEach(r => {
      const date = r.date;
      const mObj = r.meals || {};

      // Only process days where at least one member has ANY meals > 0
      const anyMeals = Object.values(mObj).some(v => Number(v) > 0);
      if (!anyMeals) return;

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
   BROADCASTS (Manager) — with ⑪ Pin to top
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
    // Fetch all (including expired) for manager view
    const { data, error } = await getClient().from("broadcasts").select("*")
      .eq("mess_id", messId()).order("pinned", { ascending: false })
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    const all = data || [];
    if (!all.length) { wrap.innerHTML = '<div class="empty" style="padding:20px">No broadcasts yet.</div>'; return; }
    wrap.innerHTML = all.map(b => {
      const dt = new Date(b.created_at).toLocaleString("en-IN", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit", hour12:true });
      const isUrgent = b.priority === "urgent";
      const isPinned = b.pinned;
      const isExpired = b.expires_at && new Date(b.expires_at) < new Date();
      return `<div style="background:${isUrgent?"var(--red-bg)":isPinned?"var(--accent-bg)":"var(--bg3)"};border:1px solid ${isUrgent?"rgba(224,82,82,.25)":isPinned?"rgba(212,168,83,.25)":"var(--border)"};border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:8px;opacity:${isExpired?0.55:1}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
              <span style="font-size:16px">${isPinned?"📌":isUrgent?"🔴":"📢"}</span>
              ${isPinned?'<span style="font-size:10px;background:var(--accent);color:#000;padding:1px 6px;border-radius:99px;font-weight:700">PINNED</span>':""}
              ${isUrgent?'<span style="font-size:10px;background:var(--red);color:#fff;padding:1px 6px;border-radius:99px;font-weight:700">URGENT</span>':""}
              ${isExpired?'<span style="font-size:10px;color:var(--text3);border:1px solid var(--border);padding:1px 6px;border-radius:99px">EXPIRED</span>':""}
            </div>
            <div style="font-size:13px;color:var(--text);line-height:1.5">${escapeHtml(b.message)}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:4px">${escapeHtml(b.author)} · ${dt}${b.expires_at?` · Expires ${new Date(b.expires_at).toLocaleDateString("en-IN")}`:""}</div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn btn-ghost btn-sm" onclick="toggleBroadcastPin('${b.id}',${!isPinned})" title="${isPinned?"Unpin":"Pin to top"}">${isPinned?"📌":"📍"}</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteBroadcastItem('${b.id}')">✕</button>
          </div>
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

async function toggleBroadcastPin(id, pinned) {
  try {
    await getClient().from("broadcasts").update({ pinned }).eq("id", id);
    toast(pinned ? "📌 Pinned" : "Unpinned", "success");
    await loadBroadcastList();
  } catch (e) { toast("Error: " + e.message, "error"); }
}

async function deleteBroadcastItem(id) {
  try { await getClient().from("broadcasts").delete().eq("id", id); toast("Broadcast removed"); await loadBroadcastList(); }
  catch (e) { toast("Error: " + e.message, "error"); }
}

/* ═══════════════════════════════════════════
   MESS RULES — ⑭ Markdown editor + live preview
═══════════════════════════════════════════ */
function renderMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm,  "<h2>$1</h2>")
    .replace(/^# (.+)$/gm,   "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,    "<em>$1</em>")
    .replace(/^- (.+)$/gm,    "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^(?!<[hul])(.+)$/gm, "<p>$1</p>");
}

async function renderMessRules(el, isManager) {
  const rules = await dbGetMessRules();
  if (isManager) {
    el.innerHTML = `
    <div class="topbar"><div><div class="page-title">📌 Mess Rules & Info</div><div class="page-sub">WiFi, bank info, rules, contacts — supports **bold**, *italic*, # headings, - lists</div></div>
      <div class="topbar-actions"><button class="btn btn-primary btn-sm" onclick="saveMessRules()">💾 Save</button></div>
    </div>
    <div class="content">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start">
        <div>
          <div class="card" style="margin-bottom:12px">
            <div class="card-title">🔑 WiFi Password</div>
            <input type="text" class="input" id="mr-wifi" value="${escapeHtml(rules?.wifi_pass||"")}" placeholder="e.g. MyWiFi@123" style="margin-top:8px;font-family:monospace"/>
          </div>
          <div class="card" style="margin-bottom:12px">
            <div class="card-title">💳 Bank / Payment Info</div>
            <textarea class="input" id="mr-bank" rows="4" placeholder="e.g. bKash: 01712345678 (Personal)" style="margin-top:8px">${escapeHtml(rules?.bank_info||"")}</textarea>
          </div>
          <div class="card" style="margin-bottom:12px">
            <div class="card-title">📞 Emergency Contacts</div>
            <textarea class="input" id="mr-contacts" rows="3" placeholder="e.g. Landlord: 017xxx, Gas: 016xxx" style="margin-top:8px">${escapeHtml(rules?.contacts||"")}</textarea>
          </div>
        </div>
        <div>
          <div class="card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div class="card-title" style="margin:0">📜 Mess Rules <span style="font-size:10px;color:var(--text3);font-weight:400">(Markdown supported)</span></div>
              <div style="display:flex;gap:4px">
                <button class="btn btn-ghost btn-sm" onclick="insertMd('**','**')" title="Bold">B</button>
                <button class="btn btn-ghost btn-sm" onclick="insertMd('*','*')" title="Italic" style="font-style:italic">I</button>
                <button class="btn btn-ghost btn-sm" onclick="insertMd('# ','')" title="Heading">H</button>
                <button class="btn btn-ghost btn-sm" onclick="insertMd('- ','')" title="List">•</button>
              </div>
            </div>
            <textarea class="input" id="mr-rules" rows="12" placeholder="# Mess Rules&#10;&#10;- No guests after 11pm&#10;- Clean dishes immediately&#10;- **Pay rent by 5th of every month**" style="font-family:monospace;font-size:12px" oninput="updateRulesPreview()">${escapeHtml(rules?.rules_text||"")}</textarea>
            <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
              <div style="font-size:10px;color:var(--text3);font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Preview</div>
              <div id="mr-preview" style="font-size:13px;line-height:1.7;color:var(--text2);min-height:60px">${renderMarkdown(rules?.rules_text||"") || '<span style="color:var(--text3)">Preview will appear here...</span>'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  } else {
    const hasAny = rules && (rules.wifi_pass || rules.bank_info || rules.rules_text || rules.contacts);
    el.innerHTML = `
    <div class="topbar"><div><div class="page-title">📌 Mess Info</div><div class="page-sub">Rules, WiFi, payment info, contacts</div></div></div>
    <div class="content">${hasAny ? `
      ${rules.wifi_pass ? `<div class="card" style="margin-bottom:12px"><div class="card-title">🔑 WiFi Password</div><div style="font-size:18px;font-weight:700;font-family:monospace;background:var(--bg4);padding:10px 14px;border-radius:var(--radius-sm);user-select:all;margin-top:6px">${escapeHtml(rules.wifi_pass)}</div></div>` : ""}
      ${rules.bank_info ? `<div class="card" style="margin-bottom:12px"><div class="card-title">💳 Payment Info</div><div style="font-size:13px;white-space:pre-wrap;color:var(--text2);margin-top:6px;line-height:1.6">${escapeHtml(rules.bank_info)}</div></div>` : ""}
      ${rules.rules_text ? `<div class="card" style="margin-bottom:12px"><div class="card-title">📜 Mess Rules</div><div style="font-size:13px;color:var(--text2);margin-top:6px;line-height:1.7">${renderMarkdown(rules.rules_text)}</div></div>` : ""}
      ${rules.contacts ? `<div class="card" style="margin-bottom:12px"><div class="card-title">📞 Emergency Contacts</div><div style="font-size:13px;white-space:pre-wrap;color:var(--text2);margin-top:6px;line-height:1.6">${escapeHtml(rules.contacts)}</div></div>` : ""}
    ` : '<div class="card"><div class="empty" style="padding:24px">No mess info has been set by the manager yet.</div></div>'}</div>`;
  }
}

function updateRulesPreview() {
  const text = document.getElementById("mr-rules")?.value || "";
  const preview = document.getElementById("mr-preview");
  if (preview) preview.innerHTML = renderMarkdown(text) || '<span style="color:var(--text3)">Preview will appear here...</span>';
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
  } catch (e) { toast("Error: " + e.message, "error"); }
}

/* ═══════════════════════════════════════════
   CHARTS DASHBOARD ⑰-㉑
   ⑰ Meal rate trend (12-month line)
   ⑱ Bazar spend trend
   ⑲ Member balance trend
   ⑳ Member meal-share pie
   ㉑ Spending by category pie
═══════════════════════════════════════════ */
async function renderMealRateChart(el) {
  el.innerHTML = `<div class="topbar"><div><div class="page-title">📊 Analytics</div><div class="page-sub">Meal rate, bazar, member trends & spending breakdown</div></div></div>
  <div class="content"><div class="empty" style="padding:32px;text-align:center"><div class="spinner"></div></div></div>`;

  const [allMeals, allBazar, currentRentRec, currentUtilRes] = await Promise.all([
    dbGetAll("meals"), dbGetAll("bazar"), dbGetMonth("rent", monthKey(...Object.values(thisMonth()))),
    getClient().from("utility_payments").select("*").eq("mess_id", messId()).eq("month_key", monthKey(...Object.values(thisMonth()))).maybeSingle(),
  ]);
  const currentUtilRec = currentUtilRes.data;
  const { month, year } = thisMonth();

  // Build per-month data
  const monthData = {};
  allMeals.forEach(r => {
    const mk = String(r.date||"").slice(0,7); if (!mk) return;
    if (!monthData[mk]) monthData[mk] = { meals:0, bazar:0, memMeals:{}, memBazar:{} };
    const mObj = r.meals||{}, ks = Object.keys(mObj);
    const hasSplit = ks.some(k => k.endsWith("_day")||k.endsWith("_night"));
    if (hasSplit) ks.forEach(k => { if (k.endsWith("_day")||k.endsWith("_night")) monthData[mk].meals += Number(mObj[k])||0; });
    else Object.values(mObj).forEach(v => { monthData[mk].meals += Number(v)||0; });
    members.forEach(m => {
      const v = mealMemberTotal(mObj, m.name);
      monthData[mk].memMeals[m.name] = (monthData[mk].memMeals[m.name]||0) + v;
    });
  });
  allBazar.forEach(r => {
    const mk = String(r.date||"").slice(0,7); if (!mk) return;
    if (!monthData[mk]) monthData[mk] = { meals:0, bazar:0, memMeals:{}, memBazar:{} };
    Object.values(r.bazar||{}).forEach(v => { monthData[mk].bazar += Number(v)||0; });
    members.forEach(m => {
      const v = Number((r.bazar||{})[m.name]||0);
      monthData[mk].memBazar[m.name] = (monthData[mk].memBazar[m.name]||0) + v;
    });
  });

  const sortedKeys = Object.keys(monthData).sort().slice(-12);
  if (!sortedKeys.length) {
    el.innerHTML = `<div class="topbar"><div><div class="page-title">📊 Analytics</div></div></div><div class="content"><div class="card"><div class="empty" style="padding:32px">No data yet.</div></div></div>`;
    return;
  }

  const rates = sortedKeys.map(k => ({
    key: k,
    label: MONTHS[parseInt(k.slice(5))-1]?.slice(0,3) + " '" + k.slice(2,4),
    rate:  monthData[k].meals > 0 ? round2(monthData[k].bazar/monthData[k].meals) : 0,
    meals: round2(monthData[k].meals),
    bazar: round2(monthData[k].bazar),
  }));
  const avgRate  = round2(rates.reduce((s,r)=>s+r.rate,0)/rates.length);
  const maxRate  = Math.max(...rates.map(r=>r.rate),1);
  const maxBazar = Math.max(...rates.map(r=>r.bazar),1);

  // SVG helpers — taller to accommodate value labels above dots
  const W = 700, H = 200, PAD = 40, LABEL_AREA = 24;
  const chartW = W - PAD*2;
  const xPos = (i, n) => PAD + (i/((n||rates.length)-1||1))*chartW;
  const yPos = (v, max) => LABEL_AREA + ((1 - v/Math.max(max,1)) * (H - PAD - LABEL_AREA));

  function yAxisLines(max, color) {
    const steps = 4;
    return Array.from({length:steps+1},(_,i)=>{
      const v = round2((i/steps)*max);
      const y = yPos(v, max);
      return `<line x1="${PAD-4}" y1="${y}" x2="${W-PAD}" y2="${y}" stroke="var(--border)" stroke-width="0.5" opacity="0.6"/>
              <text x="${PAD-6}" y="${y+3}" text-anchor="end" font-size="7" fill="var(--text3)">${v}</text>`;
    }).join("");
  }

  function lineChart(data, color, maxVal, tooltipFn=null, labelFn=null) {
    if (data.length < 2) return "";
    const n = data.length;
    const pts = data.map((v,i) => `${xPos(i,n)},${yPos(v,maxVal)}`).join(" ");
    const areaBot = H-PAD;
    const area = `${xPos(0,n)},${areaBot} ` + data.map((v,i)=>`${xPos(i,n)},${yPos(v,maxVal)}`).join(" ") + ` ${xPos(n-1,n)},${areaBot}`;
    const dots = data.map((v,i) => {
      const cx = xPos(i,n), cy = yPos(v,maxVal);
      const label = labelFn ? labelFn(v) : String(v);
      const ttip  = tooltipFn ? tooltipFn(i,v) : label;
      // Value label above dot — alternates above/below to avoid overlap when close
      const labelY = i%2===0 ? cy-8 : cy-8;
      return `<circle cx="${cx}" cy="${cy}" r="4" fill="${color}" stroke="var(--bg2)" stroke-width="2"><title>${ttip}</title></circle>
              <text x="${cx}" y="${labelY}" text-anchor="middle" font-size="8" font-weight="600" fill="${color}">${label}</text>`;
    }).join("");
    const xLabels = data.map((v,i) => `<text x="${xPos(i,n)}" y="${H-PAD+14}" text-anchor="middle" font-size="8" fill="var(--text3)">${rates[i]?.label||""}</text>`).join("");
    return `
      <polygon points="${area}" fill="${color}" opacity="0.10"/>
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
      ${dots}${xLabels}`;
  }

  // ⑰ Meal rate line chart
  const avgY = yPos(avgRate, maxRate);
  const rateChart = `<svg viewBox="0 0 ${W} ${H+16}" style="width:100%;display:block;overflow:visible;font-family:var(--font)">
    ${yAxisLines(maxRate, "var(--accent)")}
    <line x1="${PAD}" y1="${avgY}" x2="${W-PAD}" y2="${avgY}" stroke="var(--green)" stroke-width="1.2" stroke-dasharray="5,3" opacity="0.7"/>
    <text x="${W-PAD+2}" y="${avgY-3}" font-size="8" fill="var(--green)">avg ${fmtTk(avgRate)}</text>
    ${lineChart(rates.map(r=>r.rate), "var(--accent)", maxRate,
      (i,v)=>`${rates[i].label}: ${fmtTk(v)}/meal`,
      v => fmtTk(v))}
  </svg>`;

  // ⑱ Bazar spend trend
  const bazarChart = `<svg viewBox="0 0 ${W} ${H+16}" style="width:100%;display:block;overflow:visible;font-family:var(--font)">
    ${yAxisLines(maxBazar, "var(--green)")}
    ${lineChart(rates.map(r=>r.bazar), "var(--green)", maxBazar,
      (i,v)=>`${rates[i].label}: ${fmtTk(v)}`,
      v => fmtTk(v))}
  </svg>`;

  // ⑲ Member balance trend (last 6 months)
  const last6 = sortedKeys.slice(-6);
  const memColors = ["var(--accent)","var(--green)","var(--blue)","var(--purple)","var(--red)","var(--amber)"];
  const allBalVals = members.slice(0,6).flatMap(m => last6.map(k => {
    const d = monthData[k]; const rate = d.meals>0?d.bazar/d.meals:0;
    return Math.abs(round2((d.memBazar[m.name]||0)-(d.memMeals[m.name]||0)*rate));
  }));
  const maxBalAbs = Math.max(...allBalVals, 1);
  const memberLines = members.slice(0,6).map((m,mi) => {
    const vals = last6.map(k => {
      const d = monthData[k]; const rate = d.meals>0?d.bazar/d.meals:0;
      return round2((d.memBazar[m.name]||0)-(d.memMeals[m.name]||0)*rate);
    });
    if (vals.length < 2) return "";
    const col = memColors[mi];
    const n = last6.length;
    const pts = vals.map((v,i)=>`${xPos(i,n)},${yPos(v+maxBalAbs,maxBalAbs*2)}`).join(" ");
    const dots = vals.map((v,i)=>`
      <circle cx="${xPos(i,n)}" cy="${yPos(v+maxBalAbs,maxBalAbs*2)}" r="3.5" fill="${col}" stroke="var(--bg2)" stroke-width="1.5"><title>${m.name}: ${v>=0?"Credit":"Owe"} ${fmtTk(Math.abs(v))}</title></circle>
      <text x="${xPos(i,n)}" y="${yPos(v+maxBalAbs,maxBalAbs*2)-7}" text-anchor="middle" font-size="7" fill="${col}">${v===0?"0":v>0?"+"+fmtTk(v):"-"+fmtTk(-v)}</text>`).join("");
    const xLabels = mi===0 ? vals.map((v,i)=>`<text x="${xPos(i,n)}" y="${H-PAD+14}" text-anchor="middle" font-size="8" fill="var(--text3)">${MONTHS[parseInt(last6[i].slice(5))-1]?.slice(0,3)}</text>`).join("") : "";
    return `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round"/>${dots}${xLabels}`;
  }).join("");
  const zeroY = yPos(0+maxBalAbs, maxBalAbs*2);
  const balChart = `<svg viewBox="0 0 ${W} ${H+16}" style="width:100%;display:block;overflow:visible;font-family:var(--font)">
    <line x1="${PAD}" y1="${zeroY}" x2="${W-PAD}" y2="${zeroY}" stroke="var(--border2)" stroke-width="1" stroke-dasharray="4,3"/>
    <text x="${PAD-6}" y="${zeroY+3}" text-anchor="end" font-size="7" fill="var(--text3)">0</text>
    ${memberLines}
  </svg>`;

  // ⑳ Member meal-share pie (this month)
  const curKey = monthKey(year, month);
  const curMeals = {};
  members.forEach(m => { curMeals[m.name] = round2(monthData[curKey]?.memMeals[m.name]||0); });
  const totalCurMeals = Math.max(Object.values(curMeals).reduce((s,v)=>s+v,0),1);
  const pieColors = ["var(--accent)","var(--blue)","var(--green)","var(--purple)","var(--red)","var(--amber)"];

  function buildPie(segments) {
    // segments: [{label, val, color}]
    const total = Math.max(segments.reduce((s,c)=>s+c.val,0),1);
    let angle = -90;
    const CX=80, CY=80, R=68, LR=45;
    return segments.map(c => {
      const pct = c.val/total;
      if (pct < 0.001) return "";
      const sa = angle*(Math.PI/180);
      angle += pct*360;
      const ea = angle*(Math.PI/180);
      const x1=CX+R*Math.cos(sa), y1=CY+R*Math.sin(sa);
      const x2=CX+R*Math.cos(ea), y2=CY+R*Math.sin(ea);
      const mx=CX+LR*Math.cos((sa+ea)/2), my=CY+LR*Math.sin((sa+ea)/2);
      const pctStr = round2(pct*100) + "%";
      return `<path d="M${CX},${CY} L${x1},${y1} A${R},${R} 0 ${pct>.5?1:0},1 ${x2},${y2} Z" fill="${c.color}" opacity="0.85">
        <title>${c.label}: ${pctStr}</title></path>
        ${pct >= 0.07 ? `<text x="${mx}" y="${my+3}" text-anchor="middle" font-size="9" font-weight="700" fill="white" pointer-events="none">${pctStr}</text>` : ""}`;
    }).join("");
  }

  const mealSegments = members.map((m,i)=>({ label:m.name, val:curMeals[m.name], color:pieColors[i%6] }));
  const piePaths  = buildPie(mealSegments);
  const pieLegend = members.map((m,i) => `<div style="display:flex;align-items:center;gap:5px;font-size:11px"><span style="width:10px;height:10px;border-radius:2px;background:${pieColors[i%6]};display:inline-block;flex-shrink:0"></span><span>${escapeHtml(m.name)}</span><span style="color:var(--text3);margin-left:auto">${curMeals[m.name]} (${round2((curMeals[m.name]/totalCurMeals)*100)}%)</span></div>`).join("");

  // ㉑ Spending category pie
  const bills = currentUtilRec?.bills || {};
  const elec  = Number(bills.elec||0), gas=Number(bills.gas||0), wifi=Number(bills.wifi||0);
  const curKey2 = monthKey(year, month);
  const curBazar = round2(monthData[curKey2]?.bazar||0);
  const totalRentAmt = round2((currentRentRec?.entries||[]).reduce((s,e)=>s+Number(e.rent||0),0));
  const spendCats = [
    { label:"Bazar", val:curBazar,   color:"var(--green)"  },
    { label:"Rent",  val:totalRentAmt,color:"var(--amber)"  },
    { label:"Elec",  val:elec,        color:"var(--blue)"   },
    { label:"Gas",   val:gas,         color:"var(--red)"    },
    { label:"WiFi",  val:wifi,        color:"var(--purple)" },
  ].filter(c=>c.val>0);
  const spendPaths  = buildPie(spendCats);
  const totalSpend  = Math.max(spendCats.reduce((s,c)=>s+c.val,0),1);
  const spendLegend = spendCats.map(c=>`<div style="display:flex;align-items:center;gap:5px;font-size:11px"><span style="width:10px;height:10px;border-radius:2px;background:${c.color};display:inline-block;flex-shrink:0"></span><span>${c.label}</span><span style="color:var(--text3);margin-left:auto">${fmtTk(c.val)} (${round2((c.val/totalSpend)*100)}%)</span></div>`).join("");

  el.innerHTML = `
  <div class="topbar"><div><div class="page-title">📊 Analytics</div><div class="page-sub">Last 12 months of data</div></div></div>
  <div class="content">

    <!-- ⑰ Meal Rate Trend -->
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px">
        <div class="card-title" style="margin:0">📈 Meal Rate Trend</div>
        <div style="display:flex;gap:10px;font-size:11px">
          <span>Avg: <b style="color:var(--green)">${fmtTk(avgRate)}</b></span>
          <span>High: <b style="color:var(--red)">${fmtTk(Math.max(...rates.map(r=>r.rate)))}</b></span>
          <span>Low: <b style="color:var(--blue)">${fmtTk(Math.min(...rates.filter(r=>r.rate>0).map(r=>r.rate)))}</b></span>
        </div>
      </div>
      <div style="overflow-x:auto">${rateChart}</div>
    </div>

    <!-- ⑱ Bazar Spend Trend -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-title" style="margin-bottom:10px">🛒 Bazar Spend Trend</div>
      <div style="overflow-x:auto">${bazarChart}</div>
    </div>

    <!-- ⑲ Member Balance Trend -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-title" style="margin-bottom:6px">⚖️ Member Balance Trend (last 6 months)</div>
      <div style="font-size:10px;color:var(--text3);margin-bottom:8px">Above zero line = contributed more than ate (credit). Below = owes.</div>
      <div style="overflow-x:auto">${balChart}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
        ${members.slice(0,6).map((m,i)=>`<span style="display:flex;align-items:center;gap:4px;font-size:11px"><span style="width:10px;height:3px;border-radius:1px;background:${memColors[i]};display:inline-block"></span>${escapeHtml(m.name)}</span>`).join("")}
      </div>
    </div>

    <!-- ⑳ + ㉑ Pies side by side -->
    <div class="grid-2" style="align-items:start">
      <div class="card">
        <div class="card-title" style="margin-bottom:10px">🍽️ Meal Share — ${MONTHS[month]}</div>
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <svg viewBox="0 0 160 160" width="160" height="160" style="flex-shrink:0">${piePaths}</svg>
          <div style="flex:1;display:flex;flex-direction:column;gap:5px">${pieLegend}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:10px">💰 Spending by Category — ${MONTHS[month]}</div>
        ${spendCats.length ? `<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <svg viewBox="0 0 160 160" width="160" height="160" style="flex-shrink:0">${spendPaths}</svg>
          <div style="flex:1;display:flex;flex-direction:column;gap:5px">${spendLegend}</div>
        </div>` : '<div class="empty">No billing data for this month</div>'}
      </div>
    </div>

    <!-- Table breakdown -->
    <div class="card" style="margin-top:14px">
      <div class="card-title" style="margin-bottom:10px">Month-by-month breakdown</div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Month</th><th>Meals</th><th>Total Bazar</th><th>Meal Rate</th><th>vs Avg</th></tr></thead>
        <tbody>${rates.slice().reverse().map(r=>{
          const diff=round2(r.rate-avgRate);
          const dc=diff>0?"var(--red)":diff<0?"var(--green)":"var(--text3)";
          return `<tr><td><b>${r.label}</b></td><td>${r.meals}</td><td style="color:var(--green)">${fmtTk(r.bazar)}</td><td style="color:var(--accent);font-weight:700">${fmtTk(r.rate)}</td><td style="color:${dc};font-size:12px">${diff>0?"+"+fmtTk(diff):diff<0?"-"+fmtTk(Math.abs(diff)):"—"}</td></tr>`;
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
        <select class="input" id="exp-year" style="width:90px">${Array.from({length:6},(_,i)=>new Date().getFullYear()-2+i).map(y => `<option value="${y}" ${y===year?"selected":""}>${y}</option>`).join("")}</select>
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
