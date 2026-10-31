-- =====================================================================
-- Migration: 20261031150000_create_custom_themes_and_storage.sql
-- Description: Custom themes schema, constraints, triggers, and theme-images bucket
-- =====================================================================

-- 1. custom_themes table
CREATE TABLE IF NOT EXISTS public.custom_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('light', 'dark')),
  primary_color TEXT NOT NULL CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  background_color TEXT NOT NULL CHECK (background_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive unique name per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_themes_user_lower_name
  ON public.custom_themes (user_id, lower(name));

-- 2. custom_theme_images table
CREATE TABLE IF NOT EXISTS public.custom_theme_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_id UUID NOT NULL REFERENCES public.custom_themes(id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK (slot IN ('background', 'dashboard', 'routine', 'calendar', 'diary')),
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_theme_images_theme_slot
  ON public.custom_theme_images (theme_id, slot);

CREATE INDEX IF NOT EXISTS idx_custom_theme_images_user
  ON public.custom_theme_images (user_id);

-- 3. Row Level Security
ALTER TABLE public.custom_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_theme_images ENABLE ROW LEVEL SECURITY;

-- Policies for custom_themes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'custom_themes' AND policyname = 'custom_themes_select_policy'
  ) THEN
    CREATE POLICY "custom_themes_select_policy" ON public.custom_themes
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'custom_themes' AND policyname = 'custom_themes_insert_policy'
  ) THEN
    CREATE POLICY "custom_themes_insert_policy" ON public.custom_themes
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'custom_themes' AND policyname = 'custom_themes_update_policy'
  ) THEN
    CREATE POLICY "custom_themes_update_policy" ON public.custom_themes
      FOR UPDATE USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'custom_themes' AND policyname = 'custom_themes_delete_policy'
  ) THEN
    CREATE POLICY "custom_themes_delete_policy" ON public.custom_themes
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Policies for custom_theme_images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'custom_theme_images' AND policyname = 'custom_theme_images_select_policy'
  ) THEN
    CREATE POLICY "custom_theme_images_select_policy" ON public.custom_theme_images
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'custom_theme_images' AND policyname = 'custom_theme_images_insert_policy'
  ) THEN
    CREATE POLICY "custom_theme_images_insert_policy" ON public.custom_theme_images
      FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM public.custom_themes
          WHERE id = theme_id AND user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'custom_theme_images' AND policyname = 'custom_theme_images_update_policy'
  ) THEN
    CREATE POLICY "custom_theme_images_update_policy" ON public.custom_theme_images
      FOR UPDATE USING (auth.uid() = user_id)
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM public.custom_themes
          WHERE id = theme_id AND user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'custom_theme_images' AND policyname = 'custom_theme_images_delete_policy'
  ) THEN
    CREATE POLICY "custom_theme_images_delete_policy" ON public.custom_theme_images
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 4. Limit triggers: max 5 themes per user, max 4 images per (theme, slot)
CREATE OR REPLACE FUNCTION public.check_max_custom_themes()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM public.custom_themes WHERE user_id = NEW.user_id) >= 5 THEN
    RAISE EXCEPTION 'Maximum limit of 5 custom themes per user reached';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_max_custom_themes ON public.custom_themes;
CREATE TRIGGER trg_check_max_custom_themes
  BEFORE INSERT ON public.custom_themes
  FOR EACH ROW EXECUTE FUNCTION public.check_max_custom_themes();

CREATE OR REPLACE FUNCTION public.check_max_custom_theme_images()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM public.custom_theme_images WHERE theme_id = NEW.theme_id AND slot = NEW.slot) >= 4 THEN
    RAISE EXCEPTION 'Maximum limit of 4 images per slot reached';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_max_custom_theme_images ON public.custom_theme_images;
CREATE TRIGGER trg_check_max_custom_theme_images
  BEFORE INSERT ON public.custom_theme_images
  FOR EACH ROW EXECUTE FUNCTION public.check_max_custom_theme_images();

-- 5. Keep updated_at current
CREATE OR REPLACE FUNCTION public.set_updated_at_custom_themes()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_custom_themes ON public.custom_themes;
CREATE TRIGGER trg_set_updated_at_custom_themes
  BEFORE UPDATE ON public.custom_themes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_custom_themes();

-- 6. Storage bucket theme-images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'theme-images',
  'theme-images',
  true,
  1048576, -- 1 MB max per file
  ARRAY['image/webp','image/jpeg','image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/webp','image/jpeg','image/png'];

-- Storage RLS policies (INSERT, UPDATE, DELETE only where (storage.foldername(name))[1] = auth.uid()::text)
-- Notice: DO NOT add a select/list policy (as instructed in spec)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'theme_images_insert'
  ) THEN
    CREATE POLICY "theme_images_insert" ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'theme-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'theme_images_update'
  ) THEN
    CREATE POLICY "theme_images_update" ON storage.objects
      FOR UPDATE USING (
        bucket_id = 'theme-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      ) WITH CHECK (
        bucket_id = 'theme-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'theme_images_delete'
  ) THEN
    CREATE POLICY "theme_images_delete" ON storage.objects
      FOR DELETE USING (
        bucket_id = 'theme-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
