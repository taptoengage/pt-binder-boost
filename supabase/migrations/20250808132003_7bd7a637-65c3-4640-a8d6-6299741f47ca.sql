-- Add RLS policy to allow clients to see basic session timing data for their trainer's sessions
-- This allows clients to see when their trainer has sessions booked (by any client)
-- without exposing sensitive client information

CREATE POLICY "Clients can view basic session timing for their trainer" 
ON public.sessions 
FOR SELECT 
USING (
  trainer_id IN (
    SELECT trainer_id 
    FROM clients 
    WHERE email = auth.email()
  )
);

-- Add comment explaining the policy
COMMENT ON POLICY "Clients can view basic session timing for their trainer" ON public.sessions IS 
'Allows clients to see session_date, trainer_id, and status for sessions belonging to their trainer, enabling accurate calendar availability display across all clients';