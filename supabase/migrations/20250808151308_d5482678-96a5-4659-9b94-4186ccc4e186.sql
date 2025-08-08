-- Create atomic increment function for session_packs.sessions_remaining
CREATE OR REPLACE FUNCTION public.increment_pack_sessions(
  pack_id uuid,
  trainer_id uuid,
  inc integer DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Atomically increment sessions_remaining and update timestamp
  UPDATE public.session_packs sp
  SET sessions_remaining = sp.sessions_remaining + inc,
      updated_at = now()
  WHERE sp.id = pack_id
    AND sp.trainer_id = increment_pack_sessions.trainer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session pack not found or access denied for pack_id=% trainer_id=%', pack_id, trainer_id;
  END IF;

  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Database error in increment_pack_sessions: %', SQLERRM;
END;
$$;