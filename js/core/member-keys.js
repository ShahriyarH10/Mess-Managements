/* ═══════════════════════════════════════════════
   CORE — Member keys: records are stored by member ID, used by name

   meals, bazar, rent and utility_payments hold one entry per member. They are
   STORED under the member's id (members.id), so renaming someone never touches
   their history and a former member's records still know who they belong to.

   The pages work with names (m.name) as they always have. This module sits
   between them and the database client and translates:
     write  → name keys become ids     ({"Rakib_day": 1}  → {"<uuid>_day": 1})
     read   → id keys become the member's current name

   Keys it cannot match are passed through untouched, so records written before
   supabase/member-id-keys.sql ran (or for members deleted before archiving
   existed) still read exactly as before. Nothing is ever dropped.

   Translated fields:
     meals.meals                    { key | key_day | key_night: number }
     bazar.bazar                    { key: amount }
     rent.entries                   [{ name, member_id, ... }]  (name kept as a readable copy)
     utility_payments.payments      { key: { paid, ... } }
     utility_payments.bills.pending_change / mess_credit / change_credit   { key: amount }
   ═══════════════════════════════════════════════ */
const MemberKeys = (() => {
  // Directory of every member of the loaded mess, former members included.
  // Names are held in the same (HTML-escaped) form as the in-memory members[].
  let dirMess = null;
  let nameById = new Map();
  let idByExact = new Map();   // exact spelling (escaped or plain) → id
  let idByNorm  = new Map();   // trimmed / lower-cased → id, or AMBIGUOUS
  const AMBIGUOUS = "";

  const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const unescape = (s) => String(s ?? "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const MEAL_SUFFIX = /^(.*)(_day|_night)$/;

  /* Same matching as supabase/member-id-keys.sql: an exact spelling first; a loose
     match (case / spacing) only when it fits exactly one member. Active members win
     a clash with a former member; any other clash matches nobody (key left alone). */
  function setDirectory(messIdValue, rows) {
    dirMess = messIdValue || null;
    nameById = new Map(); idByExact = new Map(); idByNorm = new Map();
    const active = new Set();
    const ordered = [...(rows || [])].sort((a, b) => (a.left_at ? 1 : 0) - (b.left_at ? 1 : 0));
    const add = (map, key, id) => {
      if (!key) return;
      const prev = map.get(key);
      if (prev === undefined) map.set(key, id);
      else if (prev !== id && !(active.has(prev) && !active.has(id))) map.set(key, AMBIGUOUS);
    };
    ordered.forEach(m => {
      if (!m || !m.id) return;
      const id = String(m.id);
      if (!m.left_at) active.add(id);
      nameById.set(id, m.name);
      [m.name, unescape(m.name)].forEach(n => { add(idByExact, n, id); add(idByNorm, norm(n), id); });
    });
  }
  function clear() { dirMess = null; nameById = new Map(); idByExact = new Map(); idByNorm = new Map(); }

  // Only translate for the mess the directory was built for
  const ready = () => {
    if (!dirMess) return false;
    try { return currentMess?.id === dirMess; } catch (_) { return false; }
  };

  function idFor(name) {
    const exact = idByExact.get(String(name ?? ""));
    if (exact !== undefined) return exact || null;
    return idByNorm.get(norm(name)) || null;
  }
  const isExactName = (k) => !!idByExact.get(k) || !!idByExact.get(MEAL_SUFFIX.exec(k)?.[1]);
  const nameFor = (id) => nameById.get(String(id)) ?? null;
  const isKnownId = (k) => nameById.has(String(k));

  /* ── key maps ── */
  // fn(key) → translated key, or the key itself when there's no match
  const toId   = (k) => idFor(k) || k;
  const toName = (k) => (isKnownId(k) ? nameFor(k) : k);

  function translateKey(k, fn, mealSuffix) {
    if (mealSuffix) {
      const m = MEAL_SUFFIX.exec(k);
      if (m) { const base = fn(m[1]); if (base !== m[1]) return base + m[2]; }
    }
    return fn(k);
  }
  // Stored under an id (with or without the _day/_night suffix)
  const storedById = (k) => isKnownId(k) || isKnownId(MEAL_SUFFIX.exec(k)?.[1]);

  /* Two keys can land on the same member only when a row holds a legacy name key
     next to that member's id key (or two spellings of one name). Nothing is dropped:
       read  → the id-keyed value is used; a clashing legacy key keeps its own spelling
       write → the exact spelling wins; the other is written back under its original key */
  function mapKeys(obj, fn, mealSuffix, dir) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
    const keys = Object.keys(obj);
    // the entry that should win a clash goes first: id-keyed (read) / exact spelling (write)
    const wins = dir === "read" ? storedById : isExactName;
    keys.sort((a, b) => (wins(b) ? 1 : 0) - (wins(a) ? 1 : 0));
    const out = {};
    keys.forEach(k => {
      const nk = translateKey(k, fn, mealSuffix);
      if (!(nk in out)) { out[nk] = obj[k]; return; }
      if (!(k in out)) { out[k] = obj[k]; return; }
      console.warn(`[member-keys] "${k}" duplicates "${nk}" in one record — kept the id-keyed value`);
    });
    return out;
  }
  const readMap  = (obj, meal) => mapKeys(obj, toName, meal, "read");
  const writeMap = (obj, meal) => mapKeys(obj, toId, meal, "write");

  const BILL_MAPS = ["pending_change", "mess_credit", "change_credit"];
  function mapBills(bills, dir) {
    if (!bills || typeof bills !== "object" || Array.isArray(bills)) return bills;
    const out = { ...bills };
    BILL_MAPS.forEach(k => { if (k in out) out[k] = dir === "write" ? writeMap(out[k], false) : readMap(out[k], false); });
    return out;
  }

  function mapEntries(entries, dir) {
    if (!Array.isArray(entries)) return entries;
    return entries.map(e => {
      if (!e || typeof e !== "object") return e;
      if (dir === "write") {
        const id = (e.member_id && isKnownId(e.member_id)) ? String(e.member_id) : idFor(e.name);
        return id ? { ...e, member_id: id, name: nameFor(id) ?? e.name } : e;
      }
      return (e.member_id && isKnownId(e.member_id)) ? { ...e, name: nameFor(e.member_id) } : e;
    });
  }

  /* ── per-table row translation ── */
  const TABLES = {
    meals:            (r, d) => { if ("meals" in r)    r.meals    = d === "write" ? writeMap(r.meals, true) : readMap(r.meals, true); },
    bazar:            (r, d) => { if ("bazar" in r)    r.bazar    = d === "write" ? writeMap(r.bazar, false) : readMap(r.bazar, false); },
    rent:             (r, d) => { if ("entries" in r)  r.entries  = mapEntries(r.entries, d); },
    utility_payments: (r, d) => {
      if ("payments" in r) r.payments = d === "write" ? writeMap(r.payments, false) : readMap(r.payments, false);
      if ("bills" in r)    r.bills    = mapBills(r.bills, d);
    },
  };

  function translateRows(table, data, dir) {
    if (!ready() || data == null) return data;
    const one = (row) => {
      if (!row || typeof row !== "object") return row;
      const copy = { ...row };            // never mutate the caller's objects
      TABLES[table](copy, dir);
      return copy;
    };
    return Array.isArray(data) ? data.map(one) : one(data);
  }

  /* ── client wrapper ── */
  const WRITES = new Set(["insert", "upsert", "update"]);

  // Wraps a query builder (or anything it returns that is itself a builder).
  function wrapBuilder(builder, table) {
    return new Proxy(builder, {
      get(target, prop) {
        if (prop === "then") {
          return (resolve, reject) => target.then(
            (res) => (res && res.data != null ? { ...res, data: translateRows(table, res.data, "read") } : res)
          ).then(resolve, reject);
        }
        const value = Reflect.get(target, prop, target);
        if (typeof value !== "function") return value;
        return (...args) => {
          if (WRITES.has(prop) && args.length) args[0] = translateRows(table, args[0], "write");
          const out = value.apply(target, args);
          // filters/modifiers return the builder (thenable): keep translating down the chain
          return out && typeof out === "object" && typeof out.then === "function" ? wrapBuilder(out, table) : out;
        };
      },
    });
  }

  const RAW = Symbol("rawClient");
  function wrap(client) {
    if (!client || client[RAW]) return client;
    return new Proxy(client, {
      get(target, prop) {
        if (prop === RAW) return target;
        if (prop === "from") {
          return (table) => {
            const qb = target.from(table);
            return TABLES[table] ? wrapBuilder(qb, table) : qb;
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
  // The untranslated client: sees exactly what is stored (used to move legacy name keys)
  const raw = (client) => (client && client[RAW]) || client;

  return { setDirectory, clear, wrap, raw, idFor, nameFor, translateRows, unescape };
})();
