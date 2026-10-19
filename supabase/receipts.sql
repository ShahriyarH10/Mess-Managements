-- ============================================================
--  Receipts — every payment gets a stored, linkable receipt
--  Run AFTER member-payments.sql: Dashboard → SQL Editor → Run.
--  Safe to re-run.
--
--  member_payments already holds the members' "Give Payment" requests. This
--  adds who generated each receipt so the manager's own cash collections
--  (Collect Payment → Save) can be stored in the same table, already
--  confirmed, and show up on the member's "My Receipts" page.
--
--    source      'member'  — the member sent it (Give Payment), a manager confirms
--                'manager' — a manager recorded cash in Collect Payment
--    created_by  display name of whoever generated the receipt
-- ============================================================

alter table member_payments add column if not exists source     text not null default 'member';
alter table member_payments add column if not exists created_by text;

alter table member_payments drop constraint if exists member_payments_source_check;
alter table member_payments add constraint member_payments_source_check
  check (source in ('member', 'manager'));

-- Old rows were all member requests
update member_payments set created_by = member_name where created_by is null and source = 'member';

-- ---- verify ----
-- select source, count(*) from member_payments group by source;
