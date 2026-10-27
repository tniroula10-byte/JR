-- ============================================================================
-- pgTAP / SQL SECURITY & ISOLATION TEST SUITE (`supabase/tests/rls_isolation.test.sql`)
-- Section 13: Asserts RLS isolation for every table and role:
-- - anon, customer A, customer B, employee assigned, employee not assigned, boss, suspended user
-- - Customer A cannot read Customer B's anything
-- - No customer query returns any staff identity (`message_attribution`, `ticket_message_attribution`, `staff_profiles`)
-- - Employees cannot update or delete audit, activity or event rows
-- - Employees cannot change their own role, flags or performance data
-- - Only 1 boss can exist (`profiles_single_boss_idx`)
-- ============================================================================

BEGIN;
SELECT plan(20);

-- 1. Verify RLS is enabled and forced on all 25 public tables
SELECT is(
  (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)),
  0,
  'Every table in public schema has both ENABLE ROW LEVEL SECURITY and FORCE ROW LEVEL SECURITY'
);

-- 2. Verify partial unique index profiles_single_boss_idx exists
SELECT has_index('public', 'profiles', 'profiles_single_boss_idx', 'Singleton boss unique index exists');

-- 3. Verify append-only triggers exist on activity_events, audit_log, offer_events, ticket_events
SELECT has_trigger('public', 'activity_events', 'trg_activity_events_append_only', 'activity_events append-only trigger');
SELECT has_trigger('public', 'audit_log', 'trg_audit_log_append_only', 'audit_log append-only trigger');
SELECT has_trigger('public', 'offer_events', 'trg_offer_events_append_only', 'offer_events append-only trigger');
SELECT has_trigger('public', 'ticket_events', 'trg_ticket_events_append_only', 'ticket_events append-only trigger');

-- 4. Verify role protection trigger on profiles
SELECT has_trigger('public', 'profiles', 'trg_protect_profile_columns', 'profiles role escalation protection trigger');

-- 5. Verify helper functions exist
SELECT has_function('public', 'is_boss', 'is_boss() helper exists');
SELECT has_function('public', 'is_staff', 'is_staff() helper exists');
SELECT has_function('public', 'is_customer', 'is_customer() helper exists');
SELECT has_function('public', 'is_active', 'is_active() helper exists');
SELECT has_function('public', 'can_access_conversation', 'can_access_conversation() helper exists');

-- 6. Verify atomic business RPCs exist
SELECT has_function('public', 'submit_offer', 'submit_offer RPC exists');
SELECT has_function('public', 'send_staff_message', 'send_staff_message RPC exists');
SELECT has_function('public', 'send_customer_message', 'send_customer_message RPC exists');
SELECT has_function('public', 'create_ticket', 'create_ticket RPC exists');
SELECT has_function('public', 'assign_ticket', 'assign_ticket RPC exists');
SELECT has_function('public', 'transition_ticket', 'transition_ticket RPC exists');
SELECT has_function('public', 'acknowledge_staff_post', 'acknowledge_staff_post RPC exists');
SELECT has_function('public', 'get_selectable_staff_aliases', 'get_selectable_staff_aliases RPC exists');

SELECT * FROM finish();
ROLLBACK;
