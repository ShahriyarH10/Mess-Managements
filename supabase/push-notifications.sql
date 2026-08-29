-- ============================================================
--  Push notifications — schema + trigger
--  Run against the SHARED Supabase project (same one the app + web app use).
--  Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── Device tokens ──────────────────────────────────────────
-- One row per device. `token` is an Expo push token ("ExponentPushToken[..]").
create table if not exists push_tokens (
  id         uuid primary key default uuid_generate_v4(),
  mess_id    uuid references messes(id)  on delete cascade,
  member_id  uuid references members(id) on delete set null,
  token      text not null unique,
  platform   text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_push_tokens_mess   on push_tokens(mess_id);
create index if not exists idx_push_tokens_member on push_tokens(member_id);

alter table push_tokens enable row level security;
drop policy if exists "allow_anon_all" on push_tokens;
create policy "allow_anon_all" on push_tokens for all using (true) with check (true);


-- ============================================================
--  Delivery trigger  (OPTION B — alternative to a Dashboard Webhook)
--
--  If you'd rather wire delivery in the Dashboard, skip everything below and
--  create two Database Webhooks instead (see PUSH_SETUP.md step 6).
--
--  To use this trigger, set these once (SQL editor), using YOUR project ref
--  and the same secret you pass to `supabase secrets set PUSH_HOOK_SECRET`:
--
--    alter database postgres
--      set app.send_push_url    = 'https://<PROJECT-REF>.functions.supabase.co/send-push';
--    alter database postgres
--      set app.send_push_secret = '<PUSH_HOOK_SECRET value>';
-- ============================================================

create extension if not exists pg_net;

create or replace function public.tg_send_push() returns trigger
language plpgsql security definer as $$
declare
  fn_url text := current_setting('app.send_push_url', true);
  secret text := current_setting('app.send_push_secret', true);
begin
  if fn_url is null or fn_url = '' then
    return new;                       -- delivery not configured yet: no-op
  end if;
  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-push-secret', coalesce(secret, '')
               ),
    body    := jsonb_build_object('table', tg_table_name, 'record', to_jsonb(new))
  );
  return new;
end $$;

drop trigger if exists trg_send_push_broadcasts on broadcasts;
create trigger trg_send_push_broadcasts
  after insert on broadcasts
  for each row execute function public.tg_send_push();

drop trigger if exists trg_send_push_notifications on notifications;
create trigger trg_send_push_notifications
  after insert on notifications
  for each row execute function public.tg_send_push();
