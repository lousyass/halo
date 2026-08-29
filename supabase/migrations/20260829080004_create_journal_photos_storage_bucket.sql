-- Create journal-photos storage bucket (private — served via signed URLs or anon policy below)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'journal-photos',
  'journal-photos',
  false,
  10485760,  -- 10 MB max per file
  ARRAY['image/jpeg','image/png','image/gif','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for storage.objects in journal-photos bucket
-- Users can upload their own files
CREATE POLICY "journal photos insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'journal-photos'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

-- Users can view their own files
CREATE POLICY "journal photos select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'journal-photos'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

-- Users can delete their own files
CREATE POLICY "journal photos delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'journal-photos'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );
