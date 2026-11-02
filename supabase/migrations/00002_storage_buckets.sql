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
