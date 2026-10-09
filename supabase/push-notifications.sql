-- ============================================================
--  Push notifications — schema + delivery trigger
--  Run against the SHARED Supabase project. Dashboard → SQL Editor → Run.
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
--  Delivery trigger — calls the send-push edge function on every
--  INSERT into notifications / broadcasts.
--
--  Use this INSTEAD of Dashboard "Database Webhooks" (which have been flaky
--  here). It is self-contained: nothing else to configure.
--
--  Needs the pg_net extension. If `create extension pg_net` errors, enable it
--  first: Dashboard → Database → Extensions → search "pg_net" → toggle on.
-- ============================================================

create extension if not exists pg_net;

create or replace function public.tg_send_push() returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url     := 'https://lrzotklutnyzcadutgwf.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_publishable__22c2PXW3UFp8RGF_C1rpQ_uvcyFXnb'
    ),
    body    := jsonb_build_object(
      'type',   'INSERT',
      'table',  tg_table_name,
      'record', to_jsonb(new)
    )
  );
  return new;
end $$;

drop trigger if exists trg_send_push_notifications on public.notifications;
create trigger trg_send_push_notifications
  after insert on public.notifications
  for each row execute function public.tg_send_push();

drop trigger if exists trg_send_push_broadcasts on public.broadcasts;
create trigger trg_send_push_broadcasts
  after insert on public.broadcasts
  for each row execute function public.tg_send_push();

-- ---- verify it's wired ----
-- select tgname, tgrelid::regclass from pg_trigger where tgname like 'trg_send_push%';
