-- Create a function to get trainer busy slots (bypasses RLS)
-- This allows clients to see when their trainer is busy without exposing other clients' private data
CREATE OR REPLACE FUNCTION get_trainer_busy_slots(p_trainer_id UUID, p_start_date TIMESTAMPTZ, p_end_date TIMESTAMPTZ)
RETURNS TABLE (
  session_date TIMESTAMPTZ,
  status TEXT
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT s.session_date, s.status
  FROM sessions s
  WHERE s.trainer_id = p_trainer_id
    AND s.status NOT IN ('cancelled', 'no-show')
    AND s.session_date >= p_start_date
    AND s.session_date <= p_end_date
  ORDER BY s.session_date;
END;
$$;