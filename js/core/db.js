/* ═══════════════════════════════════════════════
   CORE — Database: all Supabase query functions
   ═══════════════════════════════════════════════ */
const messId = () => {
  const id = currentMess?.id;
  if (!id) throw new Error("No mess loaded — please sign out and sign in again.");
  return id;
};

async function dbGetAll(table) {
  const orderCol = table === "meals" || table === "bazar" ? "date"
    : table === "rent" ? "month_key" : "created_at";
  // Supabase caps at 1000 rows by default — paginate to get everything
  const PAGE = 1000;
  let all = [], from = 0, done = false;
  while (!done) {
    const { data, error } = await getClient().from(table).select("*")
      .eq("mess_id", messId()).order(orderCol).range(from, from + PAGE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE) done = true;
    else from += PAGE;
  }
  return sanitize(all);
}

async function dbGetMonth(table, key) {
  if (table === "rent") {
    const { data, error } = await getClient().from("rent").select("*").eq("mess_id", messId()).eq("month_key", key).maybeSingle();
    if (error) throw error;
    return sanitize(data);
  }
  const { data, error } = await getClient().from(table).select("*").eq("mess_id", messId()).eq("id", key).maybeSingle();
  if (error) throw error;
  return sanitize(data);
}

async function dbUpsertMeals(date, meals) {
  const { error } = await getClient().from("meals").upsert({ mess_id: messId(), date, meals }, { onConflict: "mess_id,date" });
  if (error) throw error;
}

async function dbUpsertBazar(date, bazar) {
  const ex = await getClient().from("bazar").select("utility").eq("mess_id", messId()).eq("date", date).maybeSingle();
  const { error } = await getClient().from("bazar").upsert(
    { mess_id: messId(), date, bazar, utility: ex?.data?.utility || {} },
    { onConflict: "mess_id,date" }
  );
  if (error) throw error;
}

async function dbUpsertRent(month, year, key, entries) {
  const { error } = await getClient().from("rent").upsert(
    { mess_id: messId(), month_key: key, month, year, month_name: MONTHS[month], entries },
    { onConflict: "mess_id,month_key" }
  );
  if (error) throw error;
}

async function dbUpsertUtility(month, year, key, bills, payments) {
  const { error } = await getClient().from("utility_payments").upsert(
    { mess_id: messId(), month_key: key, month, year, month_name: MONTHS[month], bills, payments },
    { onConflict: "mess_id,month_key" }
  );
  if (error) throw error;
}

/* ── Month Lock ── */
async function isMonthLocked(key) {
  try {
    const { data } = await getClient().from("utility_payments").select("bills")
      .eq("mess_id", messId()).eq("month_key", key).maybeSingle();
    return !!(data?.bills?.locked);
  } catch(_) { return false; }
}

/* true = the month is open. Shows the standard message when it's closed. */
async function ensureMonthOpen(key) {
  if (!key || !(await isMonthLocked(String(key).slice(0, 7)))) return true;
  toast("🔒 " + monthLabelFromKey(String(key).slice(0, 7)) + " is closed — ask the manager to unlock it in Month Close", "error");
  return false;
}

async function dbSetMonthLocked(month, year, key, locked) {
  // Fetch current record (or blank) so we don't wipe bills/payments
  const { data: cur } = await getClient().from("utility_payments").select("*")
    .eq("mess_id", messId()).eq("month_key", key).maybeSingle();
  const bills    = { ...(cur?.bills    || {}) };
  const payments = cur?.payments || {};
  if (locked) bills.locked = true;
  else delete bills.locked;
  await dbUpsertUtility(month, year, key, bills, payments);
}

async function dbDelete(table, id) {
  const { error } = await getClient().from(table).delete().eq("id", id).eq("mess_id", messId());
  if (error) throw error;
}

/* ── Members ── */
/* Never select "*" from members: that would ship every password hash to the browser
   (and is refused once supabase/security-lockdown.sql hides the column).
   Optional columns are dropped if this database hasn't been migrated for them yet. */
