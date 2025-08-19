
-- 1) Add avatar URL columns for clients and trainers
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS profile_photo_url text;

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS profile_photo_url text;

-- 2) Create an enum for photo visibility (shared with client vs private to trainer)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'client_photo_visibility_enum') THEN
    CREATE TYPE public.client_photo_visibility_enum AS ENUM ('private', 'shared');
  END IF;
END
$$;

-- 3) Create table to store progress photo metadata
CREATE TABLE IF NOT EXISTS public.client_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL, -- auth.uid() of uploader (trainer or client). No FK to auth.users by design.
  file_path text NOT NULL,   -- storage path: e.g. progress-photos/{trainer_id}/{client_id}/{uuid}.jpg
  content_type text,
  file_size_bytes integer,
  captured_at timestamp with time zone,
  visibility public.client_photo_visibility_enum NOT NULL DEFAULT 'shared',
  notes text,
  measurements jsonb,        -- flexible per-photo measurements (weight, BF%, etc.)
  pose text,                 -- e.g., 'front', 'side', 'back'
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 4) RLS: enable and add policies
ALTER TABLE public.client_photos ENABLE ROW LEVEL SECURITY;

-- Trainers: can manage photos of their own clients (insert/update/delete/select)
-- Ensures trainer_id matches auth.uid() and the client actually belongs to this trainer
CREATE POLICY "Trainers can manage their clients' photos"
  ON public.client_photos
  FOR ALL
  USING (
    trainer_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_photos.client_id
        AND c.trainer_id = auth.uid()
    )
  )
  WITH CHECK (
    trainer_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_photos.client_id
        AND c.trainer_id = auth.uid()
    )
  );

-- Clients: can view their own photos when shared OR any photos they personally uploaded
CREATE POLICY "Clients can view their own photos"
  ON public.client_photos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_photos.client_id
        AND c.user_id = auth.uid()
    )
    AND (client_photos.visibility = 'shared' OR client_photos.uploaded_by = auth.uid())
  );

-- Clients: can insert photos for themselves (e.g., self-uploaded progress shots)
-- Enforce uploaded_by is the client and trainer_id matches the client's trainer
CREATE POLICY "Clients can insert their own photos"
  ON public.client_photos
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_photos.client_id
        AND c.user_id = auth.uid()
        AND client_photos.trainer_id = c.trainer_id
    )
    AND client_photos.uploaded_by = auth.uid()
  );

-- Clients: can update/delete only photos they uploaded themselves
CREATE POLICY "Clients can update their own uploaded photos"
  ON public.client_photos
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_photos.client_id
        AND c.user_id = auth.uid()
        AND client_photos.uploaded_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_photos.client_id
        AND c.user_id = auth.uid()
        AND client_photos.uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Clients can delete their own uploaded photos"
  ON public.client_photos
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_photos.client_id
        AND c.user_id = auth.uid()
        AND client_photos.uploaded_by = auth.uid()
    )
  );

-- 5) Keep updated_at fresh
DROP TRIGGER IF EXISTS update_client_photos_updated_at ON public.client_photos;
CREATE TRIGGER update_client_photos_updated_at
  BEFORE UPDATE ON public.client_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Indexes for common queries
CREATE INDEX IF NOT EXISTS client_photos_client_id_idx ON public.client_photos (client_id);
CREATE INDEX IF NOT EXISTS client_photos_trainer_id_idx ON public.client_photos (trainer_id);
CREATE INDEX IF NOT EXISTS client_photos_created_at_idx ON public.client_photos (created_at);
CREATE INDEX IF NOT EXISTS client_photos_visibility_idx ON public.client_photos (visibility);
