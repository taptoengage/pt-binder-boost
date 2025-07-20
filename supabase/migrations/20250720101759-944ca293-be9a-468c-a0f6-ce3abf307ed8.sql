-- Create function to decrement session pack on completion
CREATE OR REPLACE FUNCTION public.decrement_session_pack_on_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if session status just changed to 'completed' and has a session_pack_id
  IF NEW.status = 'completed' 
     AND OLD.status IS DISTINCT FROM 'completed' 
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
$$ LANGUAGE plpgsql;

-- Create trigger to automatically decrement session pack on session completion
CREATE TRIGGER on_session_completed_decrement_pack
  AFTER UPDATE ON public.sessions
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.decrement_session_pack_on_complete();