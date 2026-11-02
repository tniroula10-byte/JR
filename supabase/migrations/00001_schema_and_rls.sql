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

-- 2.24 spin_bonuses (12:00 AM California time daily spin bonus)
CREATE TABLE IF NOT EXISTS public.spin_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  date_key_california text NOT NULL,
  reward_points integer NOT NULL CHECK (reward_points > 0),
  reward_label text NOT NULL,
  spun_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spin_bonuses_unique_daily UNIQUE (customer_id, date_key_california)
);
CREATE INDEX IF NOT EXISTS spin_bonuses_customer_date_idx ON public.spin_bonuses (customer_id, spun_at DESC);
ALTER TABLE public.spin_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spin_bonuses FORCE ROW LEVEL SECURITY;

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

-- 5.23 spin_bonuses (Customer reads & inserts own daily spin; staff can read all)
CREATE POLICY spin_bonuses_select_policy ON public.spin_bonuses
FOR SELECT USING (
  public.is_active() AND (public.is_staff() OR customer_id = auth.uid())
);

CREATE POLICY spin_bonuses_insert_own_policy ON public.spin_bonuses
FOR INSERT WITH CHECK (
  public.is_customer() AND customer_id = auth.uid()
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

-- ----------------------------------------------------------------------------
-- 8. PRIVATE STORAGE BUCKETS & STORAGE RLS POLICIES
-- ----------------------------------------------------------------------------

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
