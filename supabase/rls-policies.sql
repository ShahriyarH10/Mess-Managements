-- ══════════════════════════════════════════════════════
-- MessManager — Row Level Security Policies
-- Run this in: Supabase Dashboard → SQL Editor → New query
--
-- IMPORTANT: Run this AFTER deploying the sign-session-jwt
-- Edge Function and setting SESSION_JWT_SECRET.
-- ══════════════════════════════════════════════════════

-- ── Step 1: Enable RLS on all tables ──────────────────
ALTER TABLE messes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bazar             ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent              ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_payments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chores            ENABLE ROW LEVEL SECURITY;

-- ── Step 2: Helper functions to read JWT claims ────────

-- Extracts mess_id from the custom JWT sent by the app
CREATE OR REPLACE FUNCTION get_mess_id_from_jwt()
RETURNS uuid AS $$
BEGIN
  RETURN (
    current_setting('request.jwt.claims', true)::json->>'mess_id'
  )::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Extracts role from the custom JWT
CREATE OR REPLACE FUNCTION get_role_from_jwt()
RETURNS text AS $$
BEGIN
  RETURN current_setting('request.jwt.claims', true)::json->>'role';
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── Step 3: Drop existing policies (safe re-run) ───────
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public'
             AND policyname LIKE 'mm_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════
-- MESSES
-- ══════════════════════════════════════════════════════

-- Logged-in users can only see their own mess
CREATE POLICY mm_messes_select ON messes
  FOR SELECT USING (id = get_mess_id_from_jwt());

-- Anyone can create a new mess (no JWT yet at this point)
CREATE POLICY mm_messes_insert ON messes
  FOR INSERT WITH CHECK (true);

-- Only manager of that mess can update it
CREATE POLICY mm_messes_update ON messes
  FOR UPDATE USING (
    id = get_mess_id_from_jwt()
    AND get_role_from_jwt() IN ('manager', 'superadmin')
  );

-- Superadmin can see and delete all messes
CREATE POLICY mm_messes_superadmin ON messes
  FOR ALL USING (get_role_from_jwt() = 'superadmin');

-- ══════════════════════════════════════════════════════
-- MEMBERS
-- ══════════════════════════════════════════════════════

-- Login lookup: must be open so the login flow can fetch
-- by username before a JWT exists. The password column
-- is hashed (PBKDF2) so exposure is acceptable.
-- Tighten this by moving login to an Edge Function in future.
CREATE POLICY mm_members_select ON members
  FOR SELECT USING (true);

-- Anyone can insert (create mess + add first manager)
CREATE POLICY mm_members_insert ON members
  FOR INSERT WITH CHECK (true);

-- Only same-mess users can update members
CREATE POLICY mm_members_update ON members
  FOR UPDATE USING (mess_id = get_mess_id_from_jwt());

-- Only managers can delete members from their mess
CREATE POLICY mm_members_delete ON members
  FOR DELETE USING (
    mess_id = get_mess_id_from_jwt()
    AND get_role_from_jwt() IN ('manager', 'superadmin')
  );

-- Superadmin full access
CREATE POLICY mm_members_superadmin ON members
  FOR ALL USING (get_role_from_jwt() = 'superadmin');

-- ══════════════════════════════════════════════════════
-- DATA TABLES — meals, bazar, rent, utility_payments,
--               announcements, chores
-- Same mess only. Superadmin sees all.
-- ══════════════════════════════════════════════════════

CREATE POLICY mm_meals_own ON meals
  FOR ALL USING (mess_id = get_mess_id_from_jwt());

CREATE POLICY mm_meals_superadmin ON meals
  FOR ALL USING (get_role_from_jwt() = 'superadmin');

-- ──
CREATE POLICY mm_bazar_own ON bazar
  FOR ALL USING (mess_id = get_mess_id_from_jwt());

CREATE POLICY mm_bazar_superadmin ON bazar
  FOR ALL USING (get_role_from_jwt() = 'superadmin');

-- ──
CREATE POLICY mm_rent_own ON rent
  FOR ALL USING (mess_id = get_mess_id_from_jwt());

CREATE POLICY mm_rent_superadmin ON rent
  FOR ALL USING (get_role_from_jwt() = 'superadmin');

-- ──
CREATE POLICY mm_utility_own ON utility_payments
  FOR ALL USING (mess_id = get_mess_id_from_jwt());

CREATE POLICY mm_utility_superadmin ON utility_payments
  FOR ALL USING (get_role_from_jwt() = 'superadmin');

-- ──
CREATE POLICY mm_announcements_own ON announcements
  FOR ALL USING (mess_id = get_mess_id_from_jwt());

CREATE POLICY mm_announcements_superadmin ON announcements
  FOR ALL USING (get_role_from_jwt() = 'superadmin');

-- ──
CREATE POLICY mm_chores_own ON chores
  FOR ALL USING (mess_id = get_mess_id_from_jwt());

CREATE POLICY mm_chores_superadmin ON chores
  FOR ALL USING (get_role_from_jwt() = 'superadmin');

-- ══════════════════════════════════════════════════════
-- VERIFY (run separately to check policies are active)
-- ══════════════════════════════════════════════════════
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
