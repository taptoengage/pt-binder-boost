-- Create atomic function for decrementing session pack sessions
CREATE OR REPLACE FUNCTION public.decrement_pack_sessions(
  pack_id uuid,
  trainer_id uuid,
  expected_remaining integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_remaining integer;
BEGIN
  -- Get current sessions_remaining with row lock
  SELECT sessions_remaining INTO current_remaining
  FROM public.session_packs
  WHERE id = pack_id AND trainer_id = trainer_id
  FOR UPDATE;
  
  -- Check if pack exists
  IF current_remaining IS NULL THEN
    RAISE EXCEPTION 'Session pack not found or access denied';
  END IF;
  
  -- Check for concurrent modification
  IF current_remaining != expected_remaining THEN
    RAISE EXCEPTION 'Session pack was modified by another booking (concurrent modification detected)';
  END IF;
  
  -- Check if there are sessions remaining
  IF current_remaining <= 0 THEN
    RAISE EXCEPTION 'No sessions remaining in pack';
  END IF;
  
  -- Atomically decrement sessions_remaining
  UPDATE public.session_packs
  SET 
    sessions_remaining = sessions_remaining - 1,
    updated_at = now()
  WHERE id = pack_id AND trainer_id = trainer_id;
  
  -- Check if update was successful
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update session pack';
  END IF;
  
  RETURN true;
END;
$$;