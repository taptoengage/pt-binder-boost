-- Fix the decrement_session_pack_on_complete trigger with proper search_path security
CREATE OR REPLACE FUNCTION public.decrement_session_pack_on_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if session status just changed to 'completed' OR 'no-show' and has a session_pack_id
  IF (NEW.status = 'completed' OR NEW.status = 'no-show')
     AND OLD.status IS DISTINCT FROM NEW.status 
     AND NEW.session_pack_id IS NOT NULL THEN
    
    -- Decrement sessions_remaining for the linked session pack
    UPDATE public.session_packs 
    SET sessions_remaining = sessions_remaining - 1,
        updated_at = now()
    WHERE id = NEW.session_pack_id;
    
    -- Check if the pack is now fully consumed and mark it as completed
    UPDATE public.session_packs 
    SET status = 'completed',
        updated_at = now()
    WHERE id = NEW.session_pack_id 
      AND sessions_remaining = 0;
      
  END IF;
  
  RETURN NEW;
END;
$function$