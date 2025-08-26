-- Milestone 1: Backend Foundation - Add pack cancellation fields
-- Notes: The session_packs.status column is currently TEXT (not an enum), so no enum changes are needed.
-- We will add the new columns and a safety CHECK constraint to prevent negative values.

-- 1) Add new columns if they don't already exist
ALTER TABLE public.session_packs
  ADD COLUMN IF NOT EXISTS forfeited_sessions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_sessions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_notes TEXT;

-- 2) Add a non-negative constraint for the new counters (idempotent: only add if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'session_packs_nonnegative_forfeit_refund'
  ) THEN
    ALTER TABLE public.session_packs
      ADD CONSTRAINT session_packs_nonnegative_forfeit_refund
      CHECK (forfeited_sessions >= 0 AND refunded_sessions >= 0);
  END IF;
END $$;

-- No changes to RLS needed; existing policies already restrict updates to trainer-owned rows.
