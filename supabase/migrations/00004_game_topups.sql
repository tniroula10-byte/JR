-- ============================================================================
-- JOHN RAMBO — GAME TOP-UPS
-- Migration: 00004_game_topups.sql
--
-- Customer flow: pick a game (max 11 active) -> enter amount + game username ->
-- pick one of the payment methods (max 3 active) showing a payment tag -> submit.
-- Staff receive an unread chat message + notification and mark the request
-- Loaded / Payment not received.
--
-- Payment tag assignment (boss setting `payment_tag_mode`):
--   rotate: every method shows one "current" tag; after N deposits on it
--           (`payment_tag_rotate_every`, default 5) the next active tag takes over.
--   sticky: each customer is given one tag per method and keeps it until staff change it.
-- Tags are resolved inside the database at submit time, never trusted from the client.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.payment_tag_mode AS ENUM ('rotate', 'sticky');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.topup_status AS ENUM ('waiting', 'loaded', 'not_received');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS payment_tag_mode public.payment_tag_mode NOT NULL DEFAULT 'rotate',
  ADD COLUMN IF NOT EXISTS payment_tag_rotate_every integer NOT NULL DEFAULT 5
    CHECK (payment_tag_rotate_every BETWEEN 1 AND 100);

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(trim(name)) BETWEEN 1 AND 60),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS games_created_by_idx ON public.games (created_by);
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(trim(name)) BETWEEN 1 AND 40),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  -- rotate mode state
  current_tag_id uuid,
  deposits_on_current integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.payment_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id uuid NOT NULL REFERENCES public.payment_methods(id) ON DELETE RESTRICT,
  tag text NOT NULL CHECK (char_length(trim(tag)) BETWEEN 1 AND 80),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  deposit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_tags_unique_per_method UNIQUE (method_id, tag)
);
CREATE INDEX IF NOT EXISTS payment_tags_method_idx ON public.payment_tags (method_id, sort_order);
ALTER TABLE public.payment_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_tags FORCE ROW LEVEL SECURITY;

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_current_tag_fk,
  ADD CONSTRAINT payment_methods_current_tag_fk
    FOREIGN KEY (current_tag_id) REFERENCES public.payment_tags(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS payment_methods_current_tag_idx ON public.payment_methods (current_tag_id);

-- sticky mode: one tag per (customer, method)
CREATE TABLE IF NOT EXISTS public.customer_payment_tags (
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  method_id uuid NOT NULL REFERENCES public.payment_methods(id) ON DELETE RESTRICT,
  tag_id uuid NOT NULL REFERENCES public.payment_tags(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, method_id)
);
CREATE INDEX IF NOT EXISTS customer_payment_tags_tag_idx ON public.customer_payment_tags (tag_id);
CREATE INDEX IF NOT EXISTS customer_payment_tags_method_idx ON public.customer_payment_tags (method_id);
CREATE INDEX IF NOT EXISTS customer_payment_tags_assigned_by_idx ON public.customer_payment_tags (assigned_by);
ALTER TABLE public.customer_payment_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payment_tags FORCE ROW LEVEL SECURITY;

-- remembered game usernames, so customers type them once
CREATE TABLE IF NOT EXISTS public.customer_game_accounts (
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE RESTRICT,
  username text NOT NULL CHECK (char_length(trim(username)) BETWEEN 1 AND 80),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, game_id)
);
CREATE INDEX IF NOT EXISTS customer_game_accounts_game_idx ON public.customer_game_accounts (game_id);
ALTER TABLE public.customer_game_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_game_accounts FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.topup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no serial UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE RESTRICT,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE RESTRICT,
  game_name text NOT NULL,
  game_username text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 100),
  method_id uuid NOT NULL REFERENCES public.payment_methods(id) ON DELETE RESTRICT,
  method_name text NOT NULL,
  tag_id uuid NOT NULL REFERENCES public.payment_tags(id) ON DELETE RESTRICT,
  tag_text text NOT NULL,
  status public.topup_status NOT NULL DEFAULT 'waiting',
  staff_note text,
  handled_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  message_id uuid REFERENCES public.messages(id) ON DELETE RESTRICT,
  client_request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT topup_requests_idempotency UNIQUE (customer_id, client_request_id)
);
CREATE INDEX IF NOT EXISTS topup_requests_status_idx ON public.topup_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS topup_requests_customer_idx ON public.topup_requests (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS topup_requests_conversation_idx ON public.topup_requests (conversation_id);
CREATE INDEX IF NOT EXISTS topup_requests_game_idx ON public.topup_requests (game_id);
CREATE INDEX IF NOT EXISTS topup_requests_method_idx ON public.topup_requests (method_id);
CREATE INDEX IF NOT EXISTS topup_requests_tag_idx ON public.topup_requests (tag_id);
CREATE INDEX IF NOT EXISTS topup_requests_handled_by_idx ON public.topup_requests (handled_by);
CREATE INDEX IF NOT EXISTS topup_requests_message_idx ON public.topup_requests (message_id);
ALTER TABLE public.topup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topup_requests FORCE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. RLS: staff read everything directly; customers only through c_* functions
-- ----------------------------------------------------------------------------

CREATE POLICY games_select_staff ON public.games FOR SELECT USING (public.is_staff());
CREATE POLICY payment_methods_select_staff ON public.payment_methods FOR SELECT USING (public.is_staff());
CREATE POLICY payment_tags_select_staff ON public.payment_tags FOR SELECT USING (public.is_staff());
CREATE POLICY customer_payment_tags_select_staff ON public.customer_payment_tags FOR SELECT USING (public.is_staff());
CREATE POLICY customer_game_accounts_select ON public.customer_game_accounts
FOR SELECT USING (public.is_staff() OR (public.is_customer() AND customer_id = auth.uid()));
CREATE POLICY topup_requests_select_staff ON public.topup_requests
FOR SELECT USING (public.is_staff() AND public.can_access_conversation(conversation_id));

-- ----------------------------------------------------------------------------
-- 3. SETTINGS (re-create to include the new fields)
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
    'paymentTagMode', s.payment_tag_mode,
    'paymentTagRotateEvery', s.payment_tag_rotate_every,
    'updatedBy', CASE WHEN public.is_staff() THEN s.updated_by END,
    'updatedAt', s.updated_at
  )
  FROM public.app_settings s
  WHERE s.id AND public.is_active();
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
    payment_tag_mode = COALESCE((p_patch->>'paymentTagMode')::public.payment_tag_mode, payment_tag_mode),
    payment_tag_rotate_every = COALESCE((p_patch->>'paymentTagRotateEvery')::integer, payment_tag_rotate_every),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id
  RETURNING * INTO v_after;

  PERFORM public.write_audit(auth.uid(), 'update_app_settings', 'app_settings', 'singleton',
    to_jsonb(v_before), to_jsonb(v_after));
  RETURN public.get_app_settings();
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. STAFF MANAGEMENT
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_game(p_id uuid, p_name text, p_active boolean, p_sort_order integer)
RETURNS public.games
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.games;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN: Staff authority required.';
  END IF;
  IF p_active AND (
    SELECT count(*) FROM public.games WHERE active AND id IS DISTINCT FROM p_id
  ) >= 11 THEN
    RAISE EXCEPTION 'LIMIT_REACHED: At most 11 games can be active. Turn one off first.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.games (name, active, sort_order, created_by)
    VALUES (public.require_text(p_name, 'Game name', 60), p_active, COALESCE(p_sort_order, 0), auth.uid())
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.games
    SET name = public.require_text(p_name, 'Game name', 60), active = p_active,
        sort_order = COALESCE(p_sort_order, sort_order), updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND: Game not found.';
    END IF;
  END IF;

  PERFORM public.write_audit(auth.uid(), 'upsert_game', 'games', v_row.id::text, NULL,
    jsonb_build_object('name', v_row.name, 'active', v_row.active));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_payment_method(p_id uuid, p_name text, p_active boolean, p_sort_order integer)
