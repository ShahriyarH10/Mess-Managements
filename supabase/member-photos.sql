-- ============================================================
--  Member profile photos
--  Run in Supabase: Dashboard → SQL Editor → Run. Safe to re-run.
--
--  The app crops and compresses a photo in the browser to a 160×160 JPEG
--  (about 5–25 KB) and stores it inline as a data: URL, so no Storage
--  bucket or CSP change is needed. NULL = show initials.
-- ============================================================

alter table members add column if not exists photo text;

alter table members drop constraint if exists members_photo_check;
alter table members add constraint members_photo_check
  check (photo is null or (photo like 'data:image/%' and length(photo) <= 60000));

-- ---- verify ----
-- select name, length(photo) from members where photo is not null;
