-- >>> BEGIN MIGRATION: 00001_schema_and_rls.sql <<<
-- ============================================================================
-- JOHN RAMBO — COMPLETE POSTGRESQL SCHEMA, RLS, TRIGGERS & ATOMIC RPCs
-- Migration: 00001_schema_and_rls.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ----------------------------------------------------------------------------
-- 1. CUSTOM ENUMS
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('boss', 'employee', 'customer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_status AS ENUM ('invited', 'pending_approval', 'active', 'rejected', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inbox_scope_mode AS ENUM ('all', 'assigned_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.product_status AS ENUM ('available', 'sold_out', 'hidden');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sender_kind AS ENUM ('customer', 'staff', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.message_type AS ENUM ('text', 'offer', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.offer_status AS ENUM ('pending', 'countered', 'accepted', 'rejected', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.offer_event_type AS ENUM ('submitted', 'viewed', 'countered', 'accepted', 'rejected', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ticket_status AS ENUM ('open', 'assigned', 'in_progress', 'waiting_for_customer', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ticket_event_type AS ENUM ('created', 'assigned', 'reassigned', 'status_changed', 'replied', 'reopened', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.announcement_priority AS ENUM ('normal', 'important', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.story_kind AS ENUM ('text', 'image', 'video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 2. TABLES (ALL IN PUBLIC WITH RLS ENABLED & FORCED + INDEXED FKs)
-- ----------------------------------------------------------------------------

-- 2.1 profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  role public.user_role NOT NULL,
  status public.user_status NOT NULL DEFAULT 'pending_approval',
  username citext UNIQUE,
  full_name text NOT NULL CHECK (char_length(trim(full_name)) >= 2),
  email citext NOT NULL UNIQUE,
  phone text UNIQUE CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{6,14}$'),
  avatar_path text,
  invited_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);
-- Guarantee there is only one boss
CREATE UNIQUE INDEX IF NOT EXISTS profiles_single_boss_idx ON public.profiles ((role)) WHERE role = 'boss';
CREATE INDEX IF NOT EXISTS profiles_invited_by_idx ON public.profiles (invited_by);
CREATE INDEX IF NOT EXISTS profiles_approved_by_idx ON public.profiles (approved_by);
CREATE INDEX IF NOT EXISTS profiles_role_status_idx ON public.profiles (role, status);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

-- 2.2 staff_profiles
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  public_alias text NOT NULL UNIQUE CHECK (char_length(trim(public_alias)) >= 2),
  customer_selectable boolean NOT NULL DEFAULT false,
  accepts_tickets boolean NOT NULL DEFAULT true,
  can_manage_products boolean NOT NULL DEFAULT false,
  can_publish_stories boolean NOT NULL DEFAULT false,
  can_post_customer_announcements boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles FORCE ROW LEVEL SECURITY;

-- 2.3 app_settings (single-row table)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  employee_inbox_scope public.inbox_scope_mode NOT NULL DEFAULT 'all',
  customer_can_pick_employee boolean NOT NULL DEFAULT false,
  ticket_auto_close_days integer NOT NULL DEFAULT 7 CHECK (ticket_auto_close_days BETWEEN 1 AND 90),
  offer_sanity_max_paise bigint NOT NULL DEFAULT 100000000 CHECK (offer_sanity_max_paise > 0),
  business_hours_only boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_settings_updated_by_idx ON public.app_settings (updated_by);
INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings FORCE ROW LEVEL SECURITY;

-- 2.4 invitations
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL,
  intended_role public.user_role NOT NULL CHECK (intended_role IN ('customer', 'employee')),
  full_name text NOT NULL,
  phone text,
  invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status public.invitation_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz
);
CREATE INDEX IF NOT EXISTS invitations_invited_by_created_idx ON public.invitations (invited_by, created_at DESC);
CREATE INDEX IF NOT EXISTS invitations_email_idx ON public.invitations (email);
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;

-- 2.5 products
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_name text NOT NULL,
  title text NOT NULL,
  points_qty bigint NOT NULL CHECK (points_qty > 0),
  description text NOT NULL DEFAULT '',
  image_path text,
  price_paise bigint NOT NULL CHECK (price_paise >= 100),
  status public.product_status NOT NULL DEFAULT 'available',
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_status_created_idx ON public.products (status, created_at DESC);
CREATE INDEX IF NOT EXISTS products_created_by_idx ON public.products (created_by);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

-- 2.6 conversations (one per customer)
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  handled_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  awaiting_staff boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  last_message_preview text,
  customer_last_read_at timestamptz,
  staff_last_read_at timestamptz,
  customer_unread_count integer NOT NULL DEFAULT 0,
  staff_unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_customer_id_idx ON public.conversations (customer_id);
CREATE INDEX IF NOT EXISTS conversations_handled_by_idx ON public.conversations (handled_by, last_message_at DESC);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;

-- 2.7 offers
CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE RESTRICT,
  offered_price_paise bigint NOT NULL CHECK (offered_price_paise >= 100),
  listed_price_paise bigint NOT NULL CHECK (listed_price_paise >= 100),
  product_title text NOT NULL,
  status public.offer_status NOT NULL DEFAULT 'pending',
  counter_price_paise bigint CHECK (counter_price_paise IS NULL OR counter_price_paise >= 100),
  staff_note text,
  handled_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offers_customer_created_idx ON public.offers (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS offers_conversation_created_idx ON public.offers (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS offers_product_idx ON public.offers (product_id);
CREATE INDEX IF NOT EXISTS offers_handled_by_idx ON public.offers (handled_by);
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers FORCE ROW LEVEL SECURITY;

-- 2.8 offer_events (append-only)
CREATE TABLE IF NOT EXISTS public.offer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event public.offer_event_type NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offer_events_offer_created_idx ON public.offer_events (offer_id, created_at ASC);
CREATE INDEX IF NOT EXISTS offer_events_actor_idx ON public.offer_events (actor_id);
ALTER TABLE public.offer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_events FORCE ROW LEVEL SECURITY;

-- 2.9 messages
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE RESTRICT,
  sender_kind public.sender_kind NOT NULL,
  customer_sender_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  type public.message_type NOT NULL DEFAULT 'text',
  body text NOT NULL CHECK (char_length(trim(body)) >= 1),
  offer_id uuid REFERENCES public.offers(id) ON DELETE RESTRICT,
  client_msg_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_staff_anonymity_check CHECK (
    (sender_kind = 'customer' AND customer_sender_id IS NOT NULL) OR
    (sender_kind IN ('staff', 'system') AND customer_sender_id IS NULL)
  ),
  CONSTRAINT messages_idempotency_unique UNIQUE (conversation_id, client_msg_id)
);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON public.messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS messages_customer_sender_idx ON public.messages (customer_sender_id);
CREATE INDEX IF NOT EXISTS messages_offer_idx ON public.messages (offer_id);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;

-- 2.10 message_attribution (Staff-only read)
CREATE TABLE IF NOT EXISTS public.message_attribution (
  message_id uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_attribution_staff_idx ON public.message_attribution (staff_id, created_at DESC);
ALTER TABLE public.message_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attribution FORCE ROW LEVEL SECURITY;

-- 2.11 tickets
CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no serial UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  subject text NOT NULL CHECK (char_length(trim(subject)) >= 4),
  description text NOT NULL CHECK (char_length(trim(description)) >= 10),
  category text NOT NULL DEFAULT 'general',
  priority public.ticket_priority NOT NULL DEFAULT 'normal',
  status public.ticket_status NOT NULL DEFAULT 'open',
  assigned_employee_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  requested_employee_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reopen_count integer NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS tickets_customer_created_idx ON public.tickets (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_assigned_status_idx ON public.tickets (assigned_employee_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_requested_employee_idx ON public.tickets (requested_employee_id);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets FORCE ROW LEVEL SECURITY;

-- 2.12 ticket_messages
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  sender_kind public.sender_kind NOT NULL,
  customer_sender_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(trim(body)) >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_messages_staff_anonymity_check CHECK (
    (sender_kind = 'customer' AND customer_sender_id IS NOT NULL) OR
    (sender_kind IN ('staff', 'system') AND customer_sender_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS ticket_messages_ticket_created_idx ON public.ticket_messages (ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS ticket_messages_customer_sender_idx ON public.ticket_messages (customer_sender_id);
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages FORCE ROW LEVEL SECURITY;

-- 2.13 ticket_message_attribution (Staff-only read)
CREATE TABLE IF NOT EXISTS public.ticket_message_attribution (
  ticket_message_id uuid PRIMARY KEY REFERENCES public.ticket_messages(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_message_attr_staff_idx ON public.ticket_message_attribution (staff_id, created_at DESC);
ALTER TABLE public.ticket_message_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_message_attribution FORCE ROW LEVEL SECURITY;

-- 2.14 ticket_events (append-only)
CREATE TABLE IF NOT EXISTS public.ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event public.ticket_event_type NOT NULL,
  from_value text,
  to_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_events_ticket_created_idx ON public.ticket_events (ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS ticket_events_actor_idx ON public.ticket_events (actor_id);
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_events FORCE ROW LEVEL SECURITY;

-- 2.15 complaint_chat_rooms (3-member private room: boss, target employee, customer)
CREATE TABLE IF NOT EXISTS public.complaint_chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  boss_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS complaint_chat_rooms_ticket_idx ON public.complaint_chat_rooms (ticket_id);
CREATE INDEX IF NOT EXISTS complaint_chat_rooms_customer_idx ON public.complaint_chat_rooms (customer_id);
CREATE INDEX IF NOT EXISTS complaint_chat_rooms_employee_idx ON public.complaint_chat_rooms (employee_id);
CREATE INDEX IF NOT EXISTS complaint_chat_rooms_boss_idx ON public.complaint_chat_rooms (boss_id);
ALTER TABLE public.complaint_chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_chat_rooms FORCE ROW LEVEL SECURITY;

-- 2.16 complaint_chat_messages
CREATE TABLE IF NOT EXISTS public.complaint_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.complaint_chat_rooms(id) ON DELETE RESTRICT,
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(trim(body)) >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS complaint_chat_messages_room_created_idx ON public.complaint_chat_messages (room_id, created_at ASC);
CREATE INDEX IF NOT EXISTS complaint_chat_messages_ticket_idx ON public.complaint_chat_messages (ticket_id);
CREATE INDEX IF NOT EXISTS complaint_chat_messages_sender_idx ON public.complaint_chat_messages (sender_id);
ALTER TABLE public.complaint_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_chat_messages FORCE ROW LEVEL SECURITY;

-- 2.17 staff_threads (JR Family group thread + individual staff threads)
CREATE TABLE IF NOT EXISTS public.staff_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  is_group boolean NOT NULL DEFAULT false,
  title text,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_threads_employee_idx ON public.staff_threads (employee_id);
ALTER TABLE public.staff_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_threads FORCE ROW LEVEL SECURITY;

-- 2.18 staff_thread_messages
CREATE TABLE IF NOT EXISTS public.staff_thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.staff_threads(id) ON DELETE RESTRICT,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(trim(body)) >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_thread_messages_thread_created_idx ON public.staff_thread_messages (thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS staff_thread_messages_sender_idx ON public.staff_thread_messages (sender_id);
ALTER TABLE public.staff_thread_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_thread_messages FORCE ROW LEVEL SECURITY;

-- 2.19 staff_announcements
CREATE TABLE IF NOT EXISTS public.staff_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL,
  body text NOT NULL,
  priority public.announcement_priority NOT NULL DEFAULT 'normal',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_announcements_created_idx ON public.staff_announcements (created_at DESC);
CREATE INDEX IF NOT EXISTS staff_announcements_author_idx ON public.staff_announcements (author_id);
ALTER TABLE public.staff_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_announcements FORCE ROW LEVEL SECURITY;

-- 2.20 staff_announcement_acks
CREATE TABLE IF NOT EXISTS public.staff_announcement_acks (
  announcement_id uuid NOT NULL REFERENCES public.staff_announcements(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, employee_id)
);
CREATE INDEX IF NOT EXISTS staff_acks_employee_idx ON public.staff_announcement_acks (employee_id, acknowledged_at DESC);
ALTER TABLE public.staff_announcement_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_announcement_acks FORCE ROW LEVEL SECURITY;

-- 2.21 customer_announcements
CREATE TABLE IF NOT EXISTS public.customer_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_announcements_pinned_pub_idx ON public.customer_announcements (pinned DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS customer_announcements_author_idx ON public.customer_announcements (author_id);
ALTER TABLE public.customer_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_announcements FORCE ROW LEVEL SECURITY;

-- 2.22 stories
CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  kind public.story_kind NOT NULL DEFAULT 'text',
  media_path text,
  caption text NOT NULL DEFAULT '',
  bg_style text NOT NULL DEFAULT 'from-violet-900 via-indigo-950 to-slate-950',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX IF NOT EXISTS stories_expires_created_idx ON public.stories (expires_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS stories_author_idx ON public.stories (author_id);
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories FORCE ROW LEVEL SECURITY;

-- 2.23 story_views
CREATE TABLE IF NOT EXISTS public.story_views (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, customer_id)
);
CREATE INDEX IF NOT EXISTS story_views_customer_idx ON public.story_views (customer_id);
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views FORCE ROW LEVEL SECURITY;

-- 2.25 notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  link text NOT NULL DEFAULT '/',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx ON public.notifications (recipient_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

-- 2.26 push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions FORCE ROW LEVEL SECURITY;

-- 2.27 activity_events (append-only, source of all performance figures)
CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  actor_role public.user_role NOT NULL,
  event_type text NOT NULL,
  customer_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE RESTRICT,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE RESTRICT,
  offer_id uuid REFERENCES public.offers(id) ON DELETE RESTRICT,
  message_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS activity_events_actor_occurred_idx ON public.activity_events (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_type_occurred_idx ON public.activity_events (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_customer_idx ON public.activity_events (customer_id);
CREATE INDEX IF NOT EXISTS activity_events_conversation_idx ON public.activity_events (conversation_id);
CREATE INDEX IF NOT EXISTS activity_events_ticket_idx ON public.activity_events (ticket_id);
CREATE INDEX IF NOT EXISTS activity_events_offer_idx ON public.activity_events (offer_id);
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events FORCE ROW LEVEL SECURITY;

-- 2.28 audit_log (append-only, server insert-only)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  before_meta jsonb,
  after_meta jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log (actor_id, created_at DESC);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. APPEND-ONLY & ROLE PROTECTION TRIGGERS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY_VIOLATION: Table % is strictly append-only. UPDATE and DELETE are forbidden for all roles.', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_events_append_only ON public.activity_events;
CREATE TRIGGER trg_activity_events_append_only
BEFORE UPDATE OR DELETE ON public.activity_events
FOR EACH ROW EXECUTE FUNCTION public.reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON public.audit_log;
CREATE TRIGGER trg_audit_log_append_only
BEFORE UPDATE OR DELETE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_offer_events_append_only ON public.offer_events;
CREATE TRIGGER trg_offer_events_append_only
BEFORE UPDATE OR DELETE ON public.offer_events
FOR EACH ROW EXECUTE FUNCTION public.reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_ticket_events_append_only ON public.ticket_events;
CREATE TRIGGER trg_ticket_events_append_only
BEFORE UPDATE OR DELETE ON public.ticket_events
FOR EACH ROW EXECUTE FUNCTION public.reject_append_only_mutation();

-- Protect profiles.role, profiles.status, profiles.invited_by, and profiles.approved_by from client updates
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.bypass_profile_guard', true) = 'on' OR current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Users cannot modify profiles.role.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT public.is_boss() THEN
    RAISE EXCEPTION 'FORBIDDEN_STATUS_CHANGE: Only the Boss can change profiles.status directly.';
  END IF;

  IF NEW.invited_by IS DISTINCT FROM OLD.invited_by THEN
    RAISE EXCEPTION 'FORBIDDEN_MUTATION: profiles.invited_by is immutable.';
  END IF;

  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN_MUTATION: profiles.approved_by cannot be modified by customers.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- ----------------------------------------------------------------------------
-- 4. SECURITY HELPER FUNCTIONS (DB-BACKED ROLE CHECKS ONLY, NEVER CLIENT JWT CLAIMS)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_boss()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status = 'active' AND role = 'boss'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_employee()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status = 'active' AND role = 'employee'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status = 'active' AND role IN ('boss', 'employee')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_customer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status = 'active' AND role = 'customer'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_staff_flag(p_flag text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean := false;
BEGIN
  IF public.is_boss() THEN
    RETURN true;
  END IF;
  IF NOT public.is_employee() THEN
    RETURN false;
  END IF;

  SELECT
    CASE p_flag
      WHEN 'can_manage_products' THEN sp.can_manage_products
      WHEN 'can_publish_stories' THEN sp.can_publish_stories
      WHEN 'can_post_customer_announcements' THEN sp.can_post_customer_announcements
      ELSE false
    END
  INTO v_allowed
  FROM public.staff_profiles sp
  WHERE sp.user_id = auth.uid();

  RETURN COALESCE(v_allowed, false);
END;
$$;

-- Employee inbox scope helper function
CREATE OR REPLACE FUNCTION public.can_access_conversation(p_conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    CROSS JOIN public.app_settings s
    WHERE c.id = p_conv_id
      AND public.is_active()
      AND (
        public.is_boss()
        OR (public.is_customer() AND c.customer_id = auth.uid())
        OR (
          public.is_employee()
          AND (s.employee_inbox_scope = 'all' OR c.handled_by = auth.uid())
        )
      )
  );
$$;

-- 3-member complaint chat room membership helper function
CREATE OR REPLACE FUNCTION public.is_complaint_room_member(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.complaint_chat_rooms r
    WHERE r.id = p_room_id
      AND public.is_active()
      AND auth.uid() IN (r.boss_id, r.employee_id, r.customer_id)
  );
$$;

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY POLICIES (DENY BY DEFAULT — NO `USING (true)` ON SENSITIVE TABLES)
-- ----------------------------------------------------------------------------

-- 5.1 profiles
CREATE POLICY profiles_select_policy ON public.profiles
FOR SELECT USING (
  public.is_active() AND (public.is_staff() OR id = auth.uid())
);

CREATE POLICY profiles_update_own_policy ON public.profiles
FOR UPDATE USING (
  public.is_active() AND (id = auth.uid() OR public.is_boss())
) WITH CHECK (
  public.is_active()
  AND (id = auth.uid() OR public.is_boss())
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id)
);

-- 5.2 staff_profiles
CREATE POLICY staff_profiles_select_staff ON public.staff_profiles
FOR SELECT USING (public.is_staff());

CREATE POLICY staff_profiles_write_boss ON public.staff_profiles
FOR ALL USING (public.is_boss()) WITH CHECK (public.is_boss());

-- 5.3 app_settings
CREATE POLICY app_settings_select_active ON public.app_settings
FOR SELECT USING (public.is_active());

CREATE POLICY app_settings_update_boss ON public.app_settings
FOR UPDATE USING (public.is_boss()) WITH CHECK (public.is_boss());

-- 5.4 invitations
CREATE POLICY invitations_select_staff ON public.invitations
FOR SELECT USING (public.is_staff());

CREATE POLICY invitations_insert_staff ON public.invitations
FOR INSERT WITH CHECK (
  invited_by = auth.uid() AND (
    public.is_boss() OR (public.is_employee() AND intended_role = 'customer')
  )
);

-- 5.5 products
CREATE POLICY products_select_policy ON public.products
FOR SELECT USING (
  public.is_active() AND (public.is_staff() OR status = 'available')
);

CREATE POLICY products_insert_policy ON public.products
FOR INSERT WITH CHECK (public.has_staff_flag('can_manage_products') AND created_by = auth.uid());

CREATE POLICY products_update_policy ON public.products
FOR UPDATE USING (public.has_staff_flag('can_manage_products'))
WITH CHECK (public.has_staff_flag('can_manage_products'));

-- 5.6 conversations
CREATE POLICY conversations_select_policy ON public.conversations
FOR SELECT USING (public.can_access_conversation(id));

CREATE POLICY conversations_update_policy ON public.conversations
FOR UPDATE USING (public.can_access_conversation(id))
WITH CHECK (
  public.can_access_conversation(id)
  AND (public.is_staff() OR customer_id = auth.uid())
);

-- 5.7 messages
CREATE POLICY messages_select_policy ON public.messages
FOR SELECT USING (public.can_access_conversation(conversation_id));

CREATE POLICY messages_insert_own_policy ON public.messages
FOR INSERT WITH CHECK (
  public.can_access_conversation(conversation_id)
  AND (
    (public.is_customer() AND sender_kind = 'customer' AND customer_sender_id = auth.uid())
    OR (public.is_staff() AND sender_kind = 'staff' AND customer_sender_id IS NULL)
  )
);

-- 5.8 message_attribution (STRICTLY STAFF ONLY — customers NEVER read)
CREATE POLICY message_attribution_select_staff ON public.message_attribution
FOR SELECT USING (public.is_staff());

CREATE POLICY message_attribution_insert_staff ON public.message_attribution
FOR INSERT WITH CHECK (public.is_staff() AND staff_id = auth.uid());

-- 5.9 offers
CREATE POLICY offers_select_policy ON public.offers
FOR SELECT USING (
  public.is_active() AND (
    (public.is_customer() AND customer_id = auth.uid())
    OR public.can_access_conversation(conversation_id)
  )
);

CREATE POLICY offers_insert_customer_policy ON public.offers
FOR INSERT WITH CHECK (
  public.is_customer() AND customer_id = auth.uid()
);

CREATE POLICY offers_update_policy ON public.offers
FOR UPDATE USING (
  public.is_active() AND (
    (public.is_customer() AND customer_id = auth.uid())
    OR (public.is_staff() AND public.can_access_conversation(conversation_id))
  )
) WITH CHECK (
  public.is_active() AND (
    (public.is_customer() AND customer_id = auth.uid())
    OR (public.is_staff() AND public.can_access_conversation(conversation_id))
  )
);

-- 5.10 offer_events
CREATE POLICY offer_events_select_policy ON public.offer_events
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.offers o
    WHERE o.id = offer_events.offer_id
      AND (
        (public.is_customer() AND o.customer_id = auth.uid())
        OR public.can_access_conversation(o.conversation_id)
      )
  )
);

CREATE POLICY offer_events_insert_own_policy ON public.offer_events
FOR INSERT WITH CHECK (
  public.is_active() AND actor_id = auth.uid()
);

-- 5.11 tickets (Boss & employees read all; customers read & insert own only)
CREATE POLICY tickets_select_policy ON public.tickets
FOR SELECT USING (
  public.is_active() AND (public.is_staff() OR customer_id = auth.uid())
);

CREATE POLICY tickets_insert_customer_policy ON public.tickets
FOR INSERT WITH CHECK (
  public.is_customer() AND customer_id = auth.uid()
);

CREATE POLICY tickets_update_policy ON public.tickets
FOR UPDATE USING (
  public.is_active() AND (
    public.is_boss()
    OR (public.is_employee() AND assigned_employee_id = auth.uid())
    OR (public.is_customer() AND customer_id = auth.uid())
  )
) WITH CHECK (
  public.is_active() AND (
    public.is_boss()
    OR (public.is_employee() AND assigned_employee_id = auth.uid())
    OR (public.is_customer() AND customer_id = auth.uid())
  )
);

-- 5.12 ticket_messages
CREATE POLICY ticket_messages_select_policy ON public.ticket_messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_messages.ticket_id
      AND public.is_active()
      AND (public.is_staff() OR t.customer_id = auth.uid())
  )
);

CREATE POLICY ticket_messages_insert_policy ON public.ticket_messages
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_messages.ticket_id
      AND public.is_active()
      AND (
        (public.is_customer() AND t.customer_id = auth.uid() AND sender_kind = 'customer' AND customer_sender_id = auth.uid())
        OR (
          (public.is_boss() OR (public.is_employee() AND t.assigned_employee_id = auth.uid()))
          AND sender_kind = 'staff'
          AND customer_sender_id IS NULL
        )
      )
  )
);

-- 5.13 ticket_message_attribution (STRICTLY STAFF ONLY — customers NEVER read)
CREATE POLICY ticket_message_attr_select_staff ON public.ticket_message_attribution
FOR SELECT USING (public.is_staff());

CREATE POLICY ticket_message_attr_insert_staff ON public.ticket_message_attribution
FOR INSERT WITH CHECK (public.is_staff() AND staff_id = auth.uid());

-- 5.14 ticket_events
CREATE POLICY ticket_events_select_policy ON public.ticket_events
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_events.ticket_id
      AND public.is_active()
      AND (public.is_staff() OR t.customer_id = auth.uid())
  )
);

CREATE POLICY ticket_events_insert_own_policy ON public.ticket_events
FOR INSERT WITH CHECK (
  public.is_active() AND actor_id = auth.uid()
);

-- 5.15 complaint_chat_rooms (Strictly the 3 room members: boss_id, employee_id, customer_id)
CREATE POLICY complaint_chat_rooms_select_members ON public.complaint_chat_rooms
FOR SELECT USING (
  public.is_active() AND auth.uid() IN (boss_id, employee_id, customer_id)
);

CREATE POLICY complaint_chat_rooms_insert_policy ON public.complaint_chat_rooms
FOR INSERT WITH CHECK (
  public.is_active() AND (public.is_customer() AND customer_id = auth.uid() OR public.is_boss())
);

-- 5.16 complaint_chat_messages (Strictly the 3 room members)
CREATE POLICY complaint_chat_messages_select_members ON public.complaint_chat_messages
FOR SELECT USING (
  public.is_complaint_room_member(room_id)
);

CREATE POLICY complaint_chat_messages_insert_members ON public.complaint_chat_messages
FOR INSERT WITH CHECK (
  public.is_complaint_room_member(room_id) AND sender_id = auth.uid()
);

-- 5.17 staff_threads (JR Family: Boss and all active employees can SELECT; customers get zero access)
CREATE POLICY staff_threads_select_staff ON public.staff_threads
FOR SELECT USING (public.is_staff());

-- 5.18 staff_thread_messages (JR Family: Boss and all active employees can SELECT and INSERT as themselves)
CREATE POLICY staff_thread_messages_select_staff ON public.staff_thread_messages
FOR SELECT USING (public.is_staff());

CREATE POLICY staff_thread_messages_insert_staff ON public.staff_thread_messages
FOR INSERT WITH CHECK (
  public.is_staff() AND sender_id = auth.uid()
);

-- 5.19 staff_announcements & acks (Boss posts; staff reads; employee acknowledges)
CREATE POLICY staff_announcements_select_staff ON public.staff_announcements
FOR SELECT USING (public.is_staff());

CREATE POLICY staff_announcements_insert_boss ON public.staff_announcements
FOR INSERT WITH CHECK (public.is_boss() AND author_id = auth.uid());

CREATE POLICY staff_acks_select_staff ON public.staff_announcement_acks
FOR SELECT USING (public.is_staff());

CREATE POLICY staff_acks_insert_employee ON public.staff_announcement_acks
FOR INSERT WITH CHECK (public.is_employee() AND employee_id = auth.uid());

-- 5.20 customer_announcements
CREATE POLICY customer_announcements_select_active ON public.customer_announcements
FOR SELECT USING (public.is_active());

CREATE POLICY customer_announcements_insert_flag ON public.customer_announcements
FOR INSERT WITH CHECK (
  public.has_staff_flag('can_post_customer_announcements') AND author_id = auth.uid()
);

-- 5.21 stories (Customers read live stories only where expires_at > now())
CREATE POLICY stories_select_policy ON public.stories
FOR SELECT USING (
  public.is_active() AND (
    public.is_staff() OR expires_at > now()
  )
);

CREATE POLICY stories_insert_flag ON public.stories
FOR INSERT WITH CHECK (
  public.has_staff_flag('can_publish_stories') AND author_id = auth.uid()
);

-- 5.22 story_views
CREATE POLICY story_views_select_policy ON public.story_views
FOR SELECT USING (
  public.is_active() AND (public.is_staff() OR customer_id = auth.uid())
);

CREATE POLICY story_views_insert_customer ON public.story_views
FOR INSERT WITH CHECK (
  public.is_customer() AND customer_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.stories s WHERE s.id = story_views.story_id AND s.expires_at > now()
  )
);

-- 5.24 notifications & push_subscriptions (Own rows only)
CREATE POLICY notifications_own_policy ON public.notifications
FOR ALL USING (public.is_active() AND recipient_id = auth.uid())
WITH CHECK (public.is_active() AND recipient_id = auth.uid());

CREATE POLICY push_subscriptions_own_policy ON public.push_subscriptions
FOR ALL USING (public.is_active() AND user_id = auth.uid())
WITH CHECK (public.is_active() AND user_id = auth.uid());

-- 5.25 activity_events (Boss sees all; Employee sees own only; Customer sees none)
CREATE POLICY activity_events_select_policy ON public.activity_events
FOR SELECT USING (
  public.is_boss() OR (public.is_employee() AND actor_id = auth.uid())
);

-- 5.26 audit_log (Boss read-only; insert-only from server-side SECURITY DEFINER / service_role; clients cannot insert, update, or delete)
CREATE POLICY audit_log_select_boss ON public.audit_log
FOR SELECT USING (public.is_boss());

CREATE POLICY audit_log_no_client_insert ON public.audit_log
FOR INSERT WITH CHECK (false);

CREATE POLICY audit_log_no_client_update ON public.audit_log
FOR UPDATE USING (false) WITH CHECK (false);

CREATE POLICY audit_log_no_client_delete ON public.audit_log
FOR DELETE USING (false);

-- ----------------------------------------------------------------------------
-- 6. ATOMIC BUSINESS RPCs (SECURITY DEFINER)
-- ----------------------------------------------------------------------------

-- 6.1 get_selectable_staff_aliases
CREATE OR REPLACE FUNCTION public.get_selectable_staff_aliases()
RETURNS TABLE (staff_id uuid, public_alias text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.user_id AS staff_id, sp.public_alias
  FROM public.staff_profiles sp
  JOIN public.profiles p ON p.id = sp.user_id
  CROSS JOIN public.app_settings s
  WHERE public.is_active()
    AND s.customer_can_pick_employee = true
    AND p.role = 'employee'
    AND p.status = 'active'
    AND sp.customer_selectable = true
    AND sp.accepts_tickets = true;
$$;

-- 6.2 send_customer_message
CREATE OR REPLACE FUNCTION public.send_customer_message(
  p_conversation_id uuid,
  p_body text,
  p_client_msg_id text
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.conversations;
  v_msg public.messages;
BEGIN
  IF NOT public.is_customer() THEN
    RAISE EXCEPTION 'FORBIDDEN: Active customer required.';
  END IF;

  SELECT * INTO v_conv FROM public.conversations
  WHERE id = p_conversation_id AND customer_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: Conversation does not belong to caller.';
  END IF;

  INSERT INTO public.messages (
    conversation_id, sender_kind, customer_sender_id, type, body, client_msg_id
  ) VALUES (
    v_conv.id, 'customer', auth.uid(), 'text', trim(p_body), p_client_msg_id
  )
  ON CONFLICT (conversation_id, client_msg_id) DO UPDATE SET body = EXCLUDED.body
  RETURNING * INTO v_msg;

  UPDATE public.conversations
  SET awaiting_staff = true,
      last_message_at = now(),
      last_message_preview = left(trim(p_body), 120),
      staff_unread_count = staff_unread_count + 1
  WHERE id = v_conv.id;

  INSERT INTO public.activity_events (
    actor_id, actor_role, event_type, customer_id, conversation_id, message_id
  ) VALUES (
    auth.uid(), 'customer', 'customer_message_sent', auth.uid(), v_conv.id, v_msg.id
  );

  RETURN v_msg;
END;
$$;

-- 6.3 send_staff_message (Writes message + message_attribution in one transaction)
CREATE OR REPLACE FUNCTION public.send_staff_message(
  p_conversation_id uuid,
  p_body text,
  p_client_msg_id text
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.conversations;
  v_msg public.messages;
  v_role public.user_role;
  v_first_resp_sec numeric;
BEGIN
  IF NOT public.is_staff() OR NOT public.can_access_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Staff scope check failed.';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;

  IF v_conv.awaiting_staff AND v_conv.last_message_at IS NOT NULL THEN
    v_first_resp_sec := GREATEST(1, EXTRACT(EPOCH FROM (now() - v_conv.last_message_at)));
  END IF;

  INSERT INTO public.messages (
    conversation_id, sender_kind, customer_sender_id, type, body, client_msg_id
  ) VALUES (
    v_conv.id, 'staff', NULL, 'text', trim(p_body), p_client_msg_id
  )
  RETURNING * INTO v_msg;

  INSERT INTO public.message_attribution (message_id, staff_id)
  VALUES (v_msg.id, auth.uid());

  UPDATE public.conversations
  SET handled_by = COALESCE(handled_by, CASE WHEN v_role = 'employee' THEN auth.uid() ELSE handled_by END),
      awaiting_staff = false,
      last_message_at = now(),
      last_message_preview = left(trim(p_body), 120),
      customer_unread_count = customer_unread_count + 1
  WHERE id = v_conv.id;

  INSERT INTO public.activity_events (
    actor_id, actor_role, event_type, customer_id, conversation_id, message_id, meta
  ) VALUES (
    auth.uid(), v_role, 'staff_chat_reply', v_conv.customer_id, v_conv.id, v_msg.id,
    jsonb_build_object(
      'is_first_response', v_conv.awaiting_staff,
      'first_response_seconds', v_first_resp_sec
    )
  );

  INSERT INTO public.notifications (recipient_id, type, title, body, link)
  VALUES (
    v_conv.customer_id, 'staff_reply', 'New reply from John Rambo Support', left(trim(p_body), 100), '/chat'
  );

  RETURN v_msg;
END;
$$;

-- 6.4 submit_offer
CREATE OR REPLACE FUNCTION public.submit_offer(
  p_product_id uuid,
  p_amount_paise bigint,
  p_client_msg_id text
)
RETURNS public.offers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod public.products;
  v_conv public.conversations;
  v_settings public.app_settings;
  v_offer public.offers;
  v_msg public.messages;
BEGIN
  IF NOT public.is_customer() THEN
    RAISE EXCEPTION 'FORBIDDEN: Active customer required.';
  END IF;

  SELECT * INTO v_settings FROM public.app_settings WHERE id = true;
  SELECT * INTO v_prod FROM public.products WHERE id = p_product_id AND status = 'available';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_PRODUCT: Product is not available.';
  END IF;

  IF p_amount_paise < 100 OR p_amount_paise > v_settings.offer_sanity_max_paise OR p_amount_paise > (v_prod.price_paise * 2) THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Offer amount is outside allowed bounds.';
  END IF;

  SELECT * INTO v_conv FROM public.conversations WHERE customer_id = auth.uid() FOR UPDATE;

  INSERT INTO public.offers (
    product_id, customer_id, conversation_id, offered_price_paise, listed_price_paise, product_title, status
  ) VALUES (
    v_prod.id, auth.uid(), v_conv.id, p_amount_paise, v_prod.price_paise, v_prod.title, 'pending'
  ) RETURNING * INTO v_offer;

  INSERT INTO public.messages (
    conversation_id, sender_kind, customer_sender_id, type, body, offer_id, client_msg_id
  ) VALUES (
    v_conv.id, 'customer', auth.uid(), 'offer',
    format('Submitted offer of %s cents for %s', p_amount_paise, v_prod.title),
    v_offer.id, p_client_msg_id
  ) RETURNING * INTO v_msg;

  INSERT INTO public.offer_events (offer_id, actor_id, event, meta)
  VALUES (v_offer.id, auth.uid(), 'submitted', jsonb_build_object('offered_price_paise', p_amount_paise));

  INSERT INTO public.activity_events (
    actor_id, actor_role, event_type, customer_id, conversation_id, offer_id, message_id
  ) VALUES (
    auth.uid(), 'customer', 'offer_submitted', auth.uid(), v_conv.id, v_offer.id, v_msg.id
  );

  UPDATE public.conversations
  SET awaiting_staff = true, last_message_at = now(), staff_unread_count = staff_unread_count + 1
  WHERE id = v_conv.id;

  RETURN v_offer;
END;
$$;

-- 6.5 create_ticket
CREATE OR REPLACE FUNCTION public.create_ticket(
  p_subject text,
  p_description text,
  p_category text,
  p_priority public.ticket_priority,
  p_requested_employee_id uuid DEFAULT NULL
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.app_settings;
  v_assigned uuid := NULL;
  v_status public.ticket_status := 'open';
  v_tkt public.tickets;
  v_boss_id uuid;
  v_room_id uuid;
BEGIN
  IF NOT public.is_customer() THEN
    RAISE EXCEPTION 'FORBIDDEN: Active customer required.';
  END IF;

  SELECT * INTO v_settings FROM public.app_settings WHERE id = true;

  IF p_requested_employee_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      JOIN public.profiles p ON p.id = sp.user_id
      WHERE sp.user_id = p_requested_employee_id
        AND p.role = 'employee' AND p.status = 'active'
        AND sp.accepts_tickets = true
    ) THEN
      v_assigned := p_requested_employee_id;
      v_status := 'assigned';
    ELSE
      RAISE EXCEPTION 'INVALID_EMPLOYEE_SELECTION: Employee is not selectable.';
    END IF;
  END IF;

  INSERT INTO public.tickets (
    customer_id, subject, description, category, priority, status, assigned_employee_id, requested_employee_id
  ) VALUES (
    auth.uid(), trim(p_subject), trim(p_description), p_category, p_priority, v_status, v_assigned, v_assigned
  ) RETURNING * INTO v_tkt;

  INSERT INTO public.ticket_messages (ticket_id, sender_kind, customer_sender_id, body)
  VALUES (v_tkt.id, 'customer', auth.uid(), trim(p_description));

  INSERT INTO public.ticket_events (ticket_id, actor_id, event, from_value, to_value)
  VALUES (v_tkt.id, auth.uid(), 'created', NULL, v_status::text);

  -- Automatically create a 3-member private Complaint Chat room when a specific employee is reported
  IF v_assigned IS NOT NULL THEN
    SELECT id INTO v_boss_id FROM public.profiles WHERE role = 'boss' LIMIT 1;
    IF v_boss_id IS NOT NULL THEN
      INSERT INTO public.complaint_chat_rooms (ticket_id, customer_id, employee_id, boss_id)
      VALUES (v_tkt.id, auth.uid(), v_assigned, v_boss_id)
      RETURNING id INTO v_room_id;

      INSERT INTO public.complaint_chat_messages (room_id, ticket_id, sender_id, body)
      VALUES (v_room_id, v_tkt.id, auth.uid(), trim(p_description));
    END IF;
  END IF;

  RETURN v_tkt;
END;
$$;

-- 6.6 assign_ticket (Boss only)
CREATE OR REPLACE FUNCTION public.assign_ticket(
  p_ticket_id uuid,
  p_employee_id uuid
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tkt public.tickets;
  v_prev uuid;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'FORBIDDEN: Only the Boss can assign or reassign tickets.';
  END IF;

  SELECT * INTO v_tkt FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND OR v_tkt.status = 'closed' THEN
    RAISE EXCEPTION 'INVALID_TICKET: Ticket not found or closed.';
  END IF;

  v_prev := v_tkt.assigned_employee_id;

  UPDATE public.tickets
  SET assigned_employee_id = p_employee_id,
      status = CASE WHEN status = 'open' THEN 'assigned'::public.ticket_status ELSE status END
  WHERE id = p_ticket_id
  RETURNING * INTO v_tkt;

  INSERT INTO public.ticket_events (ticket_id, actor_id, event, from_value, to_value)
  VALUES (
    p_ticket_id, auth.uid(),
    CASE WHEN v_prev IS NULL THEN 'assigned'::public.ticket_event_type ELSE 'reassigned'::public.ticket_event_type END,
    v_prev::text, p_employee_id::text
  );

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, before_meta, after_meta)
  VALUES (
    auth.uid(), 'assign_ticket', 'tickets', p_ticket_id::text,
    jsonb_build_object('assigned_employee_id', v_prev),
    jsonb_build_object('assigned_employee_id', p_employee_id)
  );

  RETURN v_tkt;
END;
$$;

-- 6.7 transition_ticket (Strict status machine enforcement)
CREATE OR REPLACE FUNCTION public.transition_ticket(
  p_ticket_id uuid,
  p_to_status public.ticket_status
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tkt public.tickets;
  v_from public.ticket_status;
  v_valid boolean := false;
BEGIN
  SELECT * INTO v_tkt FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Ticket does not exist.';
  END IF;

  v_from := v_tkt.status;
  IF v_from = 'closed' THEN
    RAISE EXCEPTION 'INVALID_TICKET_TRANSITION: Closed is final.';
  END IF;

  IF public.is_customer() THEN
    IF v_tkt.customer_id <> auth.uid() THEN
      RAISE EXCEPTION 'FORBIDDEN: Not ticket owner.';
    END IF;
    v_valid := (v_from = 'waiting_for_customer' AND p_to_status = 'in_progress')
            OR (v_from = 'resolved' AND p_to_status IN ('closed', 'in_progress'));
  ELSIF public.is_employee() THEN
    IF v_tkt.assigned_employee_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'FORBIDDEN: Only the assigned employee or Boss can transition this ticket.';
    END IF;
    v_valid := (v_from = 'assigned' AND p_to_status = 'in_progress')
            OR (v_from = 'in_progress' AND p_to_status IN ('waiting_for_customer', 'resolved'))
            OR (v_from = 'waiting_for_customer' AND p_to_status IN ('in_progress', 'resolved'))
            OR (v_from = 'resolved' AND p_to_status = 'in_progress');
  ELSIF public.is_boss() THEN
    v_valid := (v_from = 'open' AND p_to_status = 'assigned')
            OR (v_from = 'assigned' AND p_to_status = 'in_progress')
            OR (v_from = 'in_progress' AND p_to_status IN ('waiting_for_customer', 'resolved'))
            OR (v_from = 'waiting_for_customer' AND p_to_status IN ('in_progress', 'resolved'))
            OR (v_from = 'resolved' AND p_to_status IN ('closed', 'in_progress'));
  END IF;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'INVALID_TICKET_TRANSITION: Transition % -> % is not permitted.', v_from, p_to_status;
  END IF;

  UPDATE public.tickets
  SET status = p_to_status,
      reopen_count = CASE WHEN v_from = 'resolved' AND p_to_status = 'in_progress' THEN reopen_count + 1 ELSE reopen_count END,
      resolved_at = CASE WHEN p_to_status = 'resolved' THEN now() ELSE resolved_at END,
      closed_at = CASE WHEN p_to_status = 'closed' THEN now() ELSE closed_at END
  WHERE id = p_ticket_id
  RETURNING * INTO v_tkt;

  INSERT INTO public.ticket_events (ticket_id, actor_id, event, from_value, to_value)
  VALUES (
    p_ticket_id, auth.uid(),
    CASE
      WHEN v_from = 'resolved' AND p_to_status = 'in_progress' THEN 'reopened'::public.ticket_event_type
      WHEN p_to_status = 'resolved' THEN 'resolved'::public.ticket_event_type
      WHEN p_to_status = 'closed' THEN 'closed'::public.ticket_event_type
      ELSE 'status_changed'::public.ticket_event_type
    END,
    v_from::text, p_to_status::text
  );

  RETURN v_tkt;
END;
$$;

-- 6.8 acknowledge_staff_post
CREATE OR REPLACE FUNCTION public.acknowledge_staff_post(p_announcement_id uuid)
RETURNS public.staff_announcement_acks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ack public.staff_announcement_acks;
BEGIN
  IF NOT public.is_employee() THEN
    RAISE EXCEPTION 'FORBIDDEN: Only active employees acknowledge staff directives.';
  END IF;

  INSERT INTO public.staff_announcement_acks (announcement_id, employee_id, acknowledged_at)
  VALUES (p_announcement_id, auth.uid(), now())
  ON CONFLICT (announcement_id, employee_id) DO UPDATE
    SET acknowledged_at = public.staff_announcement_acks.acknowledged_at
  RETURNING * INTO v_ack;

  RETURN v_ack;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. PERFORMANCE ANALYTICS VIEW (WITH security_invoker = true)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_employee_performance
WITH (security_invoker = true)
AS
SELECT
  p.id AS employee_id,
  p.full_name AS employee_name,
  sp.public_alias,
  COUNT(ae.id) FILTER (WHERE ae.event_type = 'staff_chat_reply') AS chat_messages_sent,
  COUNT(ae.id) FILTER (WHERE ae.event_type = 'staff_ticket_reply') AS ticket_replies_sent,
  AVG((ae.meta->>'first_response_seconds')::numeric)
    FILTER (WHERE ae.event_type = 'staff_chat_reply' AND (ae.meta->>'is_first_response')::boolean = true)
    AS chat_first_response_avg_sec,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (ae.meta->>'first_response_seconds')::numeric)
    FILTER (WHERE ae.event_type = 'staff_chat_reply' AND (ae.meta->>'is_first_response')::boolean = true)
    AS chat_first_response_median_sec,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY (ae.meta->>'first_response_seconds')::numeric)
    FILTER (WHERE ae.event_type = 'staff_chat_reply' AND (ae.meta->>'is_first_response')::boolean = true)
    AS chat_first_response_p90_sec,
  COUNT(DISTINCT ae.conversation_id) FILTER (WHERE ae.event_type = 'staff_chat_reply') AS conversations_handled,
  COUNT(DISTINCT ae.offer_id) FILTER (WHERE ae.event_type IN ('offer_countered', 'offer_accepted', 'offer_rejected')) AS offers_handled_total
FROM public.profiles p
JOIN public.staff_profiles sp ON sp.user_id = p.id
LEFT JOIN public.activity_events ae ON ae.actor_id = p.id
WHERE p.role = 'employee'
GROUP BY p.id, p.full_name, sp.public_alias;

-- >>> END MIGRATION: 00001_schema_and_rls.sql <<<

-- >>> BEGIN MIGRATION: 00002_storage_buckets.sql <<<
-- ============================================================================
-- JOHN RAMBO — PRIVATE STORAGE BUCKETS & STORAGE RLS POLICIES
-- Migration: 00002_storage_buckets.sql
-- Architecture Rule 7: Store files in private buckets and serve through signed URLs.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-media', 'product-media', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('story-media', 'story-media', false, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
  ('avatars', 'avatars', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY product_media_read_active ON storage.objects
FOR SELECT USING (
  bucket_id = 'product-media' AND public.is_active()
);

CREATE POLICY product_media_write_staff ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'product-media' AND public.has_staff_flag('can_manage_products')
);

CREATE POLICY story_media_read_active ON storage.objects
FOR SELECT USING (
  bucket_id = 'story-media' AND public.is_active()
);

CREATE POLICY story_media_write_staff ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'story-media' AND public.has_staff_flag('can_publish_stories')
);

CREATE POLICY avatars_read_own_or_staff ON storage.objects
FOR SELECT USING (
  bucket_id = 'avatars'
  AND public.is_active()
  AND (public.is_staff() OR (storage.foldername(name))[1] = auth.uid()::text)
);

CREATE POLICY avatars_write_own ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'avatars'
  AND public.is_active()
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- >>> END MIGRATION: 00002_storage_buckets.sql <<<

-- >>> BEGIN MIGRATION: 00003_live_data_layer.sql <<<
-- ============================================================================
-- JOHN RAMBO — LIVE DATA LAYER: LOCKED-DOWN WRITES, SANITIZED CUSTOMER READS, RPCs
-- Migration: 00003_live_data_layer.sql
--
-- 1. Clients can no longer INSERT/UPDATE business tables directly. Every write
--    goes through a SECURITY DEFINER function that validates role, scope and input.
-- 2. Customers can no longer SELECT rows that carry staff user ids (conversations,
--    offers, tickets, events, complaint rooms, announcements, stories). They read
--    sanitized JSON from `c_*` functions instead (Decision 4: structural anonymity).
-- 3. `srv_*` functions are callable by the service role only (server-side code).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. SCHEMA ADDITIONS
-- ----------------------------------------------------------------------------

-- Outbound email log (approval / rejection notices). Actual delivery is wired later.
CREATE TABLE IF NOT EXISTS public.outbound_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email citext NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL,
  related_user_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbound_emails_sent_idx ON public.outbound_emails (sent_at DESC);
CREATE INDEX IF NOT EXISTS outbound_emails_related_user_idx ON public.outbound_emails (related_user_id);
ALTER TABLE public.outbound_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_emails FORCE ROW LEVEL SECURITY;
CREATE POLICY outbound_emails_select_staff ON public.outbound_emails
FOR SELECT USING (public.is_staff());

-- One shared "JR Family" group thread for all staff
INSERT INTO public.staff_threads (employee_id, is_group, title)
SELECT NULL, true, 'JR Family'
WHERE NOT EXISTS (SELECT 1 FROM public.staff_threads WHERE is_group);

-- Keep profiles.email in sync when a user confirms an email change in Supabase Auth
CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    PERFORM set_config('app.bypass_profile_guard', 'on', true);
    UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_email ON auth.users;
CREATE TRIGGER trg_sync_profile_email
AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email_from_auth();

-- ----------------------------------------------------------------------------
-- 1. SMALL HELPERS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_alias(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public_alias FROM public.staff_profiles WHERE user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.owns_ticket(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tickets
    WHERE id = p_ticket_id AND customer_id = auth.uid() AND public.is_customer()
  );
$$;

CREATE OR REPLACE FUNCTION public.format_usd(p_cents bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_cents % 100 = 0 THEN '$' || to_char(p_cents / 100, 'FM999,999,999,990')
    ELSE '$' || to_char(p_cents / 100.0, 'FM999,999,999,990.00')
  END;
$$;

CREATE OR REPLACE FUNCTION public.require_text(p_value text, p_label text, p_max integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_value IS NULL OR char_length(trim(p_value)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: % is required.', p_label;
  END IF;
  IF char_length(trim(p_value)) > p_max THEN
    RAISE EXCEPTION 'INVALID_INPUT: % must be at most % characters.', p_label, p_max;
  END IF;
  RETURN trim(p_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_users(
  p_recipients uuid[],
  p_type text,
  p_title text,
  p_body text,
  p_link text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (recipient_id, type, title, body, link, payload)
  SELECT DISTINCT r, p_type, left(p_title, 200), left(p_body, 300), p_link, p_payload
  FROM unnest(p_recipients) AS r
  WHERE r IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.active_staff_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(id), '{}')
  FROM public.profiles
  WHERE role IN ('boss', 'employee') AND status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.boss_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE role = 'boss' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.write_audit(
  p_actor uuid, p_action text, p_entity text, p_entity_id text,
  p_before jsonb DEFAULT NULL, p_after jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, before_meta, after_meta)
  VALUES (p_actor, p_action, p_entity, p_entity_id, p_before, p_after);
$$;

-- Sliding-window rate limit over an append-only table, enforced inside the database
CREATE OR REPLACE FUNCTION public.assert_rate_limit(p_count bigint, p_max integer, p_what text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_count >= p_max THEN
    RAISE EXCEPTION 'RATE_LIMITED: Too many % in a short time. Please wait and try again.', p_what;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. LOCK DOWN DIRECT WRITES AND STAFF-ID-BEARING READS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS profiles_update_own_policy ON public.profiles;
DROP POLICY IF EXISTS staff_profiles_write_boss ON public.staff_profiles;
DROP POLICY IF EXISTS app_settings_update_boss ON public.app_settings;
DROP POLICY IF EXISTS invitations_insert_staff ON public.invitations;
DROP POLICY IF EXISTS products_insert_policy ON public.products;
DROP POLICY IF EXISTS products_update_policy ON public.products;
DROP POLICY IF EXISTS conversations_update_policy ON public.conversations;
DROP POLICY IF EXISTS messages_insert_own_policy ON public.messages;
DROP POLICY IF EXISTS message_attribution_insert_staff ON public.message_attribution;
DROP POLICY IF EXISTS offers_insert_customer_policy ON public.offers;
DROP POLICY IF EXISTS offers_update_policy ON public.offers;
DROP POLICY IF EXISTS offer_events_insert_own_policy ON public.offer_events;
DROP POLICY IF EXISTS tickets_insert_customer_policy ON public.tickets;
DROP POLICY IF EXISTS tickets_update_policy ON public.tickets;
DROP POLICY IF EXISTS ticket_messages_insert_policy ON public.ticket_messages;
DROP POLICY IF EXISTS ticket_message_attr_insert_staff ON public.ticket_message_attribution;
DROP POLICY IF EXISTS ticket_events_insert_own_policy ON public.ticket_events;
DROP POLICY IF EXISTS complaint_chat_rooms_insert_policy ON public.complaint_chat_rooms;
DROP POLICY IF EXISTS complaint_chat_messages_insert_members ON public.complaint_chat_messages;
DROP POLICY IF EXISTS staff_thread_messages_insert_staff ON public.staff_thread_messages;
DROP POLICY IF EXISTS staff_announcements_insert_boss ON public.staff_announcements;
DROP POLICY IF EXISTS staff_acks_insert_employee ON public.staff_announcement_acks;
DROP POLICY IF EXISTS customer_announcements_insert_flag ON public.customer_announcements;
DROP POLICY IF EXISTS stories_insert_flag ON public.stories;
DROP POLICY IF EXISTS story_views_insert_customer ON public.story_views;

-- Settings: staff only (customers use get_app_settings(), which hides updated_by)
DROP POLICY IF EXISTS app_settings_select_active ON public.app_settings;
CREATE POLICY app_settings_select_staff ON public.app_settings
FOR SELECT USING (public.is_staff());

-- Conversations: staff in scope only (handled_by is a staff id)
DROP POLICY IF EXISTS conversations_select_policy ON public.conversations;
CREATE POLICY conversations_select_staff ON public.conversations
FOR SELECT USING (public.is_staff() AND public.can_access_conversation(id));

-- Offers & events: staff only (handled_by / actor_id are staff ids)
DROP POLICY IF EXISTS offers_select_policy ON public.offers;
CREATE POLICY offers_select_staff ON public.offers
FOR SELECT USING (public.is_staff() AND public.can_access_conversation(conversation_id));

DROP POLICY IF EXISTS offer_events_select_policy ON public.offer_events;
CREATE POLICY offer_events_select_staff ON public.offer_events
FOR SELECT USING (
  public.is_staff() AND EXISTS (
    SELECT 1 FROM public.offers o
    WHERE o.id = offer_events.offer_id AND public.can_access_conversation(o.conversation_id)
  )
);

-- Tickets & events: staff only (assigned/requested employee and actor ids)
DROP POLICY IF EXISTS tickets_select_policy ON public.tickets;
CREATE POLICY tickets_select_staff ON public.tickets
FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS ticket_events_select_policy ON public.ticket_events;
CREATE POLICY ticket_events_select_staff ON public.ticket_events
FOR SELECT USING (public.is_staff());

-- Ticket messages carry no staff ids: customers keep direct read of their own (for Realtime)
DROP POLICY IF EXISTS ticket_messages_select_policy ON public.ticket_messages;
CREATE POLICY ticket_messages_select_policy ON public.ticket_messages
FOR SELECT USING (public.is_staff() OR public.owns_ticket(ticket_id));

-- Complaint rooms: staff members only (customers use c_get_complaint_room / c_list_complaint_messages)
DROP POLICY IF EXISTS complaint_chat_rooms_select_members ON public.complaint_chat_rooms;
CREATE POLICY complaint_chat_rooms_select_staff_members ON public.complaint_chat_rooms
FOR SELECT USING (public.is_staff() AND auth.uid() IN (boss_id, employee_id));

DROP POLICY IF EXISTS complaint_chat_messages_select_members ON public.complaint_chat_messages;
CREATE POLICY complaint_chat_messages_select_staff_members ON public.complaint_chat_messages
FOR SELECT USING (public.is_staff() AND public.is_complaint_room_member(room_id));

-- Announcements & stories: author_id is a staff id
DROP POLICY IF EXISTS customer_announcements_select_active ON public.customer_announcements;
CREATE POLICY customer_announcements_select_staff ON public.customer_announcements
FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS stories_select_policy ON public.stories;
CREATE POLICY stories_select_staff ON public.stories
FOR SELECT USING (public.is_staff());

-- Notifications: read own; marking read goes through mark_notifications_read()
DROP POLICY IF EXISTS notifications_own_policy ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
FOR SELECT USING (public.is_active() AND recipient_id = auth.uid());

-- Retire the spin bonus and the old performance view (metrics are computed in the app)
DROP TABLE IF EXISTS public.spin_bonuses;
DROP VIEW IF EXISTS public.v_employee_performance;

-- ----------------------------------------------------------------------------
-- 3. SANITIZED READS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_app_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'employeeInboxScope', s.employee_inbox_scope,
    'customerCanPickEmployee', s.customer_can_pick_employee,
    'ticketAutoCloseDays', s.ticket_auto_close_days,
    'offerSanityMaxPaise', s.offer_sanity_max_paise,
    'businessHoursOnly', s.business_hours_only,
    'updatedBy', CASE WHEN public.is_staff() THEN s.updated_by END,
    'updatedAt', s.updated_at
  )
  FROM public.app_settings s
  WHERE s.id AND public.is_active();
$$;

CREATE OR REPLACE FUNCTION public.c_get_conversation()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'customerId', c.customer_id,
    'customerName', p.full_name,
    'customerEmail', p.email,
    'handledBy', NULL, 'handledByName', NULL, 'handledByAlias', NULL,
    'awaitingStaff', c.awaiting_staff,
    'lastMessageAt', c.last_message_at,
    'lastMessagePreview', c.last_message_preview,
    'customerLastReadAt', c.customer_last_read_at,
    'staffLastReadAt', NULL,
    'customerUnreadCount', c.customer_unread_count,
    'staffUnreadCount', 0,
    'createdAt', c.created_at
  )
  FROM public.conversations c
  JOIN public.profiles p ON p.id = c.customer_id
  WHERE c.customer_id = auth.uid() AND public.is_customer();
$$;

CREATE OR REPLACE FUNCTION public.c_offer_json(o public.offers)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', o.id,
    'productId', o.product_id,
    'customerId', o.customer_id,
    'conversationId', o.conversation_id,
    'offeredPricePaise', o.offered_price_paise,
    'listedPricePaise', o.listed_price_paise,
    'productTitle', o.product_title,
    'gameName', (SELECT game_name FROM public.products WHERE id = o.product_id),
    'status', o.status,
    'counterPricePaise', o.counter_price_paise,
    'staffNote', o.staff_note,
    'handledBy', NULL,
    'handledByName', NULL,
    'createdAt', o.created_at,
    'updatedAt', o.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION public.c_list_offers()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(public.c_offer_json(o) ORDER BY o.created_at DESC), '[]'::jsonb)
  FROM public.offers o
  WHERE o.customer_id = auth.uid() AND public.is_customer();
$$;

CREATE OR REPLACE FUNCTION public.c_list_offer_events(p_offer_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'offerId', e.offer_id,
    'actorId', CASE WHEN e.actor_id = auth.uid() THEN e.actor_id::text ELSE 'staff-anon' END,
    'event', e.event,
    'meta', e.meta - 'note',
    'createdAt', e.created_at
  ) ORDER BY e.created_at), '[]'::jsonb)
  FROM public.offer_events e
  JOIN public.offers o ON o.id = e.offer_id
  WHERE e.offer_id = p_offer_id AND o.customer_id = auth.uid() AND public.is_customer();
$$;

CREATE OR REPLACE FUNCTION public.c_ticket_json(t public.tickets)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'ticketNo', t.ticket_no,
    'customerId', t.customer_id,
    'customerName', (SELECT full_name FROM public.profiles WHERE id = t.customer_id),
    'subject', t.subject,
    'description', t.description,
    'category', t.category,
    'priority', t.priority,
    'status', t.status,
    'assignedEmployeeId', NULL,
    'assignedEmployeeName', NULL,
    'assignedEmployeeAlias', CASE
      WHEN (SELECT customer_can_pick_employee FROM public.app_settings WHERE id)
      THEN public.staff_alias(t.assigned_employee_id) END,
    'requestedEmployeeId', NULL,
    'requestedEmployeeAlias', public.staff_alias(t.requested_employee_id),
    'reopenCount', t.reopen_count,
    'createdAt', t.created_at,
    'firstResponseAt', t.first_response_at,
    'resolvedAt', t.resolved_at,
    'closedAt', t.closed_at
  );
$$;

CREATE OR REPLACE FUNCTION public.c_list_tickets()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(public.c_ticket_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  FROM public.tickets t
  WHERE t.customer_id = auth.uid() AND public.is_customer();
$$;

CREATE OR REPLACE FUNCTION public.c_list_ticket_events(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'ticketId', e.ticket_id,
    'actorId', CASE WHEN e.actor_id = auth.uid() THEN e.actor_id::text ELSE 'staff-anon' END,
    'actorDisplayName', CASE
      WHEN e.actor_id = auth.uid() THEN (SELECT full_name FROM public.profiles WHERE id = auth.uid())
      ELSE 'John Rambo Support' END,
    'event', e.event,
    -- assignment events carry employee ids: never expose them
    'fromValue', CASE WHEN e.event IN ('assigned', 'reassigned') THEN NULL ELSE e.from_value END,
    'toValue', CASE WHEN e.event IN ('assigned', 'reassigned') THEN NULL ELSE e.to_value END,
    'createdAt', e.created_at
  ) ORDER BY e.created_at), '[]'::jsonb)
  FROM public.ticket_events e
  WHERE e.ticket_id = p_ticket_id AND public.owns_ticket(p_ticket_id);
$$;

-- Complaint room as seen by its customer member: staff appear by public alias only
CREATE OR REPLACE FUNCTION public.c_get_complaint_room(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'ticketId', r.ticket_id,
    'ticketNo', t.ticket_no,
    'customerId', r.customer_id,
    'customerName', (SELECT full_name FROM public.profiles WHERE id = r.customer_id),
    'employeeId', 'staff-employee',
    'employeeName', public.staff_alias(r.employee_id),
    'employeeAlias', public.staff_alias(r.employee_id),
    'bossId', 'staff-boss',
    'bossName', COALESCE(public.staff_alias(r.boss_id), 'Main Admin'),
    'memberIds', jsonb_build_array('staff-boss', 'staff-employee', r.customer_id),
    'createdAt', r.created_at
  )
  FROM public.complaint_chat_rooms r
  JOIN public.tickets t ON t.id = r.ticket_id
  WHERE r.ticket_id = p_ticket_id AND r.customer_id = auth.uid() AND public.is_customer();
$$;

CREATE OR REPLACE FUNCTION public.complaint_display_name(p_sender uuid, p_room public.complaint_chat_rooms)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_sender = p_room.boss_id THEN COALESCE(public.staff_alias(p_sender), 'Main Admin') || ' (Main Admin / Boss)'
    WHEN p_sender = p_room.employee_id THEN public.staff_alias(p_sender) || ' (Employee)'
    ELSE (SELECT full_name FROM public.profiles WHERE id = p_sender) || ' (Customer)'
  END;
$$;

CREATE OR REPLACE FUNCTION public.c_list_complaint_messages(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'roomId', m.room_id,
    'ticketId', m.ticket_id,
    'senderId', CASE
      WHEN m.sender_id = r.boss_id THEN 'staff-boss'
      WHEN m.sender_id = r.employee_id THEN 'staff-employee'
      ELSE m.sender_id::text END,
    'senderRole', p.role,
    'senderDisplayName', public.complaint_display_name(m.sender_id, r),
    'body', m.body,
    'createdAt', m.created_at
  ) ORDER BY m.created_at), '[]'::jsonb)
  FROM public.complaint_chat_messages m
  JOIN public.complaint_chat_rooms r ON r.id = m.room_id
  JOIN public.profiles p ON p.id = m.sender_id
  WHERE r.ticket_id = p_ticket_id AND r.customer_id = auth.uid() AND public.is_customer();
$$;

-- Staff a customer may pick or name in a ticket. Customers never receive staff ids
-- (Decision 4): the public alias (unique) is the selection key, resolved in create_ticket.
DROP FUNCTION IF EXISTS public.get_selectable_staff_aliases();
CREATE OR REPLACE FUNCTION public.get_selectable_staff_aliases()
RETURNS TABLE (selection_key text, public_alias text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.public_alias, sp.public_alias
  FROM public.staff_profiles sp
  JOIN public.profiles p ON p.id = sp.user_id
  CROSS JOIN public.app_settings s
  WHERE public.is_active()
    AND s.customer_can_pick_employee = true
    AND p.role = 'employee'
    AND p.status = 'active'
    AND sp.customer_selectable = true
    AND sp.accepts_tickets = true
  ORDER BY sp.public_alias;
$$;

CREATE OR REPLACE FUNCTION public.list_reportable_staff_aliases()
RETURNS TABLE (selection_key text, public_alias text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.public_alias, sp.public_alias
  FROM public.staff_profiles sp
  JOIN public.profiles p ON p.id = sp.user_id
  WHERE public.is_active()
    AND p.role = 'employee' AND p.status = 'active' AND sp.accepts_tickets
  ORDER BY sp.public_alias;
$$;

CREATE OR REPLACE FUNCTION public.list_customer_announcements()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'authorId', CASE WHEN public.is_staff() THEN a.author_id::text ELSE '' END,
    'title', a.title,
    'body', a.body,
    'pinned', a.pinned,
    'publishedAt', a.published_at
  ) ORDER BY a.pinned DESC, a.published_at DESC), '[]'::jsonb)
  FROM public.customer_announcements a
  WHERE public.is_active();
$$;

CREATE OR REPLACE FUNCTION public.list_stories(p_include_expired boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'authorId', CASE WHEN public.is_staff() THEN s.author_id::text ELSE '' END,
    'authorIsBoss', (s.author_id = public.boss_id()),
    'kind', s.kind,
    'mediaPath', s.media_path,
    'caption', s.caption,
    'bgStyle', s.bg_style,
    'createdAt', s.created_at,
    'expiresAt', s.expires_at,
    'viewCount', CASE WHEN public.is_staff()
      THEN (SELECT count(*) FROM public.story_views v WHERE v.story_id = s.id) ELSE 0 END,
    'viewedByCaller', EXISTS (
      SELECT 1 FROM public.story_views v WHERE v.story_id = s.id AND v.customer_id = auth.uid())
  ) ORDER BY s.created_at DESC), '[]'::jsonb)
  FROM public.stories s
  WHERE public.is_active()
    AND (s.expires_at > now() OR (p_include_expired AND public.is_staff()));
$$;

-- ----------------------------------------------------------------------------
-- 4. CUSTOMER / STAFF MUTATIONS
-- ----------------------------------------------------------------------------

-- 4.1 Profiles & settings ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_own_profile(p_full_name text, p_phone text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.profiles;
BEGIN
  IF NOT public.is_customer() THEN
    RAISE EXCEPTION 'FORBIDDEN: Customer role required.';
  END IF;
  IF p_phone IS NOT NULL AND trim(p_phone) <> '' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE phone = trim(p_phone) AND id <> auth.uid()
  ) THEN
    RAISE EXCEPTION 'CONFLICT: Phone number is already in use.';
  END IF;

  UPDATE public.profiles
  SET full_name = public.require_text(p_full_name, 'Full name', 80),
      phone = NULLIF(trim(COALESCE(p_phone, '')), '')
  WHERE id = auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_app_settings(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before public.app_settings;
  v_after public.app_settings;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'FORBIDDEN: Boss authority required.';
  END IF;
  SELECT * INTO v_before FROM public.app_settings WHERE id FOR UPDATE;

  UPDATE public.app_settings SET
    employee_inbox_scope = COALESCE((p_patch->>'employeeInboxScope')::public.inbox_scope_mode, employee_inbox_scope),
    customer_can_pick_employee = COALESCE((p_patch->>'customerCanPickEmployee')::boolean, customer_can_pick_employee),
    ticket_auto_close_days = COALESCE((p_patch->>'ticketAutoCloseDays')::integer, ticket_auto_close_days),
    offer_sanity_max_paise = COALESCE((p_patch->>'offerSanityMaxPaise')::bigint, offer_sanity_max_paise),
    business_hours_only = COALESCE((p_patch->>'businessHoursOnly')::boolean, business_hours_only),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id
  RETURNING * INTO v_after;

  PERFORM public.write_audit(auth.uid(), 'update_app_settings', 'app_settings', 'singleton',
    to_jsonb(v_before), to_jsonb(v_after));
  RETURN public.get_app_settings();
END;
$$;

CREATE OR REPLACE FUNCTION public.update_staff_flags(
  p_employee_id uuid,
  p_public_alias text,
  p_customer_selectable boolean,
  p_accepts_tickets boolean,
  p_can_manage_products boolean,
  p_can_publish_stories boolean,
  p_can_post_customer_announcements boolean
)
RETURNS public.staff_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before public.staff_profiles;
  v_after public.staff_profiles;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'FORBIDDEN: Boss authority required.';
  END IF;
  SELECT sp.* INTO v_before FROM public.staff_profiles sp
  JOIN public.profiles p ON p.id = sp.user_id
  WHERE sp.user_id = p_employee_id AND p.role = 'employee'
  FOR UPDATE OF sp;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Employee not found.';
  END IF;

  UPDATE public.staff_profiles SET
    public_alias = public.require_text(p_public_alias, 'Public alias', 40),
    customer_selectable = p_customer_selectable,
    accepts_tickets = p_accepts_tickets,
    can_manage_products = p_can_manage_products,
    can_publish_stories = p_can_publish_stories,
    can_post_customer_announcements = p_can_post_customer_announcements,
    updated_at = now()
  WHERE user_id = p_employee_id
  RETURNING * INTO v_after;

  PERFORM public.write_audit(auth.uid(), 'update_staff_flags', 'staff_profiles', p_employee_id::text,
    to_jsonb(v_before), to_jsonb(v_after));
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_status(p_target uuid, p_status public.user_status)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.profiles;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'FORBIDDEN: Boss authority required.';
  END IF;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_target FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Target user not found.';
  END IF;
  IF v_target.role = 'boss' THEN
    RAISE EXCEPTION 'FORBIDDEN: Cannot suspend the singleton Boss account.';
  END IF;
  IF p_status = 'pending_approval'
     AND (v_target.approved_at IS NOT NULL OR v_target.status IN ('active', 'suspended')) THEN
    RAISE EXCEPTION 'INVALID_STATUS: Approval happens once. Suspending or unsuspending cannot send a user back to the approval queue.';
  END IF;

  UPDATE public.profiles SET status = p_status WHERE id = p_target RETURNING * INTO v_target;
  PERFORM public.write_audit(auth.uid(), 'user_status_changed', 'profiles', p_target::text,
    NULL, jsonb_build_object('status', p_status));
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_pending_user(
  p_target uuid,
  p_decision text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles;
  v_target public.profiles;
  v_prev public.user_status;
  v_email public.outbound_emails;
  v_kind text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN: Customers cannot approve or reject anyone.';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'INVALID_INPUT: Decision must be approve or reject.';
  END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_target FROM public.profiles WHERE id = p_target FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Target user not found.';
  END IF;
  IF v_target.role = 'boss' THEN
    RAISE EXCEPTION 'FORBIDDEN: Cannot modify Boss account approval.';
  END IF;
  IF v_target.role = 'employee' AND v_actor.role <> 'boss' THEN
    RAISE EXCEPTION 'FORBIDDEN: Employee approval is BOKA-only. Employees cannot approve or reject other employees.';
  END IF;
  IF v_target.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'INVALID_STATUS: User is currently "%" and is not awaiting first-login approval.', v_target.status;
  END IF;

  v_prev := v_target.status;
  v_kind := v_target.role || CASE WHEN p_decision = 'approve' THEN '_approved' ELSE '_rejected' END;

  IF p_decision = 'approve' THEN
    UPDATE public.profiles
    SET status = 'active', approved_by = auth.uid(), approved_at = now()
    WHERE id = p_target RETURNING * INTO v_target;

    INSERT INTO public.outbound_emails (to_email, subject, body, kind, related_user_id)
    VALUES (v_target.email, 'Your John Rambo Account is Active',
      format('Hello %s, your account has been approved and is now active. You may now sign in.', v_target.full_name),
      v_kind, v_target.id)
    RETURNING * INTO v_email;
  ELSE
    UPDATE public.profiles SET status = 'rejected' WHERE id = p_target RETURNING * INTO v_target;

    INSERT INTO public.outbound_emails (to_email, subject, body, kind, related_user_id)
    VALUES (v_target.email, 'John Rambo Account Notice',
      'Thank you for your interest. We are unable to complete your account registration at this time.',
      v_kind, v_target.id)
    RETURNING * INTO v_email;
  END IF;

  PERFORM public.write_audit(auth.uid(), v_kind, 'profiles', p_target::text,
    jsonb_build_object('status', v_prev),
    jsonb_build_object('status', v_target.status, 'decision', p_decision, 'approvedBy', auth.uid(),
      'approvedByName', v_actor.full_name, 'targetRole', v_target.role, 'note', p_note));

  RETURN jsonb_build_object(
    'profile', to_jsonb(v_target),
    'emailNotice', jsonb_build_object(
      'id', v_email.id, 'to', v_email.to_email, 'subject', v_email.subject,
      'body', v_email.body, 'kind', v_email.kind, 'sentAt', v_email.sent_at)
  );
END;
$$;

-- 4.2 Products ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_product(
  p_id uuid,
  p_game_name text,
  p_title text,
  p_points_qty integer,
  p_description text,
  p_image_path text,
  p_price_paise bigint,
  p_status public.product_status
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before public.products;
  v_row public.products;
BEGIN
  IF NOT public.has_staff_flag('can_manage_products') THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller lacks can_manage_products permission.';
  END IF;
  IF p_price_paise IS NULL OR p_price_paise < 100 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Price must be at least $1.';
  END IF;
  IF p_points_qty IS NULL OR p_points_qty <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Points quantity must be positive.';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_before FROM public.products WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND: Product not found.';
    END IF;
    UPDATE public.products SET
      game_name = public.require_text(p_game_name, 'Game name', 80),
      title = public.require_text(p_title, 'Title', 120),
      points_qty = p_points_qty,
      description = public.require_text(p_description, 'Description', 2000),
      image_path = COALESCE(p_image_path, image_path),
      price_paise = p_price_paise,
      status = p_status,
      updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_row;
    PERFORM public.write_audit(auth.uid(), 'update_product', 'products', v_row.id::text,
      jsonb_build_object('pricePaise', v_before.price_paise, 'status', v_before.status),
      jsonb_build_object('pricePaise', v_row.price_paise, 'status', v_row.status));
  ELSE
    INSERT INTO public.products (game_name, title, points_qty, description, image_path, price_paise, status, created_by)
    VALUES (
      public.require_text(p_game_name, 'Game name', 80),
      public.require_text(p_title, 'Title', 120),
      p_points_qty,
      public.require_text(p_description, 'Description', 2000),
      p_image_path, p_price_paise, p_status, auth.uid()
    )
    RETURNING * INTO v_row;
    PERFORM public.write_audit(auth.uid(), 'create_product', 'products', v_row.id::text, NULL,
      jsonb_build_object('title', v_row.title, 'pricePaise', v_row.price_paise, 'status', v_row.status));
  END IF;
  RETURN v_row;
END;
$$;

-- 4.3 Customer chat ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_customer_message(
  p_conversation_id uuid,
  p_body text,
  p_client_msg_id text
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.conversations;
  v_msg public.messages;
  v_body text := public.require_text(p_body, 'Message', 2000);
  v_name text;
BEGIN
  IF NOT public.is_customer() THEN
    RAISE EXCEPTION 'FORBIDDEN: Active customer required.';
  END IF;

  SELECT * INTO v_conv FROM public.conversations
  WHERE id = p_conversation_id AND customer_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: Customers can only message in their own conversation.';
  END IF;

  -- Idempotent retry: same client id returns the original message
  SELECT * INTO v_msg FROM public.messages
  WHERE conversation_id = v_conv.id AND client_msg_id = p_client_msg_id;
  IF FOUND THEN
    RETURN v_msg;
  END IF;

  PERFORM public.assert_rate_limit(
    (SELECT count(*) FROM public.messages
     WHERE customer_sender_id = auth.uid() AND created_at > now() - interval '1 minute'),
    30, 'messages');

  INSERT INTO public.messages (conversation_id, sender_kind, customer_sender_id, type, body, client_msg_id)
  VALUES (v_conv.id, 'customer', auth.uid(), 'text', v_body, p_client_msg_id)
  RETURNING * INTO v_msg;

  UPDATE public.conversations
  SET awaiting_staff = true,
      last_message_at = now(),
      last_message_preview = left(v_body, 120),
      staff_unread_count = staff_unread_count + 1
  WHERE id = v_conv.id;

  INSERT INTO public.activity_events (actor_id, actor_role, event_type, customer_id, conversation_id, message_id)
  VALUES (auth.uid(), 'customer', 'customer_message_sent', auth.uid(), v_conv.id, v_msg.id);

  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();
  IF v_conv.handled_by IS NOT NULL THEN
    PERFORM public.notify_users(ARRAY[v_conv.handled_by], 'customer_message',
      'New message from ' || v_name, v_body, '/employee/inbox', jsonb_build_object('conversationId', v_conv.id));
    PERFORM public.notify_users(ARRAY[public.boss_id()], 'customer_message',
      'New message from ' || v_name, v_body, '/boss/inbox', jsonb_build_object('conversationId', v_conv.id));
  ELSE
    PERFORM public.notify_users(
      ARRAY(SELECT id FROM public.profiles WHERE role = 'employee' AND status = 'active'),
      'customer_message', 'New message from ' || v_name, v_body, '/employee/inbox',
      jsonb_build_object('conversationId', v_conv.id));
    PERFORM public.notify_users(ARRAY[public.boss_id()], 'customer_message',
      'New message from ' || v_name, v_body, '/boss/inbox', jsonb_build_object('conversationId', v_conv.id));
  END IF;

  RETURN v_msg;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_staff_message(
  p_conversation_id uuid,
  p_body text,
  p_client_msg_id text
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.conversations;
  v_msg public.messages;
  v_role public.user_role;
  v_first_resp_sec numeric;
  v_body text := public.require_text(p_body, 'Message', 2000);
BEGIN
  IF NOT public.is_staff() OR NOT public.can_access_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Staff member does not have access to this conversation.';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;

  SELECT * INTO v_msg FROM public.messages
  WHERE conversation_id = v_conv.id AND client_msg_id = p_client_msg_id;
  IF FOUND THEN
    RETURN v_msg;
  END IF;

  IF v_conv.awaiting_staff AND v_conv.last_message_at IS NOT NULL THEN
    v_first_resp_sec := GREATEST(1, round(EXTRACT(EPOCH FROM (now() - v_conv.last_message_at))));
  END IF;

  INSERT INTO public.messages (conversation_id, sender_kind, customer_sender_id, type, body, client_msg_id)
  VALUES (v_conv.id, 'staff', NULL, 'text', v_body, p_client_msg_id)
  RETURNING * INTO v_msg;

  INSERT INTO public.message_attribution (message_id, staff_id) VALUES (v_msg.id, auth.uid());

  UPDATE public.conversations
  SET handled_by = COALESCE(handled_by, CASE WHEN v_role = 'employee' THEN auth.uid() END),
      awaiting_staff = false,
      last_message_at = now(),
      last_message_preview = left(v_body, 120),
      customer_unread_count = customer_unread_count + 1
  WHERE id = v_conv.id;

  INSERT INTO public.activity_events (actor_id, actor_role, event_type, customer_id, conversation_id, message_id, meta)
  VALUES (auth.uid(), v_role, 'staff_chat_reply', v_conv.customer_id, v_conv.id, v_msg.id,
    jsonb_strip_nulls(jsonb_build_object(
      'is_first_response', v_conv.awaiting_staff,
      'first_response_seconds', v_first_resp_sec)));

  PERFORM public.notify_users(ARRAY[v_conv.customer_id], 'staff_reply',
    'New reply from John Rambo Support', v_body, '/chat', jsonb_build_object('conversationId', v_conv.id));

  RETURN v_msg;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_conversation(p_conversation_id) THEN
    RETURN;
  END IF;
  IF public.is_customer() THEN
    UPDATE public.conversations
    SET customer_last_read_at = now(), customer_unread_count = 0
    WHERE id = p_conversation_id AND customer_id = auth.uid();
  ELSE
    UPDATE public.conversations
    SET staff_last_read_at = now(), staff_unread_count = 0
    WHERE id = p_conversation_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reassign_conversation(p_conversation_id uuid, p_employee_id uuid)
RETURNS public.conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.conversations;
  v_prev uuid;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'FORBIDDEN: Boss authority required.';
  END IF;
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Conversation not found.';
  END IF;
  IF p_employee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_employee_id AND role = 'employee'
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: Target employee not found.';
  END IF;

  v_prev := v_conv.handled_by;
  UPDATE public.conversations SET handled_by = p_employee_id WHERE id = p_conversation_id
  RETURNING * INTO v_conv;

  PERFORM public.write_audit(auth.uid(), 'reassign_conversation', 'conversations', p_conversation_id::text,
    jsonb_build_object('handledBy', v_prev), jsonb_build_object('handledBy', p_employee_id));
  RETURN v_conv;
END;
$$;

-- 4.4 Offers -----------------------------------------------------------------

DROP FUNCTION IF EXISTS public.submit_offer(uuid, bigint, text);
CREATE OR REPLACE FUNCTION public.submit_offer(
  p_product_id uuid,
  p_amount_paise bigint,
  p_client_msg_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod public.products;
  v_conv public.conversations;
  v_settings public.app_settings;
  v_offer public.offers;
  v_msg public.messages;
  v_body text;
  v_name text;
BEGIN
  IF NOT public.is_customer() THEN
    RAISE EXCEPTION 'FORBIDDEN: Active customer required.';
  END IF;

  SELECT * INTO v_conv FROM public.conversations WHERE customer_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Customer conversation not found.';
  END IF;

  -- Idempotent retry
  SELECT * INTO v_msg FROM public.messages
  WHERE conversation_id = v_conv.id AND client_msg_id = p_client_msg_id;
  IF FOUND THEN
    SELECT * INTO v_offer FROM public.offers WHERE id = v_msg.offer_id;
    RETURN jsonb_build_object('offer', public.c_offer_json(v_offer), 'message', to_jsonb(v_msg));
  END IF;

  PERFORM public.assert_rate_limit(
    (SELECT count(*) FROM public.offers
     WHERE customer_id = auth.uid() AND created_at > now() - interval '1 hour'),
    10, 'offers');

  SELECT * INTO v_settings FROM public.app_settings WHERE id;
  SELECT * INTO v_prod FROM public.products WHERE id = p_product_id AND status = 'available';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_PRODUCT: Product is not available for offers.';
  END IF;

  IF p_amount_paise IS NULL OR p_amount_paise < 100
     OR p_amount_paise > v_settings.offer_sanity_max_paise
     OR p_amount_paise > v_prod.price_paise * 2 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Offer must be between $1 and %.',
      public.format_usd(LEAST(v_settings.offer_sanity_max_paise, v_prod.price_paise * 2));
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.offers
    WHERE customer_id = auth.uid() AND product_id = v_prod.id AND status IN ('pending', 'countered')
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_OFFER: You already have an active offer on this product.';
  END IF;

  INSERT INTO public.offers (product_id, customer_id, conversation_id, offered_price_paise, listed_price_paise, product_title, status)
  VALUES (v_prod.id, auth.uid(), v_conv.id, p_amount_paise, v_prod.price_paise, v_prod.title, 'pending')
  RETURNING * INTO v_offer;

  v_body := format('Submitted an offer of %s for %s (Listed: %s).',
    public.format_usd(p_amount_paise), v_prod.title, public.format_usd(v_prod.price_paise));

  INSERT INTO public.messages (conversation_id, sender_kind, customer_sender_id, type, body, offer_id, client_msg_id)
  VALUES (v_conv.id, 'customer', auth.uid(), 'offer', v_body, v_offer.id, p_client_msg_id)
  RETURNING * INTO v_msg;

  INSERT INTO public.offer_events (offer_id, actor_id, event, meta)
  VALUES (v_offer.id, auth.uid(), 'submitted',
    jsonb_build_object('offered_price_paise', p_amount_paise, 'listed_price_paise', v_prod.price_paise));

  INSERT INTO public.activity_events (actor_id, actor_role, event_type, customer_id, conversation_id, offer_id, message_id, meta)
  VALUES (auth.uid(), 'customer', 'offer_submitted', auth.uid(), v_conv.id, v_offer.id, v_msg.id,
    jsonb_build_object('offered_price_paise', p_amount_paise));

  UPDATE public.conversations
  SET awaiting_staff = true, last_message_at = now(),
      last_message_preview = left(v_body, 120), staff_unread_count = staff_unread_count + 1
  WHERE id = v_conv.id;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();
  PERFORM public.notify_users(
    ARRAY(SELECT id FROM public.profiles WHERE role = 'employee' AND status = 'active'),
    'offer_submitted', 'New Offer: ' || public.format_usd(p_amount_paise),
    format('%s offered %s on %s.', v_name, public.format_usd(p_amount_paise), v_prod.title),
    '/employee/offers', jsonb_build_object('offerId', v_offer.id, 'conversationId', v_conv.id));
  PERFORM public.notify_users(ARRAY[public.boss_id()],
    'offer_submitted', 'New Offer: ' || public.format_usd(p_amount_paise),
    format('%s offered %s on %s.', v_name, public.format_usd(p_amount_paise), v_prod.title),
    '/boss/inbox', jsonb_build_object('offerId', v_offer.id, 'conversationId', v_conv.id));

  RETURN jsonb_build_object('offer', public.c_offer_json(v_offer), 'message', to_jsonb(v_msg));
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_offer(
  p_offer_id uuid,
  p_action text,
  p_counter_price_paise bigint DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.offers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.offers;
  v_conv public.conversations;
  v_role public.user_role;
  v_settings public.app_settings;
  v_event public.offer_event_type;
  v_summary text;
  v_msg public.messages;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN: Staff authority required.';
  END IF;
  IF p_action NOT IN ('counter', 'accept', 'reject') THEN
    RAISE EXCEPTION 'INVALID_INPUT: Unknown offer action.';
  END IF;

  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Offer not found.';
  END IF;
  IF NOT public.can_access_conversation(v_offer.conversation_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Offer is outside staff member scope.';
  END IF;
  IF v_offer.status NOT IN ('pending', 'countered') THEN
    RAISE EXCEPTION 'INVALID_OFFER_STATE: Cannot % an offer in "%" status.', p_action, v_offer.status;
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_settings FROM public.app_settings WHERE id;

  IF p_action = 'counter' THEN
    IF p_counter_price_paise IS NULL OR p_counter_price_paise < 100
       OR p_counter_price_paise > v_settings.offer_sanity_max_paise THEN
      RAISE EXCEPTION 'INVALID_AMOUNT: Valid counter price is required.';
    END IF;
    v_event := 'countered';
    v_summary := format('John Rambo Support countered your offer on %s at %s.',
      v_offer.product_title, public.format_usd(p_counter_price_paise));
  ELSIF p_action = 'accept' THEN
    v_event := 'accepted';
    v_summary := format('John Rambo Support accepted your offer on %s!', v_offer.product_title);
  ELSE
    v_event := 'rejected';
    v_summary := format('John Rambo Support declined your offer on %s.', v_offer.product_title);
  END IF;

  UPDATE public.offers SET
    status = CASE p_action WHEN 'counter' THEN 'countered' WHEN 'accept' THEN 'accepted' ELSE 'rejected' END::public.offer_status,
    counter_price_paise = CASE WHEN p_action = 'counter' THEN p_counter_price_paise ELSE counter_price_paise END,
    staff_note = COALESCE(NULLIF(left(trim(COALESCE(p_note, '')), 500), ''), staff_note),
    handled_by = auth.uid(),
    updated_at = now()
  WHERE id = p_offer_id
  RETURNING * INTO v_offer;

  INSERT INTO public.offer_events (offer_id, actor_id, event, meta)
  VALUES (v_offer.id, auth.uid(), v_event,
    jsonb_build_object('counter_price_paise', v_offer.counter_price_paise, 'note', v_offer.staff_note));

  INSERT INTO public.messages (conversation_id, sender_kind, customer_sender_id, type, body, offer_id, client_msg_id)
  VALUES (v_offer.conversation_id, 'staff', NULL, 'offer', v_summary, v_offer.id,
    'sys-offer-' || gen_random_uuid())
  RETURNING * INTO v_msg;
  INSERT INTO public.message_attribution (message_id, staff_id) VALUES (v_msg.id, auth.uid());

  UPDATE public.conversations SET
    awaiting_staff = false,
    handled_by = COALESCE(handled_by, CASE WHEN v_role = 'employee' THEN auth.uid() END),
    last_message_at = now(),
    last_message_preview = left(v_summary, 120),
    customer_unread_count = customer_unread_count + 1
  WHERE id = v_offer.conversation_id;

  INSERT INTO public.activity_events (actor_id, actor_role, event_type, customer_id, conversation_id, offer_id, message_id, meta)
  VALUES (auth.uid(), v_role, 'offer_' || v_event, v_offer.customer_id, v_offer.conversation_id, v_offer.id, v_msg.id,
    jsonb_build_object('status', v_offer.status, 'counter_price_paise', v_offer.counter_price_paise));

  PERFORM public.notify_users(ARRAY[v_offer.customer_id], 'offer_' || v_event,
    'Offer Update from John Rambo Support', v_summary, '/offers', jsonb_build_object('offerId', v_offer.id));

  RETURN v_offer;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_offer(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.offers;
BEGIN
  IF NOT public.is_customer() THEN
    RAISE EXCEPTION 'FORBIDDEN: Customer role required.';
  END IF;
  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer_id AND customer_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: Can only withdraw your own offer.';
  END IF;
  IF v_offer.status NOT IN ('pending', 'countered') THEN
    RAISE EXCEPTION 'INVALID_OFFER_STATE: Only pending or countered offers can be withdrawn.';
  END IF;

  UPDATE public.offers SET status = 'withdrawn', updated_at = now() WHERE id = p_offer_id RETURNING * INTO v_offer;
  INSERT INTO public.offer_events (offer_id, actor_id, event) VALUES (v_offer.id, auth.uid(), 'withdrawn');
  RETURN public.c_offer_json(v_offer);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_counter_offer(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.offers;
BEGIN
  IF NOT public.is_customer() THEN
    RAISE EXCEPTION 'FORBIDDEN: Customer role required.';
  END IF;
  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer_id AND customer_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: Can only accept counter on your own offer.';
  END IF;
  IF v_offer.status <> 'countered' OR v_offer.counter_price_paise IS NULL THEN
    RAISE EXCEPTION 'INVALID_OFFER_STATE: Offer does not have an active counter price.';
  END IF;

  UPDATE public.offers SET status = 'accepted', updated_at = now() WHERE id = p_offer_id RETURNING * INTO v_offer;
  INSERT INTO public.offer_events (offer_id, actor_id, event, meta)
  VALUES (v_offer.id, auth.uid(), 'accepted', jsonb_build_object('accepted_counter_paise', v_offer.counter_price_paise));

  PERFORM public.notify_users(public.active_staff_ids(), 'offer_counter_accepted',
    'Counter-offer accepted', format('%s accepted %s on %s.',
      (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
      public.format_usd(v_offer.counter_price_paise), v_offer.product_title),
    '/employee/offers', jsonb_build_object('offerId', v_offer.id));
  RETURN public.c_offer_json(v_offer);
END;
$$;

-- 4.5 Tickets ----------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_ticket(text, text, text, public.ticket_priority, uuid);
CREATE OR REPLACE FUNCTION public.create_ticket(
  p_subject text,
  p_description text,
  p_category text,
  p_priority public.ticket_priority,
  p_requested_employee_alias text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned uuid;
  v_status public.ticket_status := 'open';
  v_tkt public.tickets;
  v_boss uuid := public.boss_id();
  v_room_id uuid;
  v_name text;
  v_alias text;
  v_description text := public.require_text(p_description, 'Description', 4000);
BEGIN
  IF NOT public.is_customer() THEN
    RAISE EXCEPTION 'FORBIDDEN: Active customer required.';
  END IF;

  PERFORM public.assert_rate_limit(
    (SELECT count(*) FROM public.tickets
     WHERE customer_id = auth.uid() AND created_at > now() - interval '1 hour'),
    5, 'tickets');

  IF NULLIF(trim(COALESCE(p_requested_employee_alias, '')), '') IS NOT NULL THEN
    SELECT sp.user_id INTO v_assigned
    FROM public.staff_profiles sp
    JOIN public.profiles p ON p.id = sp.user_id
    WHERE sp.public_alias = trim(p_requested_employee_alias)
      AND p.role = 'employee' AND p.status = 'active' AND sp.accepts_tickets;
    IF v_assigned IS NULL THEN
      RAISE EXCEPTION 'INVALID_EMPLOYEE_SELECTION: Selected staff alias is not selectable.';
    END IF;
    v_status := 'assigned';
  END IF;

  INSERT INTO public.tickets (customer_id, subject, description, category, priority, status, assigned_employee_id, requested_employee_id)
  VALUES (auth.uid(), public.require_text(p_subject, 'Subject', 200), v_description,
    COALESCE(NULLIF(trim(p_category), ''), 'general'), p_priority, v_status, v_assigned, v_assigned)
  RETURNING * INTO v_tkt;

  INSERT INTO public.ticket_messages (ticket_id, sender_kind, customer_sender_id, body)
  VALUES (v_tkt.id, 'customer', auth.uid(), v_description);

  INSERT INTO public.ticket_events (ticket_id, actor_id, event, from_value, to_value)
  VALUES (v_tkt.id, auth.uid(), 'created', NULL, v_status::text);

  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();

  IF v_assigned IS NOT NULL THEN
    INSERT INTO public.ticket_events (ticket_id, actor_id, event, from_value, to_value)
    VALUES (v_tkt.id, auth.uid(), 'assigned', NULL, v_assigned::text);

    v_alias := public.staff_alias(v_assigned);
    IF v_boss IS NOT NULL THEN
      INSERT INTO public.complaint_chat_rooms (ticket_id, customer_id, employee_id, boss_id)
      VALUES (v_tkt.id, auth.uid(), v_assigned, v_boss)
      RETURNING id INTO v_room_id;

      INSERT INTO public.complaint_chat_messages (room_id, ticket_id, sender_id, body)
      VALUES (v_room_id, v_tkt.id, auth.uid(), v_description);

      PERFORM public.notify_users(ARRAY[v_boss], 'complaint_room_created',
        format('3-Member Complaint Chat Opened (TKT-%s)', v_tkt.ticket_no),
        format('%s raised a ticket involving %s.', v_name, v_alias),
        '/boss/tickets?ticketId=' || v_tkt.id, jsonb_build_object('ticketId', v_tkt.id, 'roomId', v_room_id));
      PERFORM public.notify_users(ARRAY[v_assigned], 'complaint_room_created',
        format('3-Member Complaint Chat Opened (TKT-%s)', v_tkt.ticket_no),
        format('You, Main Admin (Boss), and %s have been added to a private complaint chat room.', v_name),
        '/employee/tickets?ticketId=' || v_tkt.id, jsonb_build_object('ticketId', v_tkt.id, 'roomId', v_room_id));
    END IF;
  ELSE
    PERFORM public.notify_users(ARRAY[v_boss], 'ticket_created',
      format('New Ticket #%s', v_tkt.ticket_no), v_tkt.subject,
      '/boss/tickets?ticketId=' || v_tkt.id, jsonb_build_object('ticketId', v_tkt.id));
  END IF;

  INSERT INTO public.activity_events (actor_id, actor_role, event_type, customer_id, ticket_id, meta)
  VALUES (auth.uid(), 'customer', 'ticket_created', auth.uid(), v_tkt.id,
    jsonb_build_object('ticket_no', v_tkt.ticket_no, 'assigned_employee_id', v_assigned));

  RETURN public.c_ticket_json(v_tkt);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_ticket(p_ticket_id uuid, p_employee_id uuid)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tkt public.tickets;
  v_prev uuid;
  v_kind text;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'FORBIDDEN: Only the Boss can assign or reassign tickets.';
  END IF;

  SELECT * INTO v_tkt FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Ticket not found.';
  END IF;
  IF v_tkt.status = 'closed' THEN
    RAISE EXCEPTION 'INVALID_TICKET_TRANSITION: Cannot reassign a closed ticket.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_employee_id AND role = 'employee' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: Target active employee not found.';
  END IF;

  v_prev := v_tkt.assigned_employee_id;
  v_kind := CASE WHEN v_prev IS NOT NULL AND v_prev <> p_employee_id THEN 'reassigned' ELSE 'assigned' END;

  UPDATE public.tickets
  SET assigned_employee_id = p_employee_id,
      status = CASE WHEN status = 'open' THEN 'assigned'::public.ticket_status ELSE status END
  WHERE id = p_ticket_id
  RETURNING * INTO v_tkt;

  INSERT INTO public.ticket_events (ticket_id, actor_id, event, from_value, to_value)
  VALUES (p_ticket_id, auth.uid(), v_kind::public.ticket_event_type, v_prev::text, p_employee_id::text);

  INSERT INTO public.activity_events (actor_id, actor_role, event_type, customer_id, ticket_id, meta)
  VALUES (auth.uid(), 'boss', 'ticket_' || v_kind, v_tkt.customer_id, v_tkt.id,
    jsonb_build_object('from_employee_id', v_prev, 'to_employee_id', p_employee_id));

  PERFORM public.write_audit(auth.uid(), 'ticket_' || v_kind, 'tickets', p_ticket_id::text,
    jsonb_build_object('assignedEmployeeId', v_prev), jsonb_build_object('assignedEmployeeId', p_employee_id));

  PERFORM public.notify_users(ARRAY[p_employee_id], 'ticket_assigned',
    format('Ticket #%s Assigned to You', v_tkt.ticket_no), v_tkt.subject,
    '/employee/tickets', jsonb_build_object('ticketId', v_tkt.id));

  RETURN v_tkt;
END;
$$;

CREATE OR REPLACE FUNCTION public.reply_ticket(p_ticket_id uuid, p_body text)
RETURNS public.ticket_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tkt public.tickets;
  v_msg public.ticket_messages;
  v_role public.user_role;
  v_prev public.ticket_status;
  v_first boolean;
  v_first_sec numeric;
  v_body text := public.require_text(p_body, 'Reply', 4000);
BEGIN
  IF NOT public.is_active() THEN
    RAISE EXCEPTION 'FORBIDDEN_SUSPENDED: Account is not active.';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  SELECT * INTO v_tkt FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Ticket not found.';
  END IF;
  IF v_tkt.status = 'closed' THEN
    RAISE EXCEPTION 'INVALID_TICKET_TRANSITION: Cannot reply to a closed ticket.';
  END IF;
  v_prev := v_tkt.status;

  IF v_role = 'customer' THEN
    IF v_tkt.customer_id <> auth.uid() THEN
      RAISE EXCEPTION 'FORBIDDEN: Customers can only reply to their own tickets.';
    END IF;

    IF v_tkt.status IN ('waiting_for_customer', 'resolved') THEN
      UPDATE public.tickets SET
        status = 'in_progress',
        reopen_count = reopen_count + CASE WHEN v_prev = 'resolved' THEN 1 ELSE 0 END
      WHERE id = p_ticket_id
      RETURNING * INTO v_tkt;

      IF v_prev = 'resolved' THEN
        INSERT INTO public.ticket_events (ticket_id, actor_id, event, from_value, to_value)
        VALUES (p_ticket_id, auth.uid(), 'reopened', 'resolved', 'in_progress');
        INSERT INTO public.activity_events (actor_id, actor_role, event_type, customer_id, ticket_id, meta)
        VALUES (auth.uid(), 'customer', 'ticket_reopened', auth.uid(), p_ticket_id,
          jsonb_build_object('last_resolved_by', COALESCE(
            (SELECT actor_id FROM public.activity_events
             WHERE ticket_id = p_ticket_id AND event_type = 'ticket_resolved'
             ORDER BY occurred_at DESC LIMIT 1),
            v_tkt.assigned_employee_id)));
      END IF;
    END IF;

    INSERT INTO public.ticket_messages (ticket_id, sender_kind, customer_sender_id, body)
    VALUES (p_ticket_id, 'customer', auth.uid(), v_body)
    RETURNING * INTO v_msg;

    INSERT INTO public.ticket_events (ticket_id, actor_id, event, from_value, to_value)
    VALUES (p_ticket_id, auth.uid(), 'replied', v_prev::text, v_tkt.status::text);

    PERFORM public.notify_users(
      ARRAY[COALESCE(v_tkt.assigned_employee_id, public.boss_id())], 'ticket_customer_reply',
      format('Customer replied on Ticket #%s', v_tkt.ticket_no), v_body,
      CASE WHEN v_tkt.assigned_employee_id IS NULL THEN '/boss/tickets' ELSE '/employee/tickets' END,
      jsonb_build_object('ticketId', v_tkt.id));
    RETURN v_msg;
  END IF;

  -- Staff reply: only the assigned employee or the Boss
  IF v_role = 'employee' AND v_tkt.assigned_employee_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: Only the assigned employee or the Boss can reply to this ticket.';
  END IF;

  v_first := v_tkt.first_response_at IS NULL;
  IF v_first THEN
    v_first_sec := GREATEST(1, round(EXTRACT(EPOCH FROM (now() - v_tkt.created_at))));
  END IF;

  UPDATE public.tickets SET
    first_response_at = COALESCE(first_response_at, now()),
    status = CASE WHEN status IN ('assigned', 'open') THEN 'in_progress'::public.ticket_status ELSE status END,
    assigned_employee_id = CASE
      WHEN assigned_employee_id IS NULL AND v_role = 'employee' THEN auth.uid()
      ELSE assigned_employee_id END
  WHERE id = p_ticket_id
  RETURNING * INTO v_tkt;

  INSERT INTO public.ticket_messages (ticket_id, sender_kind, customer_sender_id, body)
  VALUES (p_ticket_id, 'staff', NULL, v_body)
  RETURNING * INTO v_msg;
  INSERT INTO public.ticket_message_attribution (ticket_message_id, staff_id) VALUES (v_msg.id, auth.uid());

  INSERT INTO public.ticket_events (ticket_id, actor_id, event, from_value, to_value)
  VALUES (p_ticket_id, auth.uid(), 'replied', v_prev::text, v_tkt.status::text);

  INSERT INTO public.activity_events (actor_id, actor_role, event_type, customer_id, ticket_id, message_id, meta)
  VALUES (auth.uid(), v_role, 'staff_ticket_reply', v_tkt.customer_id, v_tkt.id, v_msg.id,
    jsonb_strip_nulls(jsonb_build_object('is_first_response', v_first, 'first_response_seconds', v_first_sec)));

  PERFORM public.notify_users(ARRAY[v_tkt.customer_id], 'ticket_reply',
    format('Reply on Ticket #%s from John Rambo Support', v_tkt.ticket_no), v_body,
    '/tickets', jsonb_build_object('ticketId', v_tkt.id));

  RETURN v_msg;
END;
$$;

DROP FUNCTION IF EXISTS public.transition_ticket(uuid, public.ticket_status);
CREATE OR REPLACE FUNCTION public.transition_ticket(p_ticket_id uuid, p_to_status public.ticket_status)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tkt public.tickets;
  v_from public.ticket_status;
  v_role public.user_role;
  v_valid boolean := false;
  v_event public.ticket_event_type := 'status_changed';
  v_credited uuid;
BEGIN
  IF NOT public.is_active() THEN
    RAISE EXCEPTION 'FORBIDDEN_SUSPENDED: Account is not active.';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  SELECT * INTO v_tkt FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Ticket not found.';
  END IF;

  v_from := v_tkt.status;
  IF v_from = 'closed' THEN
    RAISE EXCEPTION 'INVALID_TICKET_TRANSITION: Closed is final.';
  END IF;

  IF v_role = 'customer' THEN
    IF v_tkt.customer_id <> auth.uid() THEN
      RAISE EXCEPTION 'FORBIDDEN: Not ticket owner.';
    END IF;
    v_valid := (v_from = 'waiting_for_customer' AND p_to_status = 'in_progress')
            OR (v_from = 'resolved' AND p_to_status IN ('closed', 'in_progress'));
  ELSIF v_role = 'employee' THEN
    IF v_tkt.assigned_employee_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'FORBIDDEN: Only the assigned employee or Boss can transition this ticket.';
    END IF;
    v_valid := (v_from = 'assigned' AND p_to_status = 'in_progress')
            OR (v_from = 'in_progress' AND p_to_status IN ('waiting_for_customer', 'resolved'))
            OR (v_from = 'waiting_for_customer' AND p_to_status IN ('in_progress', 'resolved'))
            OR (v_from = 'resolved' AND p_to_status = 'in_progress');
  ELSE
    v_valid := (v_from = 'open' AND p_to_status = 'assigned' AND v_tkt.assigned_employee_id IS NOT NULL)
            OR (v_from = 'assigned' AND p_to_status = 'in_progress')
            OR (v_from = 'in_progress' AND p_to_status IN ('waiting_for_customer', 'resolved'))
            OR (v_from = 'waiting_for_customer' AND p_to_status IN ('in_progress', 'resolved'))
            OR (v_from = 'resolved' AND p_to_status IN ('closed', 'in_progress'));
  END IF;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'INVALID_TICKET_TRANSITION: Transition % -> % is not permitted.', v_from, p_to_status;
  END IF;

  UPDATE public.tickets SET
    status = p_to_status,
    reopen_count = CASE WHEN v_from = 'resolved' AND p_to_status = 'in_progress' THEN reopen_count + 1 ELSE reopen_count END,
    resolved_at = CASE WHEN p_to_status = 'resolved' THEN now() ELSE resolved_at END,
    closed_at = CASE WHEN p_to_status = 'closed' THEN now() ELSE closed_at END
  WHERE id = p_ticket_id
  RETURNING * INTO v_tkt;

  IF v_from = 'resolved' AND p_to_status = 'in_progress' THEN
    v_event := 'reopened';
    INSERT INTO public.activity_events (actor_id, actor_role, event_type, customer_id, ticket_id, meta)
    VALUES (auth.uid(), v_role, 'ticket_reopened', v_tkt.customer_id, v_tkt.id,
      jsonb_build_object('last_resolved_by', COALESCE(
        (SELECT actor_id FROM public.activity_events
         WHERE ticket_id = p_ticket_id AND event_type = 'ticket_resolved'
         ORDER BY occurred_at DESC LIMIT 1),
        v_tkt.assigned_employee_id)));
  ELSIF p_to_status = 'resolved' THEN
    v_event := 'resolved';
    v_credited := COALESCE(v_tkt.assigned_employee_id, auth.uid());
    INSERT INTO public.activity_events (actor_id, actor_role, event_type, customer_id, ticket_id, meta)
    VALUES (v_credited, (SELECT role FROM public.profiles WHERE id = v_credited), 'ticket_resolved',
      v_tkt.customer_id, v_tkt.id,
      jsonb_build_object('credited_employee_id', v_credited,
        'resolution_seconds', GREATEST(1, round(EXTRACT(EPOCH FROM (now() - v_tkt.created_at))))));
  ELSIF p_to_status = 'closed' THEN
    v_event := 'closed';
  END IF;

  INSERT INTO public.ticket_events (ticket_id, actor_id, event, from_value, to_value)
  VALUES (p_ticket_id, auth.uid(), v_event, v_from::text, p_to_status::text);

  IF v_role = 'customer' THEN
    RETURN public.c_ticket_json(v_tkt);
  END IF;
  RETURN to_jsonb(v_tkt);
END;
$$;

CREATE OR REPLACE FUNCTION public.send_complaint_message(p_ticket_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.complaint_chat_rooms;
  v_msg public.complaint_chat_messages;
  v_tkt_no integer;
  v_body text := public.require_text(p_body, 'Message', 2000);
  v_member uuid;
BEGIN
  IF NOT public.is_active() THEN
    RAISE EXCEPTION 'FORBIDDEN_SUSPENDED: Account is not active.';
  END IF;
  SELECT * INTO v_room FROM public.complaint_chat_rooms WHERE ticket_id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Complaint chat room not found for this ticket.';
  END IF;
  IF auth.uid() NOT IN (v_room.boss_id, v_room.employee_id, v_room.customer_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Only the 3 complaint chat room members (Boss, reported Employee, and Customer) can post in this private room.';
  END IF;

  INSERT INTO public.complaint_chat_messages (room_id, ticket_id, sender_id, body)
  VALUES (v_room.id, v_room.ticket_id, auth.uid(), v_body)
  RETURNING * INTO v_msg;

  SELECT ticket_no INTO v_tkt_no FROM public.tickets WHERE id = p_ticket_id;
  FOREACH v_member IN ARRAY ARRAY[v_room.boss_id, v_room.employee_id, v_room.customer_id] LOOP
    IF v_member <> auth.uid() THEN
      PERFORM public.notify_users(ARRAY[v_member], 'complaint_chat_message',
        format('New message in Complaint Room (TKT-%s)', v_tkt_no), v_body,
        CASE
          WHEN v_member = v_room.boss_id THEN '/boss/tickets?ticketId=' || p_ticket_id
          WHEN v_member = v_room.employee_id THEN '/employee/tickets?ticketId=' || p_ticket_id
          ELSE '/tickets?ticketId=' || p_ticket_id END,
        jsonb_build_object('ticketId', p_ticket_id, 'roomId', v_room.id));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_msg.id,
    'roomId', v_msg.room_id,
    'ticketId', v_msg.ticket_id,
    'senderId', CASE
      WHEN public.is_customer() THEN v_msg.sender_id::text
      ELSE v_msg.sender_id::text END,
    'senderRole', (SELECT role FROM public.profiles WHERE id = auth.uid()),
    'senderDisplayName', public.complaint_display_name(auth.uid(), v_room),
    'body', v_msg.body,
    'createdAt', v_msg.created_at
  );
END;
$$;

-- 4.6 Staff threads & staff channel -------------------------------------------

CREATE OR REPLACE FUNCTION public.send_staff_thread_message(p_thread_id uuid, p_body text)
RETURNS public.staff_thread_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg public.staff_thread_messages;
  v_body text := public.require_text(p_body, 'Message', 2000);
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN: Staff authority required.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_threads WHERE id = p_thread_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: Staff thread not found.';
  END IF;

  -- JR Family: every active staff member can post in every staff thread (D-11)
  INSERT INTO public.staff_thread_messages (thread_id, sender_id, body)
  VALUES (p_thread_id, auth.uid(), v_body)
  RETURNING * INTO v_msg;

  UPDATE public.staff_threads
  SET last_message_at = now(), last_message_preview = left(v_body, 120)
  WHERE id = p_thread_id;
  RETURN v_msg;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_staff_announcement(
  p_title text, p_body text, p_priority public.announcement_priority
)
RETURNS public.staff_announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ann public.staff_announcements;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'FORBIDDEN: Boss authority required.';
  END IF;
  INSERT INTO public.staff_announcements (author_id, title, body, priority)
  VALUES (auth.uid(), public.require_text(p_title, 'Title', 200), public.require_text(p_body, 'Body', 4000), p_priority)
  RETURNING * INTO v_ann;

  PERFORM public.notify_users(
    ARRAY(SELECT id FROM public.profiles WHERE role = 'employee' AND status = 'active'),
    'staff_announcement', format('[%s] %s', upper(p_priority::text), v_ann.title), v_ann.body,
    '/employee/announcements', jsonb_build_object('announcementId', v_ann.id));
  RETURN v_ann;
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_staff_post(p_announcement_id uuid)
RETURNS public.staff_announcement_acks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ack public.staff_announcement_acks;
BEGIN
  IF NOT public.is_employee() THEN
    RAISE EXCEPTION 'FORBIDDEN: Only employees acknowledge staff channel posts.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_announcements WHERE id = p_announcement_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: Staff announcement not found.';
  END IF;

  INSERT INTO public.staff_announcement_acks (announcement_id, employee_id)
  VALUES (p_announcement_id, auth.uid())
  ON CONFLICT (announcement_id, employee_id) DO NOTHING;

  SELECT * INTO v_ack FROM public.staff_announcement_acks
  WHERE announcement_id = p_announcement_id AND employee_id = auth.uid();
  RETURN v_ack;
END;
$$;

-- 4.7 Customer announcements & stories -----------------------------------------

CREATE OR REPLACE FUNCTION public.create_customer_announcement(p_title text, p_body text, p_pinned boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ann public.customer_announcements;
BEGIN
  IF NOT public.has_staff_flag('can_post_customer_announcements') THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller lacks can_post_customer_announcements permission.';
  END IF;
  INSERT INTO public.customer_announcements (author_id, title, body, pinned)
  VALUES (auth.uid(), public.require_text(p_title, 'Title', 200), public.require_text(p_body, 'Body', 4000), COALESCE(p_pinned, false))
  RETURNING * INTO v_ann;
  RETURN jsonb_build_object('id', v_ann.id, 'authorId', v_ann.author_id, 'title', v_ann.title,
    'body', v_ann.body, 'pinned', v_ann.pinned, 'publishedAt', v_ann.published_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_story(
  p_kind public.story_kind, p_caption text, p_media_path text, p_bg_style text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_story public.stories;
BEGIN
  IF NOT public.has_staff_flag('can_publish_stories') THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller lacks can_publish_stories permission.';
  END IF;
  IF p_kind <> 'text' AND (p_media_path IS NULL OR trim(p_media_path) = '') THEN
    RAISE EXCEPTION 'INVALID_INPUT: Image and video stories need media.';
  END IF;
  INSERT INTO public.stories (author_id, kind, media_path, caption, bg_style)
  VALUES (auth.uid(), p_kind, NULLIF(trim(COALESCE(p_media_path, '')), ''),
    left(trim(COALESCE(p_caption, '')), 500),
    COALESCE(NULLIF(trim(COALESCE(p_bg_style, '')), ''), 'from-violet-900 via-indigo-950 to-slate-950'))
  RETURNING * INTO v_story;
  RETURN jsonb_build_object('id', v_story.id, 'authorId', v_story.author_id,
    'authorIsBoss', v_story.author_id = public.boss_id(), 'kind', v_story.kind,
    'mediaPath', v_story.media_path, 'caption', v_story.caption, 'bgStyle', v_story.bg_style,
    'createdAt', v_story.created_at, 'expiresAt', v_story.expires_at,
    'viewCount', 0, 'viewedByCaller', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_story_view(p_story_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_customer() THEN
    RAISE EXCEPTION 'FORBIDDEN: Customer role required.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stories WHERE id = p_story_id AND expires_at > now()) THEN
    RAISE EXCEPTION 'NOT_FOUND: Story is expired or unavailable.';
  END IF;
  INSERT INTO public.story_views (story_id, customer_id) VALUES (p_story_id, auth.uid())
  ON CONFLICT (story_id, customer_id) DO NOTHING;
END;
$$;

-- 4.8 Notifications & analytics audit -----------------------------------------

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_notification_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.notifications
  SET read_at = now()
  WHERE recipient_id = auth.uid()
    AND read_at IS NULL
    AND public.is_active()
    AND (p_notification_id IS NULL OR id = p_notification_id);
$$;

CREATE OR REPLACE FUNCTION public.log_performance_export(p_filter jsonb, p_row_count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'FORBIDDEN: Boss authority required.';
  END IF;
  PERFORM public.write_audit(auth.uid(), 'export_performance_csv', 'activity_events', 'performance_csv',
    NULL, jsonb_build_object('filter', COALESCE(p_filter, '{}'::jsonb), 'rowCount', p_row_count));
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. SERVER-ONLY FUNCTIONS (service role; actor id comes from a verified session)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.srv_provision_invite(
  p_actor uuid,
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text,
  p_role public.user_role,
  p_public_alias text,
  p_username text,
  p_has_password boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles;
  v_profile public.profiles;
  v_inv public.invitations;
  v_alias text;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = p_actor AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN_SUSPENDED: Account is not active.';
  END IF;
  IF v_actor.role = 'customer' THEN
    RAISE EXCEPTION 'FORBIDDEN: Customers cannot invite anyone.';
  END IF;
  IF p_role = 'boss' OR (v_actor.role = 'employee' AND p_role <> 'customer') THEN
    RAISE EXCEPTION 'FORBIDDEN: Employees can invite customers only (never employees or a boss).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'CONFLICT: A user with this email already exists.';
  END IF;
  IF NULLIF(trim(COALESCE(p_phone, '')), '') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles WHERE phone = trim(p_phone)) THEN
    RAISE EXCEPTION 'CONFLICT: Phone number is already in use.';
  END IF;
  IF p_role = 'employee' AND NOT p_has_password THEN
    RAISE EXCEPTION 'INVALID_INPUT: Employees need an initial password set by the Boss.';
  END IF;

  INSERT INTO public.profiles (id, role, status, username, full_name, email, phone, invited_by)
  VALUES (
    p_user_id, p_role,
    -- Customers without a password must first verify their email code and set one
    CASE WHEN p_has_password THEN 'pending_approval' ELSE 'invited' END::public.user_status,
    COALESCE(NULLIF(trim(p_username), ''), NULLIF(trim(p_public_alias), ''), split_part(lower(trim(p_email)), '@', 1)),
    public.require_text(p_full_name, 'Full name', 80),
    lower(trim(p_email)),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    p_actor
  )
  RETURNING * INTO v_profile;

  IF p_role = 'employee' THEN
    v_alias := COALESCE(NULLIF(trim(p_public_alias), ''),
      split_part(trim(p_full_name), ' ', 1) || '-' || (SELECT count(*) + 1 FROM public.staff_profiles));
    INSERT INTO public.staff_profiles (user_id, public_alias) VALUES (p_user_id, v_alias);
    INSERT INTO public.staff_threads (employee_id, title) VALUES (p_user_id, v_alias);
  ELSE
    INSERT INTO public.conversations (customer_id, last_message_at, last_message_preview)
    VALUES (p_user_id, now(), 'Account invited — ready for support chat.');
  END IF;

  INSERT INTO public.invitations (email, intended_role, full_name, phone, invited_by)
  VALUES (v_profile.email, p_role, v_profile.full_name, v_profile.phone, p_actor)
  RETURNING * INTO v_inv;

  PERFORM public.write_audit(p_actor, 'invite_user', 'invitations', v_inv.id::text, NULL,
    jsonb_build_object('email', v_profile.email, 'intendedRole', p_role, 'invitedBy', p_actor, 'profileId', p_user_id));

  INSERT INTO public.activity_events (actor_id, actor_role, event_type, customer_id, meta)
  VALUES (p_actor, v_actor.role, 'user_invited',
    CASE WHEN p_role = 'customer' THEN p_user_id END,
    jsonb_build_object('email', v_profile.email, 'intended_role', p_role));

  RETURN jsonb_build_object('profile', to_jsonb(v_profile), 'invitation', to_jsonb(v_inv),
    'invitedByName', v_actor.full_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.srv_set_username(p_actor uuid, p_target uuid, p_username text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.profiles;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND role = 'boss' AND status = 'active') THEN
    RAISE EXCEPTION 'FORBIDDEN: Boss authority required.';
  END IF;
  UPDATE public.profiles
  SET username = COALESCE(NULLIF(trim(COALESCE(p_username, '')), ''), username)
  WHERE id = p_target
  RETURNING * INTO v_target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Target user not found.';
  END IF;
  PERFORM public.write_audit(p_actor, 'admin_set_user_password', 'profiles', p_target::text, NULL,
    jsonb_build_object('targetRole', v_target.role, 'targetName', v_target.full_name,
      'username', v_target.username, 'passwordUpdatedByBoss', true));
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.srv_auto_close_resolved_tickets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
  v_boss uuid := public.boss_id();
  v_count integer;
BEGIN
  SELECT ticket_auto_close_days INTO v_days FROM public.app_settings WHERE id;

  WITH closed AS (
    UPDATE public.tickets
    SET status = 'closed', closed_at = now()
    WHERE status = 'resolved' AND resolved_at <= now() - make_interval(days => v_days)
    RETURNING id
  ), logged AS (
    INSERT INTO public.ticket_events (ticket_id, actor_id, event, from_value, to_value)
    SELECT id, v_boss, 'closed', 'resolved', 'closed' FROM closed
    WHERE v_boss IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM closed;
  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. EXECUTE PRIVILEGES
-- ----------------------------------------------------------------------------

-- Nothing in this schema is callable without a session
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- Internal helpers: used by other functions/policies, not meant as API calls
REVOKE EXECUTE ON FUNCTION public.notify_users(uuid[], text, text, text, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.write_audit(uuid, text, text, text, jsonb, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_email_from_auth() FROM authenticated;

-- Server-only functions
REVOKE EXECUTE ON FUNCTION public.srv_provision_invite(uuid, uuid, text, text, text, public.user_role, text, text, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.srv_set_username(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.srv_auto_close_resolved_tickets() FROM authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- ----------------------------------------------------------------------------
-- 7. REALTIME (RLS-filtered postgres_changes)
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['messages', 'ticket_messages', 'notifications', 'staff_thread_messages', 'conversations'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

-- >>> END MIGRATION: 00003_live_data_layer.sql <<<
