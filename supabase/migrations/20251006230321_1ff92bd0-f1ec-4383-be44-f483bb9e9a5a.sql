-- Grant execute permissions to ensure PostgREST can expose the RPC
GRANT EXECUTE ON FUNCTION public.get_trainer_busy_slots(uuid, timestamptz, timestamptz)
TO anon, authenticated;

-- Add comment to force PostgREST schema cache reload
COMMENT ON FUNCTION public.get_trainer_busy_slots(uuid, timestamptz, timestamptz)
IS 'Returns non-cancelled sessions for the trainer within the date range (trainer/client guarded).';