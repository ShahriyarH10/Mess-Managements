-- ═══════════════════════════════════════════════════════
-- MessManager · Production Database Schema v3
-- Run the DROP section first, then the rest
-- ═══════════════════════════════════════════════════════

-- ── EXTENSIONS ─────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── MESSES ─────────────────────────────────────────────
-- No admin columns — manager is just a member with role='manager'
create table if not exists messes (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  location   text default '',
  created_at timestamptz default now()
);

-- ── MEMBERS ────────────────────────────────────────────
-- role = 'manager' | 'member'
-- Only ONE member per mess can have role = 'manager' at a time
-- The mess creator is inserted as the first member with role='manager'
create table if not exists members (
  id         uuid primary key default uuid_generate_v4(),
  mess_id    uuid references messes(id) on delete cascade,
  name       text not null,
  username   text not null,
  password   text not null,
  role       text not null default 'member',
  room       text default '',
  rent       numeric default 0,
  phone      text default '',
  joined     date,
  created_at timestamptz default now(),
  unique(mess_id, username)
);

-- ── MEALS ──────────────────────────────────────────────
-- meals column is a JSON object:
-- { "MemberName_day": 1, "MemberName_night": 1, "MemberName": 2 }
create table if not exists meals (
  id         uuid primary key default uuid_generate_v4(),
  mess_id    uuid references messes(id) on delete cascade,
  date       date not null,
  meals      jsonb not null default '{}',
  created_at timestamptz default now(),
  unique(mess_id, date)
);

-- ── BAZAR ──────────────────────────────────────────────
-- bazar column is a JSON object:
-- { "MemberName": 850 }
create table if not exists bazar (
  id         uuid primary key default uuid_generate_v4(),
  mess_id    uuid references messes(id) on delete cascade,
  date       date not null,
  bazar      jsonb not null default '{}',
  utility    jsonb default '{}',
  created_at timestamptz default now(),
  unique(mess_id, date)
);

-- ── RENT ───────────────────────────────────────────────
-- entries is a JSON array:
-- [{ name, rent, paid, status, notes }]
-- status = 'paid' | 'partial' | 'unpaid'
create table if not exists rent (
  id         uuid primary key default uuid_generate_v4(),
  mess_id    uuid references messes(id) on delete cascade,
  month_key  text not null,   -- format: 'YYYY-MM'
  month      integer not null, -- 0-11
  year       integer not null,
  month_name text not null,
  entries    jsonb not null default '[]',
  created_at timestamptz default now(),
  unique(mess_id, month_key)
);

-- ── UTILITY PAYMENTS ───────────────────────────────────
-- bills column: { elec, wifi, gas, khala, other }
--   elec/wifi/gas/other = prepaid bills
--   khala              = postpaid bill
-- payments column: { "MemberName": { paid, status, notes } }
-- status = 'paid' | 'partial' | 'unpaid'
create table if not exists utility_payments (
  id         uuid primary key default uuid_generate_v4(),
  mess_id    uuid references messes(id) on delete cascade,
  month_key  text not null,
  month      integer not null,
  year       integer not null,
  month_name text not null,
  bills      jsonb not null default '{}',
  payments   jsonb not null default '{}',
  created_at timestamptz default now(),
  unique(mess_id, month_key)
);

-- ── ANNOUNCEMENTS ──────────────────────────────────────
create table if not exists announcements (
  id         uuid primary key default uuid_generate_v4(),
  mess_id    uuid references messes(id) on delete cascade,
  title      text not null,
  body       text not null,
  author     text not null,
  pinned     boolean default false,
  created_at timestamptz default now()
);

-- ── CHORES ─────────────────────────────────────────────
-- status   = 'pending' | 'inprogress' | 'done'
-- frequency = 'daily' | 'weekly' | 'monthly'
create table if not exists chores (
  id         uuid primary key default uuid_generate_v4(),
  mess_id    uuid references messes(id) on delete cascade,
  task       text not null,
  assignee   text default '',
  frequency  text default 'daily',
  status     text default 'pending',
  created_at timestamptz default now()
);

-- ── NOTIFICATIONS ──────────────────────────────────────
-- Stores member requests that need manager approval
-- type   = 'meal_request' | 'bazar_request' | 'bill_payment'
-- status = 'pending' | 'approved' | 'rejected'
--
-- data column per type:
--   meal_request:  { MemberName_day, MemberName_night, MemberName, day, night }
--   bazar_request: { MemberName: amount }
--   bill_payment:  { billType, amount, monthKey, monthName, year }
--     billType = 'elec' | 'wifi' | 'gas' | 'khala' | 'other' | 'rent'
create table if not exists notifications (
  id         uuid primary key default uuid_generate_v4(),
  mess_id    uuid references messes(id) on delete cascade,
  type       text not null,
  status     text default 'pending',
  from_id    uuid references members(id) on delete cascade,
  from_name  text not null,
  date       date not null,
  data       jsonb not null default '{}',
  note       text default '',
  created_at timestamptz default now()
);

-- ── ROW LEVEL SECURITY ─────────────────────────────────
alter table messes             enable row level security;
alter table members            enable row level security;
alter table meals              enable row level security;
alter table bazar              enable row level security;
alter table rent               enable row level security;
alter table utility_payments   enable row level security;
alter table announcements      enable row level security;
alter table chores             enable row level security;
alter table notifications      enable row level security;

-- Allow anon access (app handles auth + mess_id scoping)
create policy "allow_anon_all" on messes             for all using (true) with check (true);
create policy "allow_anon_all" on members            for all using (true) with check (true);
create policy "allow_anon_all" on meals              for all using (true) with check (true);
create policy "allow_anon_all" on bazar              for all using (true) with check (true);
create policy "allow_anon_all" on rent               for all using (true) with check (true);
create policy "allow_anon_all" on utility_payments   for all using (true) with check (true);
create policy "allow_anon_all" on announcements      for all using (true) with check (true);
create policy "allow_anon_all" on chores             for all using (true) with check (true);
create policy "allow_anon_all" on notifications      for all using (true) with check (true);

-- ── INDEXES ────────────────────────────────────────────
-- Members
create index if not exists idx_members_mess         on members(mess_id);
create index if not exists idx_members_role         on members(mess_id, role);
create index if not exists idx_members_username     on members(username);

-- Meals
create index if not exists idx_meals_mess_date      on meals(mess_id, date);

-- Bazar
create index if not exists idx_bazar_mess_date      on bazar(mess_id, date);

-- Rent
create index if not exists idx_rent_mess_key        on rent(mess_id, month_key);

-- Utility
create index if not exists idx_utility_mess_key     on utility_payments(mess_id, month_key);

-- Announcements
create index if not exists idx_announce_mess        on announcements(mess_id, created_at);

-- Chores
create index if not exists idx_chores_mess          on chores(mess_id);

-- Notifications
create index if not exists idx_notif_mess           on notifications(mess_id, status, created_at);
create index if not exists idx_notif_from           on notifications(from_id);
create index if not exists idx_notif_type           on notifications(mess_id, type, status);
