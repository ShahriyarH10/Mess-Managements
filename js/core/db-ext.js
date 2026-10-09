/* ═══════════════════════════════════════════════
   CORE — DB Ext: audit log, attendance, rules, broadcasts
   ═══════════════════════════════════════════════ */

/* ── Audit Log ───────────────────────────── */
async function logAudit(action, entity, entityId, summary, details = {}) {
  try {
    await getClient().from("audit_log").insert({
      mess_id:    messId(),
      actor_id:   currentUser?.memberId || null,
      actor_name: currentUser?.name || "Unknown",
      action, entity,
      entity_id:  String(entityId || ""),
      summary,
      details,
    });
  } catch (e) { console.warn("[Audit] Failed:", e.message); }
}

async function dbGetAuditLog(limit = 50, offset = 0, entityFilter = null) {
  let q = getClient().from("audit_log").select("*")
    .eq("mess_id", messId())
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (entityFilter) q = q.eq("entity", entityFilter);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/* ── Meal Attendance (On/Off Toggle) ─────── */
async function dbGetAttendance(date) {
  const { data, error } = await getClient().from("meal_attendance")
    .select("*").eq("mess_id", messId()).eq("date", date);
  if (error) throw error;
  return data || [];
}

async function dbSetAttendance(memberId, date, dayMeal, nightMeal) {
  const { error } = await getClient().from("meal_attendance").upsert({
    mess_id: messId(), member_id: memberId, date,
    day_meal: dayMeal, night_meal: nightMeal, updated_at: new Date().toISOString(),
  }, { onConflict: "mess_id,member_id,date" });
  if (error) throw error;
}

/* ── Mess Rules ──────────────────────────── */
async function dbGetMessRules() {
  const { data, error } = await getClient().from("mess_rules")
    .select("*").eq("mess_id", messId()).maybeSingle();
  if (error) throw error;
  return data;
}

async function dbSaveMessRules(rules) {
  const { error } = await getClient().from("mess_rules").upsert({
    mess_id: messId(),
    wifi_pass:  rules.wifi_pass  || "",
    bank_info:  rules.bank_info  || "",
    rules_text: rules.rules_text || "",
    contacts:   rules.contacts   || "",
    custom:     rules.custom     || {},
    updated_at: new Date().toISOString(),
  }, { onConflict: "mess_id" });
  if (error) throw error;
}

/* ── Broadcasts ──────────────────────────── */
async function dbGetBroadcasts() {
  const { data, error } = await getClient().from("broadcasts")
    .select("*").eq("mess_id", messId())
    .order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  return (data || []).filter(b =>
    !b.expires_at || new Date(b.expires_at) > new Date()
  );
}

async function dbPostBroadcast(message, priority = "normal", expiresInHours = null) {
  const { error } = await getClient().from("broadcasts").insert({
    mess_id: messId(),
    message, priority,
    author: currentUser?.name || "Manager",
    expires_at: expiresInHours ? new Date(Date.now() + expiresInHours * 3600000).toISOString() : null,
  });
  if (error) throw error;
}

async function dbDeleteBroadcast(id) {
  const { error } = await getClient().from("broadcasts").delete().eq("id", id);
  if (error) throw error;
}

/* ── Member payments ("Give Payment" requests) ──────────────
   A member files a request (status "pending"); nothing is credited until a
   manager confirms it in Collect Payment. Read WITHOUT sanitize(): the rows are
   rendered through escapeHtml() / member lookups, so a forged member_name in
   the table can never reach innerHTML. */
async function dbCreateMemberPayment(row) {
  const { data, error } = await getClient().from("member_payments").insert({
    mess_id:       messId(),
    member_id:     row.memberId,
    member_name:   row.memberName,
    month_key:     row.monthKey,
    month:         row.month,
    year:          row.year,
    amount:        row.amount,
    due_at_submit: row.dueAtSubmit,
    status:        "pending",
  }).select("*").single();
  if (error) throw error;
  return data;
}

/* Newest first. A member passes their own id; a manager passes nothing (whole mess). */
async function dbGetMemberPayments(opts = {}) {
  let q = getClient().from("member_payments").select("*")
    .eq("mess_id", messId())
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.memberId) q = q.eq("member_id", opts.memberId);
  if (opts.status)   q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/* Atomically move a pending payment to a new status. Resolves null when it was
   already handled (another manager got there first), so a payment can never be
   applied twice. */
async function dbClaimMemberPayment(id, status, by) {
  const { data, error } = await getClient().from("member_payments")
    .update({ status, confirmed_by: by, confirmed_at: new Date().toISOString() })
    .eq("id", id).eq("mess_id", messId()).eq("status", "pending")
    .select("*").maybeSingle();
  if (error) throw error;
  return data || null;
}

async function dbFinalizeMemberPayment(id, split, stillDue) {
  const { error } = await getClient().from("member_payments")
    .update({ split, still_due: stillDue }).eq("id", id).eq("mess_id", messId());
  if (error) throw error;
}

/* Undo a claim when applying the payment failed, so it can be retried. */
async function dbReleaseMemberPayment(id) {
  await getClient().from("member_payments")
    .update({ status: "pending", confirmed_by: null, confirmed_at: null })
    .eq("id", id).eq("mess_id", messId());
}

/* ── Role check: manager OR sub_manager ──── */
function requireManagerOrSub(fnName) {
  if (!currentUser) { toast("Not authenticated", "error"); return false; }
  if (!["manager", "sub_manager", "superadmin"].includes(currentUser.role)) {
    toast("Manager access required", "error"); return false;
  }
  return true;
}
