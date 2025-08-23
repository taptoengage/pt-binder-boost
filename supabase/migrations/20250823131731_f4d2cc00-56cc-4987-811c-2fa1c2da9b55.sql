-- Replace email-based RLS with user_id-based policy for sessions
DROP POLICY IF EXISTS "Clients can view their own sessions" ON public.sessions;

CREATE POLICY "Clients can view their own sessions"
ON public.sessions
FOR SELECT
TO authenticated
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
);