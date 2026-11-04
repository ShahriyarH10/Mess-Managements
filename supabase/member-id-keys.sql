-- ============================================================
--  Member records by ID  +  archive instead of delete
--  Run in Supabase: Dashboard → SQL Editor → Run. Safe to re-run.
--
--  WHAT IT DOES
--   1. members.left_at — removing a member now ARCHIVES them (sets left_at)
--      instead of deleting the row. A delete used to cascade away their
--      receipts (member_payments) and meal on/off history (meal_attendance).
--   2. member_key_backup — a full copy of every meals / bazar / rent /
--      utility_payments row, taken BEFORE anything is converted. The first
--      run's copy is kept forever; re-running never overwrites it.
--   3. Converts the per-member keys in those rows from the member's NAME to
--      the member's ID (members.id):
--        meals.meals        {"Rakib_day": 1}       → {"<id>_day": 1}
--        bazar.bazar        {"Rakib": 850}         → {"<id>": 850}
--        utility_payments.payments, bills.pending_change / mess_credit / change_credit
--        rent.entries       [{"name": "Rakib"}]    → [{"name": "Rakib", "member_id": "<id>"}]
--
--  NOTHING IS DELETED
--   • Every row is backed up first (step 2).
--   • A key is matched to a member by its exact spelling first, then loosely
--     (ignoring case and extra spaces) only if that fits exactly one member.
--     A key that matches no member (e.g. someone deleted before this change)
--     or more than one is LEFT EXACTLY AS IT IS. The app still reads
--     those name keys, and the meal rate still counts them.
--   • If two keys in one row belong to the same member (e.g. "Rakib" and
--     "rakib "), the exact spelling is converted — the one the app has been
--     using — and the other is left under its original key.
--   • Rent entries keep their "name" — member_id is added next to it.
--
--  ORDER: deploy the new app version (it reads both name and id keys), then run
--  this script, then redeploy mm-auth (it refuses archived members).
--
--  UNDO: see the bottom of this file.
-- ============================================================

begin;

-- ── 1. Archive instead of delete ────────────────────────
alter table members add column if not exists left_at date;

-- security-lockdown.sql grants members column-by-column (to hide password);
-- a new column needs its own grant or the app can't read it.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select (left_at) on members to authenticated';
  end if;
end $$;

-- ── 2. Backup (before any conversion) ───────────────────
create table if not exists member_key_backup (
  id            bigserial primary key,
  source_table  text        not null,
  row_id        uuid        not null,
  mess_id       uuid,
  original      jsonb       not null,       -- the whole row, as it was
  backed_up_at  timestamptz not null default now(),
  unique (source_table, row_id)
);
-- No policies: browsers can't read or change the backup; the SQL editor (service role) can.
alter table member_key_backup enable row level security;

insert into member_key_backup (source_table, row_id, mess_id, original)
  select 'meals', t.id, t.mess_id, to_jsonb(t) from meals t
  on conflict (source_table, row_id) do nothing;
insert into member_key_backup (source_table, row_id, mess_id, original)
  select 'bazar', t.id, t.mess_id, to_jsonb(t) from bazar t
  on conflict (source_table, row_id) do nothing;
insert into member_key_backup (source_table, row_id, mess_id, original)
  select 'rent', t.id, t.mess_id, to_jsonb(t) from rent t
  on conflict (source_table, row_id) do nothing;
insert into member_key_backup (source_table, row_id, mess_id, original)
  select 'utility_payments', t.id, t.mess_id, to_jsonb(t) from utility_payments t
  on conflict (source_table, row_id) do nothing;