RETURNS public.payment_methods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payment_methods;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN: Staff authority required.';
  END IF;
  IF p_active AND (
    SELECT count(*) FROM public.payment_methods WHERE active AND id IS DISTINCT FROM p_id
  ) >= 3 THEN
    RAISE EXCEPTION 'LIMIT_REACHED: At most 3 payment methods can be active. Turn one off first.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.payment_methods (name, active, sort_order)
    VALUES (public.require_text(p_name, 'Payment method name', 40), p_active, COALESCE(p_sort_order, 0))
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.payment_methods
    SET name = public.require_text(p_name, 'Payment method name', 40), active = p_active,
        sort_order = COALESCE(p_sort_order, sort_order), updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND: Payment method not found.';
    END IF;
  END IF;

  PERFORM public.write_audit(auth.uid(), 'upsert_payment_method', 'payment_methods', v_row.id::text, NULL,
    jsonb_build_object('name', v_row.name, 'active', v_row.active));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_payment_tag(
  p_id uuid, p_method_id uuid, p_tag text, p_active boolean, p_sort_order integer
)
RETURNS public.payment_tags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payment_tags;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN: Staff authority required.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = p_method_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: Payment method not found.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.payment_tags (method_id, tag, active, sort_order)
    VALUES (p_method_id, public.require_text(p_tag, 'Payment tag', 80), p_active, COALESCE(p_sort_order, 0))
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.payment_tags
    SET tag = public.require_text(p_tag, 'Payment tag', 80), active = p_active,
        sort_order = COALESCE(p_sort_order, sort_order)
    WHERE id = p_id AND method_id = p_method_id
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND: Payment tag not found.';
    END IF;
  END IF;

  PERFORM public.write_audit(auth.uid(), 'upsert_payment_tag', 'payment_tags', v_row.id::text, NULL,
    jsonb_build_object('methodId', p_method_id, 'tag', v_row.tag, 'active', v_row.active));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_customer_payment_tag(p_customer_id uuid, p_method_id uuid, p_tag_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN: Staff authority required.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_customer_id AND role = 'customer') THEN
    RAISE EXCEPTION 'NOT_FOUND: Customer not found.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_tags WHERE id = p_tag_id AND method_id = p_method_id AND active) THEN
    RAISE EXCEPTION 'NOT_FOUND: Active payment tag not found for this method.';
  END IF;

  INSERT INTO public.customer_payment_tags (customer_id, method_id, tag_id, assigned_by)
  VALUES (p_customer_id, p_method_id, p_tag_id, auth.uid())
  ON CONFLICT (customer_id, method_id)
  DO UPDATE SET tag_id = EXCLUDED.tag_id, assigned_by = EXCLUDED.assigned_by, assigned_at = now();

  PERFORM public.write_audit(auth.uid(), 'set_customer_payment_tag', 'customer_payment_tags',
    p_customer_id::text, NULL, jsonb_build_object('methodId', p_method_id, 'tagId', p_tag_id));
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. TAG RESOLUTION (internal)
-- ----------------------------------------------------------------------------

