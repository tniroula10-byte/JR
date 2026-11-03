-- ============================================================================
-- JOHN RAMBO — DURABLE LOGIN THROTTLING
-- Migration: 00005_login_throttle.sql
-- Serverless instances do not share memory, so failed sign-in / code attempts are
-- counted in Postgres. Keys are SHA-256 hashes (no raw emails or IPs stored).
-- Callable by the service role only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.auth_attempts (
  id bigserial PRIMARY KEY,
  key_hash text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_key_time_idx ON public.auth_attempts (key_hash, attempted_at DESC);
ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_attempts FORCE ROW LEVEL SECURITY;
-- Explicit deny-all: only SECURITY DEFINER functions (service role) touch this table.
CREATE POLICY auth_attempts_no_client_access ON public.auth_attempts
FOR ALL USING (false) WITH CHECK (false);

-- Records an attempt and returns whether it is allowed (false once p_max is reached in the window).
CREATE OR REPLACE FUNCTION public.srv_throttle_hit(p_key_hash text, p_window_seconds integer, p_max integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Serialise attempts on the same key so concurrent requests cannot both slip through
  PERFORM pg_advisory_xact_lock(hashtext(p_key_hash));

  DELETE FROM public.auth_attempts
  WHERE key_hash = p_key_hash AND attempted_at < now() - make_interval(secs => p_window_seconds);

  SELECT count(*) INTO v_count FROM public.auth_attempts WHERE key_hash = p_key_hash;
  IF v_count >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO public.auth_attempts (key_hash) VALUES (p_key_hash);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.srv_throttle_clear(p_key_hash text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_attempts WHERE key_hash = p_key_hash;
$$;

REVOKE EXECUTE ON FUNCTION public.srv_throttle_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.srv_throttle_clear(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.srv_throttle_hit(text, integer, integer), public.srv_throttle_clear(text) TO service_role;
