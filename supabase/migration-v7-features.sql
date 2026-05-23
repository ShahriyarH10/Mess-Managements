-- ═══════════════════════════════════════════════════════
-- MessManager · Feature Migration v7
-- New tables: audit_log, meal_attendance, mess_rules, broadcasts
-- Modified: members.role now supports 'sub_manager'
-- Run in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

-- ── 1. AUDIT LOG ───────────────────────────────────────
-- Tracks every data change (who, what, when)
create table if not exists audit_log (
  id         uuid primary key default uuid_generate_v4(),
  mess_id    uuid references messes(id) on delete cascade,
  actor_id   uuid,
  actor_name text not null,
  action     text not null,         -- 'create' | 'update' | 'delete'
  entity     text not null,         -- 'meal' | 'bazar' | 'rent' | 'utility' | 'member' | 'announcement'
  entity_id  text default '',       -- the date or id of the affected record
  summary    text not null,         -- human-readable description
  details    jsonb default '{}',    -- old/new values for diff
  created_at timestamptz default now()
);

create index if not exists idx_audit_mess   on audit_log(mess_id, created_at desc);
create index if not exists idx_audit_entity on audit_log(mess_id, entity, created_at desc);

-- ── 2. MEAL ATTENDANCE (On/Off Toggle) ─────────────────
-- Members declare daily meal status in advance
create table if not exists meal_attendance (
  id         uuid primary key default uuid_generate_v4(),
  mess_id    uuid references messes(id) on delete cascade,
  member_id  uuid references members(id) on delete cascade,
  date       date not null,
  day_meal   boolean default true,
  night_meal boolean default true,
  updated_at timestamptz default now(),
  unique(mess_id, member_id, date)
);

create index if not exists idx_attend_mess_date on meal_attendance(mess_id, date);

-- ── 3. MESS RULES (Pinned Info Page) ───────────────────
-- Manager-configurable static info page
create table if not exists mess_rules (
  id         uuid primary key default uuid_generate_v4(),
  mess_id    uuid references messes(id) on delete cascade unique,
  wifi_pass  text default '',
  bank_info  text default '',
  rules_text text default '',
  contacts   text default '',
  custom     jsonb default '{}',    -- extra key-value pairs
  updated_at timestamptz default now()
);

-- ── 4. BROADCASTS (Manager urgent notifications) ───────
create table if not exists broadcasts (
  id         uuid primary key default uuid_generate_v4(),
  mess_id    uuid references messes(id) on delete cascade,
  message    text not null,
  priority   text default 'normal',  -- 'normal' | 'urgent'
  author     text not null,
  expires_at timestamptz,            -- auto-hide after this time
  created_at timestamptz default now()
);

create index if not exists idx_broadcast_mess on broadcasts(mess_id, created_at desc);

-- ── 5. RLS for new tables ──────────────────────────────
alter table audit_log        enable row level security;
alter table meal_attendance  enable row level security;
alter table mess_rules       enable row level security;
alter table broadcasts       enable row level security;

-- Allow anon access (matches existing pattern; app handles auth scoping)
create policy "allow_anon_all" on audit_log       for all using (true) with check (true);
create policy "allow_anon_all" on meal_attendance  for all using (true) with check (true);
create policy "allow_anon_all" on mess_rules       for all using (true) with check (true);
create policy "allow_anon_all" on broadcasts       for all using (true) with check (true);

-- ── 6. Indexes ─────────────────────────────────────────
create index if not exists idx_attend_member on meal_attendance(member_id, date);
create index if not exists idx_broadcast_exp on broadcasts(mess_id, expires_at);

-- ── Add pinned column to broadcasts (run if already deployed) ──
alter table if exists broadcasts add column if not exists pinned boolean default false;
create index if not exists idx_broadcast_pinned on broadcasts(mess_id, pinned desc, created_at desc);
