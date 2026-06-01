-- ============================================================
-- TraceCode V2 Migration: Profiles Upgrades + Avatars Storage
-- ============================================================

-- 1. Add username, avatar_url, and bio columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;

-- 2. Register 'avatars' bucket in storage.buckets with 2MB limit and safe image MIME types
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 
  'avatars', 
  true, 
  2097152, -- 2MB in bytes
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE 
SET public = true, 
    file_size_limit = 2097152, 
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

-- 3. Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Public Read Access for Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own avatars" ON storage.objects;

-- 4. Enable RLS on storage.objects if it isn't already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 5. Create Storage Policies for 'avatars'
-- RLS Policy: Anyone can read avatar images
CREATE POLICY "Public Read Access for Avatars" ON storage.objects
  FOR SELECT 
  USING (bucket_id = 'avatars');

-- RLS Policy: Authenticated users can upload to their own folder: avatars/<auth.uid()>/...
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
  FOR INSERT 
  TO authenticated 
  WITH CHECK (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS Policy: Authenticated users can update their own avatar image
CREATE POLICY "Authenticated users can update own avatars" ON storage.objects
  FOR UPDATE 
  TO authenticated 
  USING (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS Policy: Authenticated users can delete their own avatar image
CREATE POLICY "Authenticated users can delete own avatars" ON storage.objects
  FOR DELETE 
  TO authenticated 
  USING (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