const MEMBER_COLS = ["id", "mess_id", "name", "username", "role", "room", "rent", "phone", "joined", "created_at"];
let _memberOptCols = ["photo", "meal_default_day", "meal_default_night"];
async function dbGetMembers() {
  for (;;) {
    const { data, error } = await getClient().from("members").select(MEMBER_COLS.concat(_memberOptCols).join(","))
      .eq("mess_id", messId()).order("created_at");
    if (!error) return sanitize(data || []);
    const missing = _memberOptCols.find(c => (error.message || "").includes(c));
    if (!missing) throw error;
    _memberOptCols = _memberOptCols.filter(c => c !== missing);
  }
}

/* Columns that older databases may not have yet (added by later migrations).
   If the server says one is missing, the save is retried without it, so editing
   members never breaks on a database that hasn't been migrated. */
const OPTIONAL_MEMBER_COLS = { meal_default_day: "member-meal-defaults.sql", meal_default_night: "member-meal-defaults.sql", photo: "member-photos.sql" };

async function dbSaveMember(row) {
  const payload = {
    name: row.name, username: row.username,
    role: row.role || "member", room: row.room || "",
    phone: row.phone || "", joined: row.joined || null, mess_id: messId(),
  };
  // Only send what the form actually set — never reset an untouched value to a default
  if (row.meal_default_day   != null && !isNaN(row.meal_default_day))   payload.meal_default_day   = row.meal_default_day;
  if (row.meal_default_night != null && !isNaN(row.meal_default_night)) payload.meal_default_night = row.meal_default_night;
  // Only include password in payload if explicitly provided (avoids overwriting with undefined)
  if (row.password) payload.password = row.password;
  // Photo only when it changed (undefined = keep); null removes it
  if (row.photo !== undefined) payload.photo = row.photo;
  if (!row.id && !payload.password) throw new Error("Password is required for new members");

  const write = (p) => row.id
    ? getClient().from("members").update(p).eq("id", row.id).eq("mess_id", messId())
    : getClient().from("members").insert(p);

  // Retry without any optional column the database doesn't have yet (at most once per column)
  for (let i = 0; i <= Object.keys(OPTIONAL_MEMBER_COLS).length; i++) {
    const { error } = await write(payload);
    if (!error) return;
    const col = Object.keys(OPTIONAL_MEMBER_COLS).find(c => c in payload && (error.message || "").includes(c));
    if (!col) throw error;
    if (col === "photo") throw new Error("Profile photos need a database update — run supabase/member-photos.sql");
    console.warn(`[members] "${col}" column missing — run supabase/${OPTIONAL_MEMBER_COLS[col]}; saved without it`);
    delete payload[col];
  }
}

/* Meals, bazar, rent and utility rows store members by NAME, so a rename must
   move every key to the new name or the member's history disappears.
   Returns how many rows changed. Called before the member row is saved; the
   caller moves everything back if that save fails. */
async function dbRenameMemberData(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return 0;
  const c = getClient(), mid = messId();
  const ren = (obj, keys) => {
    if (!obj || typeof obj !== "object") return [obj, false];
    const o = { ...obj }; let hit = false;
    keys.forEach(([from, to]) => { if (from in o) { o[to] = o[from]; delete o[from]; hit = true; } });
    return [o, hit];
  };
  const mealKeys = [[oldName, newName], [oldName + "_day", newName + "_day"], [oldName + "_night", newName + "_night"]];
  const one = [[oldName, newName]];
  let changed = 0;
  const save = async (table, id, patch) => {
    const { error } = await c.from(table).update(patch).eq("id", id).eq("mess_id", mid);
    if (error) throw error;
    changed++;
  };
  const rows = async t => { const { data, error } = await c.from(t).select("*").eq("mess_id", mid); if (error) throw error; return data || []; };

  for (const r of await rows("meals")) { const [m, hit] = ren(r.meals, mealKeys); if (hit) await save("meals", r.id, { meals: m }); }
  for (const r of await rows("bazar")) { const [b, hit] = ren(r.bazar, one); if (hit) await save("bazar", r.id, { bazar: b }); }
  for (const r of await rows("rent")) {
    if (!(r.entries || []).some(e => e.name === oldName)) continue;
    await save("rent", r.id, { entries: r.entries.map(e => e.name === oldName ? { ...e, name: newName } : e) });
  }
  for (const r of await rows("utility_payments")) {
    const [pay, h1] = ren(r.payments, one);
    const bills = { ...(r.bills || {}) }; let h2 = false;
    ["pending_change", "mess_credit", "change_credit"].forEach(k => { const [v, hit] = ren(bills[k], one); if (hit) { bills[k] = v; h2 = true; } });
    if (h1 || h2) await save("utility_payments", r.id, { payments: pay, bills });
  }
  // receipts keep a display copy of the name
  await c.from("member_payments").update({ member_name: newName }).eq("mess_id", mid).eq("member_name", oldName);
  return changed;
}

