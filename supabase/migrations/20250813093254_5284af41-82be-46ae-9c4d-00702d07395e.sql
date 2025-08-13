-- Add cancellation_reason column to sessions table
ALTER TABLE public.sessions
ADD COLUMN cancellation_reason TEXT;