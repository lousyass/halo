-- Create french-audio storage bucket for pre-generated native audio clips
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'french-audio',
  'french-audio',
  true,
  5242880,  -- 5 MB max per audio clip
  ARRAY['audio/ogg', 'audio/opus', 'audio/webm', 'audio/mpeg', 'audio/wav', 'audio/x-wav']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public read access to french-audio
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access for French Audio'
  ) THEN
    CREATE POLICY "Public Access for French Audio" ON storage.objects
      FOR SELECT USING (bucket_id = 'french-audio');
  END IF;
END $$;

-- Allow insert/update for service_role and authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public/Auth Insert for French Audio'
  ) THEN
    CREATE POLICY "Public/Auth Insert for French Audio" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'french-audio');
  END IF;
END $$;
