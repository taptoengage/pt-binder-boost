-- Step 1: Data Correction - Fix existing negative session pack values
-- Calculate correct sessions_remaining based on actual session usage

-- First, let's create a temporary function to recalculate pack values
CREATE OR REPLACE FUNCTION public.recalculate_pack_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pack_record RECORD;
  used_sessions_count INTEGER;
  correct_remaining INTEGER;
BEGIN
  -- Loop through all session packs with negative sessions_remaining
  FOR pack_record IN 
    SELECT id, total_sessions, sessions_remaining 
    FROM session_packs 
    WHERE sessions_remaining < 0
  LOOP
    -- Count actual used sessions (completed + no-show)
    SELECT COUNT(*) INTO used_sessions_count
    FROM sessions 
    WHERE session_pack_id = pack_record.id 
    AND status IN ('completed', 'no-show');
    
    -- Calculate correct remaining sessions
    correct_remaining := GREATEST(0, pack_record.total_sessions - used_sessions_count);
    
    -- Update the pack with correct values
    UPDATE session_packs 
    SET sessions_remaining = correct_remaining,
        status = CASE 
          WHEN correct_remaining = 0 THEN 'completed'
          ELSE status 
        END,
        updated_at = now()
    WHERE id = pack_record.id;
    
    RAISE NOTICE 'Fixed pack %: was %, now % remaining (used: %)', 
      pack_record.id, pack_record.sessions_remaining, correct_remaining, used_sessions_count;
  END LOOP;
END;
$$;

-- Execute the correction
SELECT public.recalculate_pack_sessions();

-- Step 2: Add Database Constraints to prevent future negative values
ALTER TABLE session_packs 
ADD CONSTRAINT sessions_remaining_non_negative 
CHECK (sessions_remaining >= 0);

ALTER TABLE session_packs 
ADD CONSTRAINT sessions_remaining_not_exceed_total 
CHECK (sessions_remaining <= total_sessions);

-- Step 3: Improve Trigger Logic - Add safeguards against double decrements
CREATE OR REPLACE FUNCTION public.decrement_session_pack_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_remaining INTEGER;
BEGIN
  -- Only proceed if session status changed to 'completed' OR 'no-show' 
  -- and has a session_pack_id and the OLD status was different
  IF (NEW.status = 'completed' OR NEW.status = 'no-show')
     AND (OLD.status IS NULL OR OLD.status NOT IN ('completed', 'no-show'))
     AND NEW.session_pack_id IS NOT NULL THEN
    
    -- Get current sessions_remaining with row lock to prevent race conditions
    SELECT sessions_remaining INTO current_remaining
    FROM session_packs 
    WHERE id = NEW.session_pack_id
    FOR UPDATE;
    
    -- Only decrement if we have sessions remaining
    IF current_remaining > 0 THEN
      -- Decrement sessions_remaining for the linked session pack
      UPDATE session_packs 
      SET sessions_remaining = sessions_remaining - 1,
          updated_at = now()
      WHERE id = NEW.session_pack_id;
      
      -- Check if the pack is now fully consumed and mark it as completed
      UPDATE session_packs 
      SET status = 'completed',
          updated_at = now()
      WHERE id = NEW.session_pack_id 
        AND sessions_remaining = 0;
        
      RAISE NOTICE 'Decremented pack % from % to %', 
        NEW.session_pack_id, current_remaining, current_remaining - 1;
    ELSE
      RAISE WARNING 'Attempted to decrement pack % but it has % sessions remaining', 
        NEW.session_pack_id, current_remaining;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS decrement_session_pack_on_complete ON sessions;
CREATE TRIGGER decrement_session_pack_on_complete
  AFTER UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION decrement_session_pack_on_complete();

-- Step 4: Add monitoring function for pack integrity
CREATE OR REPLACE FUNCTION public.validate_pack_integrity()
RETURNS TABLE (
  pack_id UUID,
  total_sessions INTEGER,
  sessions_remaining INTEGER,
  actual_used_sessions BIGINT,
  calculated_remaining INTEGER,
  has_integrity_issue BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sp.id as pack_id,
    sp.total_sessions,
    sp.sessions_remaining,
    COALESCE(s.used_count, 0) as actual_used_sessions,
    GREATEST(0, sp.total_sessions - COALESCE(s.used_count, 0)) as calculated_remaining,
    (sp.sessions_remaining != GREATEST(0, sp.total_sessions - COALESCE(s.used_count, 0))) as has_integrity_issue
  FROM session_packs sp
  LEFT JOIN (
    SELECT 
      session_pack_id,
      COUNT(*) as used_count
    FROM sessions 
    WHERE status IN ('completed', 'no-show')
    GROUP BY session_pack_id
  ) s ON sp.id = s.session_pack_id;
END;
$$;

-- Clean up the temporary function
DROP FUNCTION public.recalculate_pack_sessions();