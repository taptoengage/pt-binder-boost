-- Fix security warnings by setting search_path for all functions

-- Fix increment_pack_sessions function
CREATE OR REPLACE FUNCTION public.increment_pack_sessions(pack_id uuid, trainer_id uuid, inc integer DEFAULT 1)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Atomically increment sessions_remaining and update timestamp
  UPDATE session_packs sp
  SET sessions_remaining = sp.sessions_remaining + inc,
      updated_at = now()
  WHERE sp.id = increment_pack_sessions.pack_id
    AND sp.trainer_id = increment_pack_sessions.trainer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session pack not found or access denied for pack_id=% trainer_id=%', pack_id, trainer_id;
  END IF;

  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Database error in increment_pack_sessions: %', SQLERRM;
END;
$function$;

-- Fix decrement_pack_sessions function  
CREATE OR REPLACE FUNCTION public.decrement_pack_sessions(pack_id uuid, trainer_id uuid, expected_remaining integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_remaining integer;
BEGIN
  -- Add comprehensive logging
  RAISE NOTICE 'DEBUG: Attempting to decrement pack_id=%, trainer_id=%, expected_remaining=%', pack_id, trainer_id, expected_remaining;
  
  -- Get current sessions_remaining with row lock
  SELECT sessions_remaining INTO current_remaining
  FROM session_packs sp
  WHERE sp.id = decrement_pack_sessions.pack_id AND sp.trainer_id = decrement_pack_sessions.trainer_id
  FOR UPDATE;
  
  RAISE NOTICE 'DEBUG: Found current_remaining=% for pack_id=%', current_remaining, pack_id;
  
  -- Check if pack exists
  IF current_remaining IS NULL THEN
    RAISE EXCEPTION 'Session pack not found or access denied for pack_id=% trainer_id=%', pack_id, trainer_id;
  END IF;
  
  -- Check for concurrent modification
  IF current_remaining != expected_remaining THEN
    RAISE EXCEPTION 'Session pack was modified by another booking (concurrent modification detected). Expected: %, Found: %', expected_remaining, current_remaining;
  END IF;
  
  -- Check if there are sessions remaining
  IF current_remaining <= 0 THEN
    RAISE EXCEPTION 'No sessions remaining in pack (current_remaining=%)', current_remaining;
  END IF;
  
  -- Atomically decrement sessions_remaining
  UPDATE session_packs sp
  SET 
    sessions_remaining = sessions_remaining - 1,
    updated_at = now()
  WHERE sp.id = decrement_pack_sessions.pack_id AND sp.trainer_id = decrement_pack_sessions.trainer_id;
  
  -- Check if update was successful
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update session pack - no rows affected for pack_id=% trainer_id=%', pack_id, trainer_id;
  END IF;
  
  RAISE NOTICE 'DEBUG: Successfully decremented pack_id=% from % to %', pack_id, current_remaining, current_remaining - 1;
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Database error in decrement_pack_sessions: %', SQLERRM;
END;
$function$;