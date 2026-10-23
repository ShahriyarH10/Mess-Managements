-- ============================================================
--  Sign-in rate limiting for the mm-auth Edge Function
--  Run in Supabase: Dashboard → SQL Editor → Run. Safe to re-run.
--  Creates one new, empty table — doesn't touch any existing data.
--
--  mm-auth records each failed sign-in here and refuses a username
--  after 5 failures in 15 minutes. Only the function (service role)
--  uses it; browsers get no access (RLS on, no policies).
-- ============================================================

create table if not exists auth_attempts (
  id         bigserial primary key,
  key        text not null,
  ok         boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_auth_attempts_key on auth_attempts (key, created_at);
alter table auth_attempts enable row level security;
revoke all on auth_attempts from anon, authenticated;

-- ---- verify ----
-- select count(*) from auth_attempts;
