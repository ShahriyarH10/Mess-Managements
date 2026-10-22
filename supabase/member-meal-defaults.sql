-- ============================================================
--  Member meal defaults
--  Run in Supabase: Dashboard → SQL Editor → Run. Safe to re-run.
--
--  database.sql (fresh installs) already has these columns, but databases
--  created before they existed don't. Without them the app still saves
--  members (it skips these fields), but each member's default day/night
--  meal count isn't stored. Running this enables it.
-- ============================================================

alter table members add column if not exists meal_default_day   float default 1;
alter table members add column if not exists meal_default_night float default 1;

-- ---- verify ----
-- select name, meal_default_day, meal_default_night from members;