-- Returns the tag a customer should pay to on a method. With p_consume (a real deposit),
-- rotate mode counts the deposit and moves to the next tag after N deposits.
CREATE OR REPLACE FUNCTION public.resolve_payment_tag(p_customer_id uuid, p_method_id uuid, p_consume boolean)
RETURNS public.payment_tags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.app_settings;
  v_method public.payment_methods;
  v_tag public.payment_tags;
  v_next public.payment_tags;
BEGIN
  SELECT * INTO v_settings FROM public.app_settings WHERE id;
  SELECT * INTO v_method FROM public.payment_methods WHERE id = p_method_id AND active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Payment method is not available.';
  END IF;

  IF v_settings.payment_tag_mode = 'sticky' THEN
    SELECT t.* INTO v_tag
    FROM public.customer_payment_tags c
    JOIN public.payment_tags t ON t.id = c.tag_id
    WHERE c.customer_id = p_customer_id AND c.method_id = p_method_id AND t.active;

    IF NOT FOUND THEN
      -- Spread new customers evenly: the active tag with the fewest customers
      SELECT t.* INTO v_tag
      FROM public.payment_tags t
      LEFT JOIN public.customer_payment_tags c ON c.tag_id = t.id
      WHERE t.method_id = p_method_id AND t.active
      GROUP BY t.id
      ORDER BY count(c.customer_id), t.sort_order, t.created_at
      LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: No active payment tag for this method.';
      END IF;
      INSERT INTO public.customer_payment_tags (customer_id, method_id, tag_id)
      VALUES (p_customer_id, p_method_id, v_tag.id)
      ON CONFLICT (customer_id, method_id) DO UPDATE SET tag_id = EXCLUDED.tag_id, assigned_at = now();
    END IF;
  ELSE
    SELECT * INTO v_tag FROM public.payment_tags
    WHERE id = v_method.current_tag_id AND active;
    IF NOT FOUND THEN
      SELECT * INTO v_tag FROM public.payment_tags
      WHERE method_id = p_method_id AND active
      ORDER BY sort_order, created_at LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: No active payment tag for this method.';
      END IF;
      UPDATE public.payment_methods SET current_tag_id = v_tag.id, deposits_on_current = 0
      WHERE id = p_method_id;
      v_method.deposits_on_current := 0;
    END IF;

    IF p_consume THEN
      IF v_method.deposits_on_current + 1 >= v_settings.payment_tag_rotate_every THEN
        -- Next active tag after the current one, wrapping around to the first
        SELECT * INTO v_next FROM public.payment_tags
        WHERE method_id = p_method_id AND active
          AND (sort_order, created_at) > (v_tag.sort_order, v_tag.created_at)
        ORDER BY sort_order, created_at LIMIT 1;
        IF NOT FOUND THEN
          SELECT * INTO v_next FROM public.payment_tags
          WHERE method_id = p_method_id AND active
          ORDER BY sort_order, created_at LIMIT 1;
        END IF;
        UPDATE public.payment_methods SET current_tag_id = v_next.id, deposits_on_current = 0
        WHERE id = p_method_id;
      ELSE
        UPDATE public.payment_methods SET deposits_on_current = deposits_on_current + 1
        WHERE id = p_method_id;
      END IF;
    END IF;
  END IF;

  IF p_consume THEN
    UPDATE public.payment_tags SET deposit_count = deposit_count + 1 WHERE id = v_tag.id;
  END IF;
  RETURN v_tag;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. CUSTOMER FUNCTIONS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_games()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'active', g.active, 'sortOrder', g.sort_order
  ) ORDER BY g.sort_order, g.name), '[]'::jsonb)
  FROM public.games g
  WHERE public.is_active() AND (g.active OR public.is_staff());
