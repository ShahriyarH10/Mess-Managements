/* ═══════════════════════════════════════════════
   DEMO — In-memory stand-in for the Supabase client

   Implements the small slice of the PostgREST query-builder API this app
   uses (select / insert / update / upsert / delete, eq / neq / gt / gte / lt /
   lte / in, order / range / limit, single / maybeSingle, count + head, and the
   `messes(*)` embed). Every call is served from a plain JS object — nothing
   leaves the browser. The store is mirrored to sessionStorage so a refresh keeps
   what you created; closing the tab (or "Reset demo data") discards it.
   ═══════════════════════════════════════════════ */
(function () {
  "use strict";

  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const nowIso = () => new Date().toISOString();
  const uid = () =>
    (self.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : "d-" + Math.random().toString(36).slice(2) + Date.now().toString(36);

  // Mirrors the unique(...) constraints from database.sql
  const UNIQUE = {
    // Stricter than the real schema (unique per mess): the sign-in form looks users up by
    // username alone, so a demo-wide unique username keeps every login unambiguous.
    members:         ["username"],
    meals:           ["mess_id", "date"],
    bazar:           ["mess_id", "date"],
    rent:            ["mess_id", "month_key"],
    utility_payments:["mess_id", "month_key"],
    meal_attendance: ["mess_id", "member_id", "date"],
    mess_rules:      ["mess_id"],
  };

  // Column defaults from database.sql
  const DEFAULTS = {
    members:       () => ({ role: "member", room: "", rent: 0, phone: "" }),
    announcements: () => ({ pinned: false }),
    chores:        () => ({ assignee: "", frequency: "daily", status: "pending" }),
    notifications: () => ({ status: "pending", note: "" }),
    member_payments: () => ({ status: "pending", split: null, still_due: null, confirmed_by: null, confirmed_at: null }),
    broadcasts:    () => ({ priority: "normal", pinned: false }),
    meals:         () => ({ meals: {} }),
    bazar:         () => ({ bazar: {}, utility: {} }),
  };

  // Embedded relations (`select("*, messes(*)")`) → foreign key on the child row
  const RELATIONS = { messes: "mess_id" };

  const err = (message, code) => ({ data: null, error: { message, code: code || "DEMO" } });

  /* Split "a, b, rel(*)" on top-level commas */
  function splitCols(cols) {
    const out = []; let depth = 0, cur = "";
    for (const ch of String(cols || "*")) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  class Query {
    constructor(db, table, onChange) {
      this.db = db; this.table = table; this.onChange = onChange;
      this.op = "select";
      this.cols = "*"; this.count = null; this.head = false; this.returning = false;
      this.filters = []; this.orders = [];
      this.from = null; this.to = null; this.max = null;
      this.mode = null;            // "single" | "maybeSingle"
      this.payload = null; this.opts = {};
    }

    /* ── verbs ── */
    select(cols = "*", opts = {}) {
      this.cols = cols;
      if (this.op === "select") { this.count = opts.count || null; this.head = !!opts.head; }
      else this.returning = true;
      return this;
    }
    insert(rows)            { this.op = "insert"; this.payload = rows; return this; }
    update(patch)           { this.op = "update"; this.payload = patch; return this; }
    upsert(rows, opts = {}) { this.op = "upsert"; this.payload = rows; this.opts = opts; return this; }
    delete()                { this.op = "delete"; return this; }

    /* ── filters ── */
    _f(fn)       { this.filters.push(fn); return this; }
    eq(c, v)     { return this._f(r => r[c] === v); }
    neq(c, v)    { return this._f(r => r[c] !== v); }
    gt(c, v)     { return this._f(r => r[c] > v); }
    gte(c, v)    { return this._f(r => r[c] >= v); }
    lt(c, v)     { return this._f(r => r[c] < v); }
    lte(c, v)    { return this._f(r => r[c] <= v); }
    in(c, list)  { return this._f(r => list.includes(r[c])); }
    is(c, v)     { return this._f(r => (v === null ? r[c] == null : r[c] === v)); }

    /* ── modifiers ── */
    order(col, { ascending = true } = {}) { this.orders.push({ col, ascending }); return this; }
    range(a, b)   { this.from = a; this.to = b; return this; }
    limit(n)      { this.max = n; return this; }
    single()      { this.mode = "single"; return this; }
    maybeSingle() { this.mode = "maybeSingle"; return this; }

    /* ── thenable: `await query` runs it ── */
    then(resolve, reject) {
      return Promise.resolve().then(() => this._run()).then(resolve, reject);
    }

    _rows() {
      if (!this.db[this.table]) this.db[this.table] = [];
      return this.db[this.table];
    }

    _matching() { return this._rows().filter(r => this.filters.every(f => f(r))); }

    _project(rows) {
      const parts = splitCols(this.cols);
      const all = parts.includes("*");
      return rows.map(r => {
        const out = {};
        if (all) Object.assign(out, r);
        for (const p of parts) {
          if (p === "*") continue;
          const rel = /^(\w+)\((.*)\)$/.exec(p);
          if (rel) {
            const fk = RELATIONS[rel[1]];
            out[rel[1]] = fk ? (this.db[rel[1]] || []).find(x => x.id === r[fk]) || null : null;
          } else out[p] = r[p];
        }
        return clone(out);
      });
    }

    _shape(rows, extra = {}) {
      if (this.mode === "single") {
        if (rows.length !== 1) return err("JSON object requested, multiple (or no) rows returned", "PGRST116");
        return { data: rows[0], error: null, ...extra };
      }
      if (this.mode === "maybeSingle") {
        if (rows.length > 1) return err("Multiple rows returned", "PGRST116");
        return { data: rows[0] || null, error: null, ...extra };
      }
      return { data: rows, error: null, ...extra };
    }

    _insertOne(row) {
      const rows = this._rows();
      const rec = Object.assign({ id: uid(), created_at: nowIso() },
        (DEFAULTS[this.table] || (() => ({})))(), clone(row));
      const keys = UNIQUE[this.table];
      if (keys && rows.some(x => keys.every(k => x[k] === rec[k]))) {
        return { error: { message: `duplicate key value violates unique constraint on ${this.table}`, code: "23505" } };
      }
      // `receipt_no bigint generated always as identity`
      if (this.table === "member_payments") rec.receipt_no = rows.reduce((mx, x) => Math.max(mx, x.receipt_no || 0), 0) + 1;
      rows.push(rec);
      return { rec };
    }

    _run() {
      const rows = this._rows();

      if (this.op === "select") {
        let list = this._matching();
        const total = list.length;
        for (const { col, ascending } of [...this.orders].reverse()) {
          list = [...list].sort((a, b) => {
            const x = a[col], y = b[col];
            if (x == null && y == null) return 0;
            if (x == null) return 1;
            if (y == null) return -1;
            return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
          });
        }
        if (this.from != null) list = list.slice(this.from, this.to + 1);
        if (this.max != null) list = list.slice(0, this.max);
        const extra = this.count ? { count: total } : {};
        if (this.head) return { data: null, error: null, ...extra };
        return this._shape(this._project(list), extra);
      }

      if (this.op === "insert" || this.op === "upsert") {
        const input = Array.isArray(this.payload) ? this.payload : [this.payload];
        const done = [];
        for (const row of input) {
          if (this.op === "upsert") {
            const keys = String(this.opts.onConflict || "id").split(",").map(s => s.trim());
            const hit = rows.find(x => keys.every(k => x[k] === row[k]));
            if (hit) { Object.assign(hit, clone(row)); done.push(hit); continue; }
          }
          const res = this._insertOne(row);
          if (res.error) return { data: null, error: res.error };
          done.push(res.rec);
        }
        this.onChange && this.onChange();
        if (!this.returning) return { data: null, error: null };
        return this._shape(this._project(done));
      }

      if (this.op === "update") {
        const hit = this._matching();
        hit.forEach(r => Object.assign(r, clone(this.payload)));
        this.onChange && this.onChange();
        if (!this.returning) return { data: null, error: null };
        return this._shape(this._project(hit));
      }

      if (this.op === "delete") {
        const hit = new Set(this._matching());
        this.db[this.table] = rows.filter(r => !hit.has(r));
        // Emulate ON DELETE CASCADE for the relations that matter
        hit.forEach(r => {
          if (this.table === "messes") {
            Object.keys(this.db).forEach(t => { this.db[t] = this.db[t].filter(x => x.mess_id !== r.id); });
          } else if (this.table === "members") {
            this.db.meal_attendance = (this.db.meal_attendance || []).filter(x => x.member_id !== r.id);
            this.db.notifications   = (this.db.notifications   || []).filter(x => x.from_id   !== r.id);
            this.db.member_payments = (this.db.member_payments || []).filter(x => x.member_id !== r.id);
          }
        });
        this.onChange && this.onChange();
        return { data: null, error: null };
      }

      return err("Unsupported operation: " + this.op);
    }
  }

  /* ── persistence: sessionStorage, debounced; every access guarded ── */
  const STORE_KEY = "mm_demo_db";
  let saveTimer = null;
  function persist(db) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => flush(db), 150);
    if (!persist.bound) { persist.bound = true; addEventListener("pagehide", () => flush(persist.db)); }
    persist.db = db;
  }
  function flush(db) {
    if (!db) return;
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (_) { /* quota / blocked: still works in memory */ }
  }
  function load() {
    try { const raw = sessionStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
  }
  function clear() { clearTimeout(saveTimer); persist.db = null; try { sessionStorage.removeItem(STORE_KEY); } catch (_) {} }

  function createClient(db) {
    const onChange = () => persist(db);
    return {
      from: (table) => new Query(db, table, onChange),
      rpc: async () => err("rpc is not available in demo mode"),
      isDemo: true,
    };
  }

  window.MMDemo = Object.assign(window.MMDemo || {}, { createClient, load, clear });
})();