-- ── 3. Conversion helpers ───────────────────────────────
-- The app has written keys both as the plain name and HTML-escaped ("O&#39;Neil").
create or replace function mm_escape_html(t text) returns text
language sql immutable as $$
  select replace(replace(replace(replace(replace(coalesce(t, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;

create or replace function mm_norm_name(t text) returns text
language sql immutable as $$
  select lower(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')))
$$;

-- The one member of this mess a stored key refers to, or null (no match / ambiguous).
-- An exact spelling wins; a loose match (case / spacing) only if it fits one member.
-- (Same rules as js/core/member-keys.js.)
create or replace function mm_member_id_for(p_mess uuid, p_key text) returns uuid
language plpgsql stable as $$
declare ids uuid[];
begin
  if p_key is null or btrim(p_key) = '' then return null; end if;
  select array_agg(distinct id) into ids from members
   where mess_id = p_mess and (name = p_key or mm_escape_html(name) = p_key);
  if ids is not null then
    return case when array_length(ids, 1) = 1 then ids[1] end;
  end if;
  select array_agg(distinct id) into ids from members
   where mess_id = p_mess
     and (mm_norm_name(name) = mm_norm_name(p_key) or mm_norm_name(mm_escape_html(name)) = mm_norm_name(p_key));
  if ids is null or array_length(ids, 1) <> 1 then return null; end if;
  return ids[1];
end $$;

-- Re-key a { key: value } object. p_meal: also handle key_day / key_night.
create or replace function mm_rekey(p_mess uuid, p_obj jsonb, p_meal boolean) returns jsonb
language plpgsql stable as $$
declare
  k text; v jsonb; base text; suffix text; mid uuid; nk text;
  out jsonb := '{}'::jsonb;
begin
  if p_obj is null or jsonb_typeof(p_obj) <> 'object' then return p_obj; end if;
  -- Order decides who wins when two keys belong to one member:
  --   1. keys already stored by id (a legacy name key can never displace them)
  --   2. keys spelled exactly like the member's name (what the app matched first),
  --      ahead of looser spellings such as "rakib " — the loser keeps its own key
  for k, v in select key, value from jsonb_each(p_obj)
               order by (key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}') desc,
                        exists (select 1 from members mm where mm.mess_id = p_mess
                                  and (mm.name = key or mm_escape_html(mm.name) = key
                                       or (p_meal and (mm.name = regexp_replace(key, '_(day|night)$', '')
                                                       or mm_escape_html(mm.name) = regexp_replace(key, '_(day|night)$', ''))))) desc,
                        key loop
    mid := null; suffix := '';
    if p_meal and k ~ '_(day|night)$' then
      base   := regexp_replace(k, '_(day|night)$', '');
      suffix := substring(k from '(_(day|night))$');
      mid    := mm_member_id_for(p_mess, base);
    end if;
    if mid is null then suffix := ''; mid := mm_member_id_for(p_mess, k); end if;
    nk := case when mid is null then k else mid::text || suffix end;
    if out ? nk then nk := k; end if;          -- clash with this member's id key: keep the original key
    out := out || jsonb_build_object(nk, v);
  end loop;
  return out;
end $$;

create or replace function mm_rekey_bills(p_mess uuid, p_bills jsonb) returns jsonb
language plpgsql stable as $$
declare f text; b jsonb := p_bills;
begin
  if b is null or jsonb_typeof(b) <> 'object' then return b; end if;
  foreach f in array array['pending_change', 'mess_credit', 'change_credit'] loop
    if b ? f then b := jsonb_set(b, array[f], mm_rekey(p_mess, b -> f, false)); end if;
  end loop;
  return b;
end $$;

-- Rent entries: add member_id beside the name (the name stays as a readable copy)
create or replace function mm_rekey_entries(p_mess uuid, p_entries jsonb) returns jsonb
language sql stable as $$
  select case when p_entries is null or jsonb_typeof(p_entries) <> 'array' then p_entries
  else coalesce((
    select jsonb_agg(
      case
        when jsonb_typeof(e) <> 'object' or e ? 'member_id' then e
        when mm_member_id_for(p_mess, e ->> 'name') is null then e
        else e || jsonb_build_object('member_id', mm_member_id_for(p_mess, e ->> 'name'))
      end order by ord)
    from jsonb_array_elements(p_entries) with ordinality as x(e, ord)
  ), '[]'::jsonb) end
$$;

-- ── 4. Convert ──────────────────────────────────────────
update meals set meals = mm_rekey(mess_id, meals, true)
 where meals is distinct from mm_rekey(mess_id, meals, true);

update bazar set bazar = mm_rekey(mess_id, bazar, false)
 where bazar is distinct from mm_rekey(mess_id, bazar, false);

update rent set entries = mm_rekey_entries(mess_id, entries)
 where entries is distinct from mm_rekey_entries(mess_id, entries);

update utility_payments
   set payments = mm_rekey(mess_id, payments, false),
       bills    = mm_rekey_bills(mess_id, bills)
 where payments is distinct from mm_rekey(mess_id, payments, false)
    or bills    is distinct from mm_rekey_bills(mess_id, bills);

commit;

-- ---- verify ----
-- Rows backed up per table (should equal the row counts of each table):
--   select source_table, count(*) from member_key_backup group by 1;
-- Keys still stored by name (members deleted before this change, or ambiguous names):
--   select m.date, k from meals m, jsonb_object_keys(m.meals) k
--    where k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_day|_night)?$'
--    order by 1 desc limit 50;

-- ---- UNDO (puts every row back exactly as backed up) ----
-- Edits made in the app after the migration are lost for the rows restored, and the
-- app keeps writing new rows by id — so only do this together with rolling the app back.
--   update meals t set meals = b.original -> 'meals'
--     from member_key_backup b where b.source_table = 'meals' and b.row_id = t.id;
--   update bazar t set bazar = b.original -> 'bazar'
--     from member_key_backup b where b.source_table = 'bazar' and b.row_id = t.id;
--   update rent t set entries = b.original -> 'entries'
--     from member_key_backup b where b.source_table = 'rent' and b.row_id = t.id;
--   update utility_payments t set payments = b.original -> 'payments', bills = b.original -> 'bills'
--     from member_key_backup b where b.source_table = 'utility_payments' and b.row_id = t.id;
