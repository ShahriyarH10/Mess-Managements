-- ============================================================
--  MessManager — security lockdown
--  Replaces the open "allow_anon_all" policies with real per-mess rules.
--
--  ⚠ RUN ONLY AFTER (in this order):
--    1. supabase/functions/mm-auth is deployed with MM_JWT_SECRET set
--         supabase functions deploy mm-auth --no-verify-jwt
--    2. The web app with mm-auth sign-in is live (this repo).
--    3. The mobile app (MessManager-mobile) signs in through mm-auth too —
--       today it reads members.password directly, which this script blocks.
--    4. The old sign-session-jwt function is retired (deploy the stub or delete it).
--  Everyone must sign in again afterwards (old tokens have no app_role claim).
--
--  What it does
--    • Nothing is readable or writable without a session token from mm-auth.
--    • Each signed-in user only sees and changes rows of their own mess.
--    • members.password can't be read by any browser (mm-auth uses the service role).
--    • Manager-only actions (members, rules, fund, month close, notices…) are
--      enforced here, not just in the app.
--    • A closed (locked) month can't be changed except by the manager.
--  Safe to re-run.
-- ============================================================

-- ── Sign-in rate limiting (used only by mm-auth, via the service role) ──
create table if not exists auth_attempts (
  id         bigserial primary key,
  key        text not null,
  ok         boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_auth_attempts_key on auth_attempts (key, created_at);
alter table auth_attempts enable row level security;   -- no policies: browsers get nothing

-- ── Claims from the mm-auth session token ──
create or replace function mm_mess_id()   returns uuid language sql stable as $$ select nullif(auth.jwt()->>'mess_id','')::uuid $$;
create or replace function mm_member_id() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'member_id','')::uuid $$;
create or replace function mm_role()      returns text language sql stable as $$ select coalesce(auth.jwt()->>'app_role','') $$;
create or replace function mm_is_mgr()    returns boolean language sql stable as $$ select mm_role() = 'manager' $$;
create or replace function mm_is_staff()  returns boolean language sql stable as $$ select mm_role() in ('manager','sub_manager') $$;

-- ── Drop every existing policy on our tables (allow_anon_all, old mm_*) ──
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in (
             'messes','members','meals','bazar','rent','utility_payments','announcements','chores',
             'notifications','member_payments','meal_attendance','mess_rules','broadcasts',
             'audit_log','push_tokens')
  loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- ── No anonymous access at all; signed-in users go through the policies below ──
do $$
declare t text;
begin
  foreach t in array array['messes','members','meals','bazar','rent','utility_payments','announcements','chores',
                           'notifications','member_payments','meal_attendance','mess_rules','broadcasts','audit_log','push_tokens']
  loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- members.password: never readable from a browser (column privileges apply on top of RLS)
revoke select on members from authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'members' and column_name <> 'password';
  execute format('grant select (%s) on members to authenticated', cols);
end $$;

-- ════════════════════ MESSES ════════════════════
create policy mm_messes_read  on messes for select using (id = mm_mess_id());
create policy mm_messes_write on messes for update using ((id = mm_mess_id() and mm_is_mgr()))
                                         with check ((id = mm_mess_id() and mm_is_mgr()));
-- new messes are created by mm-auth (service role) — no insert or delete policy

-- ════════════════════ MEMBERS ════════════════════
create policy mm_members_read on members for select using (mess_id = mm_mess_id());
create policy mm_members_ins  on members for insert with check ((mess_id = mm_mess_id() and mm_is_mgr()));
create policy mm_members_upd  on members for update using ((mess_id = mm_mess_id() and mm_is_mgr()))
                                                    with check ((mess_id = mm_mess_id() and mm_is_mgr()));
create policy mm_members_del  on members for delete using ((mess_id = mm_mess_id() and mm_is_mgr()));
-- members change their own password through mm-auth (it checks the current one)

