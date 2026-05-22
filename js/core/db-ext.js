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

/* ── Role check: manager OR sub_manager ──── */
function requireManagerOrSub(fnName) {
  if (!currentUser) { toast("Not authenticated", "error"); return false; }
  if (!["manager", "sub_manager", "superadmin"].includes(currentUser.role)) {
    toast("Manager access required", "error"); return false;
  }
  return true;
}
