-- Make journal-photos bucket public so getPublicUrl CDN links work in <img> tags
UPDATE storage.buckets SET public = true WHERE id = 'journal-photos';

-- Allow public read of journal photos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access for Journal Photos'
  ) THEN
    CREATE POLICY "Public Access for Journal Photos" ON storage.objects
      FOR SELECT USING (bucket_id = 'journal-photos');
  END IF;
END $$;