-- ════════════ SHARED DATA — every member of the mess may read and write ════════════
-- (members log their own meals, bazar, rent/utility and day-offs directly)
do $$
declare t text;
begin
  foreach t in array array['meals','bazar','rent','utility_payments','meal_attendance','push_tokens']
  loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('create policy mm_%1$s_all on %1$I for all using (mess_id = mm_mess_id())
                    with check (mess_id = mm_mess_id())', t);
  end loop;
end $$;

-- ════════════ MANAGER-WRITTEN — everyone reads, staff/manager write ════════════
create policy mm_broadcasts_read on broadcasts for select using (mess_id = mm_mess_id());
create policy mm_broadcasts_write on broadcasts for all using ((mess_id = mm_mess_id() and mm_is_staff()))
                                               with check ((mess_id = mm_mess_id() and mm_is_staff()));
create policy mm_mess_rules_read on mess_rules for select using (mess_id = mm_mess_id());
create policy mm_mess_rules_write on mess_rules for all using ((mess_id = mm_mess_id() and mm_is_mgr()))
                                               with check ((mess_id = mm_mess_id() and mm_is_mgr()));
do $$
declare t text;
begin
  foreach t in array array['announcements','chores'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('create policy mm_%1$s_read on %1$I for select using (mess_id = mm_mess_id())', t);
    execute format('create policy mm_%1$s_write on %1$I for all using ((mess_id = mm_mess_id() and mm_is_staff()))
                    with check ((mess_id = mm_mess_id() and mm_is_staff()))', t);
  end loop;
end $$;

-- ════════════ NOTIFICATIONS — members post updates, staff mark them seen ════════════
create policy mm_notif_read on notifications for select using (mess_id = mm_mess_id());
create policy mm_notif_ins  on notifications for insert with check (mess_id = mm_mess_id());
create policy mm_notif_upd  on notifications for update using ((mess_id = mm_mess_id() and mm_is_staff()))
                                                       with check (mess_id = mm_mess_id());
create policy mm_notif_del  on notifications for delete using ((mess_id = mm_mess_id() and mm_is_staff()));

-- ════════════ RECEIPTS (member_payments) ════════════
-- Everyone in the mess can read (members only ever open their own in the app);
-- a member may file a pending request for themselves or record their own payment;
-- only staff confirm / reject / reverse.
create policy mm_mp_read on member_payments for select using (mess_id = mm_mess_id());
create policy mm_mp_ins  on member_payments for insert with check (
  (mess_id = mm_mess_id() and (mm_is_staff() or member_id = mm_member_id())));
create policy mm_mp_upd  on member_payments for update using ((mess_id = mm_mess_id() and mm_is_staff()))
                                                       with check (mess_id = mm_mess_id());
create policy mm_mp_del  on member_payments for delete using ((mess_id = mm_mess_id() and mm_is_mgr()));

-- ════════════ AUDIT LOG — append-only; staff read ════════════
create policy mm_audit_read on audit_log for select using ((mess_id = mm_mess_id() and mm_is_staff()));
create policy mm_audit_ins  on audit_log for insert with check (mess_id = mm_mess_id());

-- ════════════ MONTH CLOSE — enforced in the database ════════════
-- A month is closed when utility_payments.bills.locked is true for its month_key.
-- Only the manager may change anything in a closed month, and only
-- the manager may lock or unlock.
create or replace function mm_month_locked(p_mess uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (bills->>'locked')::boolean from utility_payments
                   where mess_id = p_mess and month_key = p_key limit 1), false)
$$;

create or replace function mm_guard_closed_month() returns trigger
language plpgsql as $$
declare k text; r record;
begin
  if mm_is_mgr() or auth.role() = 'service_role' then
    return coalesce(new, old);
  end if;
  r := coalesce(new, old);
  k := case when tg_table_name in ('meals','bazar') then to_char(r.date, 'YYYY-MM') else r.month_key end;
  if mm_month_locked(r.mess_id, k) then
    raise exception 'This month (%) is closed — ask the manager to unlock it', k using errcode = '42501';
  end if;
  if tg_table_name = 'utility_payments' and (
       (tg_op = 'UPDATE' and coalesce((old.bills->>'locked')::boolean, false) is distinct from coalesce((new.bills->>'locked')::boolean, false))
    or (tg_op = 'INSERT' and coalesce((new.bills->>'locked')::boolean, false))) then
    raise exception 'Only the manager can close or reopen a month' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['meals','bazar','rent','utility_payments'] loop
    execute format('drop trigger if exists mm_closed_month on %I', t);
    execute format('create trigger mm_closed_month before insert or update or delete on %I
                    for each row execute function mm_guard_closed_month()', t);
  end loop;
end $$;

-- ---- verify ----
-- select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1, 2;
-- As a signed-out browser, every table should now return [] or a permission error.

-- The superadmin role was removed; drop its helper if an earlier run created it.
drop function if exists mm_is_admin();
