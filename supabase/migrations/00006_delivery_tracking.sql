-- ============================================================================
-- JOHN RAMBO — DELIVERY TRACKING (email, web push, story media cleanup)
-- Migration: 00006_delivery_tracking.sql
-- ============================================================================

-- Approval / rejection emails: record whether the provider accepted them
ALTER TABLE public.outbound_emails
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'failed', 'not_configured')),
  ADD COLUMN IF NOT EXISTS delivery_error text;

-- Web Push: notifications are pushed once, after the request that created them
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS pushed_at timestamptz;
CREATE INDEX IF NOT EXISTS notifications_unpushed_idx
  ON public.notifications (created_at) WHERE pushed_at IS NULL;

-- Story media: files are removed from Storage after the story expires (rows are kept)
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS media_purged_at timestamptz;

-- The customer-facing story list must not offer purged media
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
    'mediaPath', CASE WHEN s.media_purged_at IS NULL THEN s.media_path END,
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

REVOKE EXECUTE ON FUNCTION public.list_stories(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_stories(boolean) TO authenticated;

-- Image/video stories must reference a file the author uploaded to story-media
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
  v_path text := NULLIF(trim(COALESCE(p_media_path, '')), '');
BEGIN
  IF NOT public.has_staff_flag('can_publish_stories') THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller lacks can_publish_stories permission.';
  END IF;
  IF p_kind <> 'text' THEN
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: Image and video stories need media.';
    END IF;
    IF split_part(v_path, '/', 1) <> auth.uid()::text OR NOT EXISTS (
      SELECT 1 FROM storage.objects WHERE bucket_id = 'story-media' AND name = v_path
    ) THEN
      RAISE EXCEPTION 'INVALID_INPUT: Upload the image or video first.';
    END IF;
  ELSE
    v_path := NULL;
  END IF;

  INSERT INTO public.stories (author_id, kind, media_path, caption, bg_style)
  VALUES (auth.uid(), p_kind, v_path,
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

REVOKE EXECUTE ON FUNCTION public.create_story(public.story_kind, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_story(public.story_kind, text, text, text) TO authenticated;