$$;

CREATE OR REPLACE FUNCTION public.c_get_payment_options()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_method public.payment_methods;
  v_tag public.payment_tags;
BEGIN
  IF NOT public.is_customer() THEN
    RAISE EXCEPTION 'FORBIDDEN: Customer role required.';
  END IF;
  FOR v_method IN
    SELECT * FROM public.payment_methods m
    WHERE m.active AND EXISTS (SELECT 1 FROM public.payment_tags t WHERE t.method_id = m.id AND t.active)
    ORDER BY m.sort_order, m.name
  LOOP
    v_tag := public.resolve_payment_tag(auth.uid(), v_method.id, false);
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'methodId', v_method.id, 'methodName', v_method.name, 'tag', v_tag.tag));
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.c_topup_json(r public.topup_requests)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'refNo', r.ref_no, 'customerId', r.customer_id, 'conversationId', r.conversation_id,
    'gameId', r.game_id, 'gameName', r.game_name, 'gameUsername', r.game_username,
    'amountCents', r.amount_cents, 'methodName', r.method_name, 'tag', r.tag_text,
    'status', r.status, 'staffNote', r.staff_note, 'handledBy', NULL, 'handledByName', NULL,
    'createdAt', r.created_at, 'updatedAt', r.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION public.c_list_topups()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(public.c_topup_json(r) ORDER BY r.created_at DESC), '[]'::jsonb)
  FROM public.topup_requests r
  WHERE r.customer_id = auth.uid() AND public.is_customer();
$$;

