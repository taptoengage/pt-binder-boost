-- Update the trigger function to handle scheduled sessions properly
CREATE OR REPLACE FUNCTION public.decrement_session_pack_on_complete()
RETURNS TRIGGER AS $$
DECLARE
  consumed_count INTEGER;
  scheduled_count INTEGER;
  total_sessions INTEGER;
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
      
      -- Get pack total sessions
      SELECT total_sessions INTO total_sessions
      FROM session_packs 
      WHERE id = NEW.session_pack_id;
      
      -- Count truly consumed sessions (completed, no-show, penalty cancelled)
      SELECT COUNT(*) INTO consumed_count
      FROM sessions s
      WHERE s.session_pack_id = NEW.session_pack_id
        AND (s.status = 'completed' OR s.status = 'no-show' OR 
             (s.status = 'cancelled' AND s.cancellation_reason = 'penalty'));
      
      -- Count scheduled sessions that could still be rebooked if cancelled without penalty
      SELECT COUNT(*) INTO scheduled_count
      FROM sessions s
      WHERE s.session_pack_id = NEW.session_pack_id
        AND s.status = 'scheduled';
      
      -- Only mark as completed if all sessions are truly consumed AND no scheduled sessions remain
      IF consumed_count >= total_sessions AND scheduled_count = 0 THEN
        UPDATE session_packs 
        SET status = 'completed',
            updated_at = now()
        WHERE id = NEW.session_pack_id;
        
        RAISE NOTICE 'Pack % marked as completed: consumed=%, scheduled=%, total=%', 
          NEW.session_pack_id, consumed_count, scheduled_count, total_sessions;
      ELSE
        RAISE NOTICE 'Pack % not marked complete: consumed=%, scheduled=%, total=%', 
          NEW.session_pack_id, consumed_count, scheduled_count, total_sessions;
      END IF;
        
      RAISE NOTICE 'Decremented pack % from % to %', 
        NEW.session_pack_id, current_remaining, current_remaining - 1;
    ELSE
      RAISE WARNING 'Attempted to decrement pack % but it has % sessions remaining', 
        NEW.session_pack_id, current_remaining;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';