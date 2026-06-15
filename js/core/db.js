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
async function dbGetMembers() {
  const { data, error } = await getClient().from("members").select("*").eq("mess_id", messId()).order("created_at");
  if (error) throw error;
  return sanitize(data || []);
}

async function dbSaveMember(row) {
  const payload = {
    name: row.name, username: row.username,
    role: row.role || "member", room: row.room || "",
    phone: row.phone || "", joined: row.joined || null, mess_id: messId(),
    meal_default_day:   row.meal_default_day   ?? 1,
    meal_default_night: row.meal_default_night ?? 1,
  };
  // Only include password in payload if explicitly provided (avoids overwriting with undefined)
  if (row.password) payload.password = row.password;

  if (row.id) {
    const { error } = await getClient().from("members").update(payload).eq("id", row.id);
    if (error) throw error;
  } else {
    // New member must have a password
    if (!payload.password) throw new Error("Password is required for new members");
    const { error } = await getClient().from("members").insert(payload);
    if (error) throw error;
  }
}

async function dbDeleteMember(id) {
  const { error } = await getClient().from("members").delete().eq("id", id);
  if (error) throw error;
}

/* ── Announcements ── */
async function dbSaveAnnouncement(row) {
  if (row.id) {
    const { error } = await getClient().from("announcements").update({ title: row.title, body: row.body, pinned: row.pinned }).eq("id", row.id);
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
  const { error } = await getClient().from("announcements").delete().eq("id", id);
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
    const { error } = await getClient().from("chores").update({ task: row.task, assignee: row.assignee, frequency: row.frequency, status: row.status }).eq("id", row.id);
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
  const { error } = await getClient().from("chores").delete().eq("id", id);
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

async function getUnreadAnnouncementCount() {
  const { data: announcements } = await getClient().from("announcements")
    .select("id, created_at").eq("mess_id", messId())
    .order("created_at", { ascending: false });
  if (!announcements?.length) return 0;
  const lastRead = localStorage.getItem(`mm_announce_read_${currentUser.memberId}`) || "1970-01-01";
  return announcements.filter(a => a.created_at > lastRead).length;
}