CREATE OR REPLACE FUNCTION public.submit_topup(
  p_game_id uuid,
  p_game_username text,
  p_amount_cents bigint,
  p_method_id uuid,
  p_client_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.topup_requests;
  v_game public.games;
  v_method public.payment_methods;
  v_conv public.conversations;
  v_tag public.payment_tags;
  v_req public.topup_requests;
  v_msg public.messages;
  v_username text := public.require_text(p_game_username, 'Game username', 80);
  v_max bigint;
  v_body text;
  v_name text;
BEGIN
  IF NOT public.is_customer() THEN
    RAISE EXCEPTION 'FORBIDDEN: Active customer required.';
  END IF;

  -- Idempotent retry (double tap / network retry)
  SELECT * INTO v_existing FROM public.topup_requests
  WHERE customer_id = auth.uid() AND client_request_id = p_client_request_id;
  IF FOUND THEN
    RETURN public.c_topup_json(v_existing);
  END IF;

  PERFORM public.assert_rate_limit(
    (SELECT count(*) FROM public.topup_requests
     WHERE customer_id = auth.uid() AND created_at > now() - interval '1 hour'),
    10, 'top-up requests');

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: This game is not available.';
  END IF;
  SELECT offer_sanity_max_paise INTO v_max FROM public.app_settings WHERE id;
  IF p_amount_cents IS NULL OR p_amount_cents < 100 OR p_amount_cents > v_max THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Amount must be between $1 and %.', public.format_usd(v_max);
  END IF;
  SELECT * INTO v_conv FROM public.conversations WHERE customer_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Customer conversation not found.';
  END IF;

  v_tag := public.resolve_payment_tag(auth.uid(), p_method_id, true);
  SELECT * INTO v_method FROM public.payment_methods WHERE id = p_method_id;

  INSERT INTO public.customer_game_accounts (customer_id, game_id, username)
  VALUES (auth.uid(), v_game.id, v_username)
  ON CONFLICT (customer_id, game_id) DO UPDATE SET username = EXCLUDED.username, updated_at = now();

  INSERT INTO public.topup_requests (
    customer_id, conversation_id, game_id, game_name, game_username, amount_cents,
    method_id, method_name, tag_id, tag_text, client_request_id
  ) VALUES (
    auth.uid(), v_conv.id, v_game.id, v_game.name, v_username, p_amount_cents,
    v_method.id, v_method.name, v_tag.id, v_tag.tag, p_client_request_id
  ) RETURNING * INTO v_req;

  v_body := format('Top-up request #%s: %s on %s (username: %s), paid via %s to %s.',
    v_req.ref_no, public.format_usd(p_amount_cents), v_game.name, v_username, v_method.name, v_tag.tag);

  -- Appears in the shared inbox as an unread customer message
  INSERT INTO public.messages (conversation_id, sender_kind, customer_sender_id, type, body, client_msg_id)
  VALUES (v_conv.id, 'customer', auth.uid(), 'text', v_body, 'topup-' || v_req.id)
  RETURNING * INTO v_msg;
  UPDATE public.topup_requests SET message_id = v_msg.id WHERE id = v_req.id;

  UPDATE public.conversations
  SET awaiting_staff = true, last_message_at = now(),
      last_message_preview = left(v_body, 120), staff_unread_count = staff_unread_count + 1
  WHERE id = v_conv.id;

  INSERT INTO public.activity_events (actor_id, actor_role, event_type, customer_id, conversation_id, message_id, meta)
  VALUES (auth.uid(), 'customer', 'topup_requested', auth.uid(), v_conv.id, v_msg.id,
    jsonb_build_object('topup_id', v_req.id, 'amount_cents', p_amount_cents, 'game', v_game.name));

  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();
  PERFORM public.notify_users(
    CASE WHEN v_conv.handled_by IS NOT NULL
      THEN ARRAY[v_conv.handled_by]
      ELSE ARRAY(SELECT id FROM public.profiles WHERE role = 'employee' AND status = 'active') END,
    'topup_requested', format('Top-up: %s on %s', public.format_usd(p_amount_cents), v_game.name),
    format('%s sent %s via %s. Load it to %s.', v_name, public.format_usd(p_amount_cents), v_method.name, v_username),
    '/employee/topups', jsonb_build_object('topupId', v_req.id));
  PERFORM public.notify_users(ARRAY[public.boss_id()],
    'topup_requested', format('Top-up: %s on %s', public.format_usd(p_amount_cents), v_game.name),
    format('%s sent %s via %s. Load it to %s.', v_name, public.format_usd(p_amount_cents), v_method.name, v_username),
    '/boss/topups', jsonb_build_object('topupId', v_req.id));

  SELECT * INTO v_req FROM public.topup_requests WHERE id = v_req.id;
  RETURN public.c_topup_json(v_req);
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. STAFF STATUS UPDATE
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_topup_status(p_topup_id uuid, p_status public.topup_status, p_note text DEFAULT NULL)
RETURNS public.topup_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.topup_requests;
  v_role public.user_role;
  v_msg public.messages;
  v_body text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN: Staff authority required.';
  END IF;
  IF p_status NOT IN ('loaded', 'not_received') THEN
    RAISE EXCEPTION 'INVALID_INPUT: Status must be loaded or not_received.';
  END IF;

  SELECT * INTO v_req FROM public.topup_requests WHERE id = p_topup_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Top-up request not found.';
  END IF;
  IF NOT public.can_access_conversation(v_req.conversation_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Top-up is outside staff member scope.';
  END IF;
  IF v_req.status <> 'waiting' THEN
    RAISE EXCEPTION 'INVALID_STATE: This top-up was already marked %.', v_req.status;
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  UPDATE public.topup_requests
  SET status = p_status, handled_by = auth.uid(), updated_at = now(),
      staff_note = NULLIF(left(trim(COALESCE(p_note, '')), 500), '')
  WHERE id = p_topup_id
  RETURNING * INTO v_req;

  v_body := CASE p_status
    WHEN 'loaded' THEN format('Your %s top-up on %s (#%s) has been loaded. Enjoy!',
      public.format_usd(v_req.amount_cents), v_req.game_name, v_req.ref_no)
    ELSE format('We could not find your %s payment for top-up #%s. Please check and message us.',
      public.format_usd(v_req.amount_cents), v_req.ref_no)
  END || COALESCE(' Note: ' || v_req.staff_note, '');

  INSERT INTO public.messages (conversation_id, sender_kind, customer_sender_id, type, body, client_msg_id)
  VALUES (v_req.conversation_id, 'staff', NULL, 'text', v_body, 'topup-status-' || v_req.id)
  RETURNING * INTO v_msg;
  INSERT INTO public.message_attribution (message_id, staff_id) VALUES (v_msg.id, auth.uid());

  UPDATE public.conversations
  SET awaiting_staff = false, last_message_at = now(),
      last_message_preview = left(v_body, 120), customer_unread_count = customer_unread_count + 1,
      handled_by = COALESCE(handled_by, CASE WHEN v_role = 'employee' THEN auth.uid() END)
  WHERE id = v_req.conversation_id;

  INSERT INTO public.activity_events (actor_id, actor_role, event_type, customer_id, conversation_id, message_id, meta)
  VALUES (auth.uid(), v_role, 'topup_' || p_status, v_req.customer_id, v_req.conversation_id, v_msg.id,
    jsonb_build_object('topup_id', v_req.id, 'amount_cents', v_req.amount_cents));

  PERFORM public.notify_users(ARRAY[v_req.customer_id], 'topup_' || p_status,
    CASE p_status WHEN 'loaded' THEN 'Top-up loaded' ELSE 'Payment not received' END,
    v_body, '/topups', jsonb_build_object('topupId', v_req.id));

  RETURN v_req;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. PRIVILEGES & REALTIME
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.upsert_game(uuid, text, boolean, integer),
  public.upsert_payment_method(uuid, text, boolean, integer),
  public.upsert_payment_tag(uuid, uuid, text, boolean, integer),
  public.set_customer_payment_tag(uuid, uuid, uuid),
  public.list_games(),
  public.c_get_payment_options(),
  public.c_list_topups(),
  public.submit_topup(uuid, text, bigint, uuid, text),
  public.update_topup_status(uuid, public.topup_status, text),
  public.get_app_settings(),
  public.update_app_settings(jsonb)
TO authenticated;
-- Internal: only callable from inside other SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.resolve_payment_tag(uuid, uuid, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.c_topup_json(public.topup_requests) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'topup_requests'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.topup_requests;
  END IF;
END $$;