async function dbDeleteMember(id) {
  const { error } = await getClient().from("members").delete().eq("id", id).eq("mess_id", messId());
  if (error) throw error;
}

/* ── Announcements ── */
async function dbSaveAnnouncement(row) {
  if (row.id) {
    const { error } = await getClient().from("announcements").update({ title: row.title, body: row.body, pinned: row.pinned }).eq("id", row.id).eq("mess_id", messId());
    if (error) throw error;
  } else {
    const { error } = await getClient().from("announcements").insert({
      mess_id: messId(), title: row.title, body: row.body,
      pinned: row.pinned || false, author: currentUser.name,
    });
    if (error) throw error;
  }
}

async function dbDeleteAnnouncement(id) {
  const { error } = await getClient().from("announcements").delete().eq("id", id).eq("mess_id", messId());
  if (error) throw error;
}

/* ── Chores ── */
async function dbGetChores() {
  const { data, error } = await getClient().from("chores").select("*").eq("mess_id", messId()).order("created_at");
  if (error) throw error;
  return sanitize(data || []);
}

async function dbSaveChore(row) {
  if (row.id) {
    const { error } = await getClient().from("chores").update({ task: row.task, assignee: row.assignee, frequency: row.frequency, status: row.status }).eq("id", row.id).eq("mess_id", messId());
    if (error) throw error;
  } else {
    const { error } = await getClient().from("chores").insert({
      mess_id: messId(), task: row.task, assignee: row.assignee,
      frequency: row.frequency || "daily", status: row.status || "pending",
    });
    if (error) throw error;
  }
}

async function dbDeleteChore(id) {
  const { error } = await getClient().from("chores").delete().eq("id", id).eq("mess_id", messId());
  if (error) throw error;
}

/* ── Notifications ── */
/* ── Notifications / Activity Log ── */
async function dbGetNotifications(statusFilter) {
  let q = getClient()
    .from("notifications")
    .select("*")
    .eq("mess_id", messId())
    .order("created_at", { ascending: false });

  if (statusFilter) q = q.eq("status", statusFilter);

  const { data, error } = await q;
  if (error) throw error;

  return sanitize(data || []);
}

async function dbSaveNotification(row) {
  const { error } = await getClient().from("notifications").insert({
    mess_id: messId(),
    type: row.type,
    from_id: currentUser.memberId,
    from_name: currentUser.name,
    date: row.date,
    data: row.data,
    note: row.note || "",
    status: row.status || "new",
  });

  if (error) throw error;
}

async function dbUpdateNotifStatus(id, status) {
  const { error } = await sb
    .from("notifications")
    .update({ status })
    .eq("id", id);

  if (error) throw error;
}

async function getPendingCount() {
  const { count, error } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("mess_id", messId())
    .in("status", ["new", "pending"]);

  if (error) return 0;

  return count || 0;
}

/* Unread notices for the member's Messages badge: active broadcasts posted since
   they last opened Messages (renderMessages stores that time). */
async function getUnreadAnnouncementCount() {
  if (!currentUser?.memberId) return 0;
  const lastRead = lsGet(`mm_announce_read_${currentUser.memberId}`) || "1970-01-01";
  const { data } = await getClient().from("broadcasts")
    .select("id, created_at, expires_at").eq("mess_id", messId()).gt("created_at", lastRead);
  const now = Date.now();
  return (data || []).filter(b => !b.expires_at || new Date(b.expires_at).getTime() > now).length;
}
