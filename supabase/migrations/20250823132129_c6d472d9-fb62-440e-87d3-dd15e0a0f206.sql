-- Replace email-based INSERT RLS with user_id-based policy for sessions
DROP POLICY IF EXISTS "Clients can create their own sessions" ON public.sessions;

CREATE POLICY "Clients can create their own sessions"
ON public.sessions
FOR INSERT
TO authenticated
WITH CHECK (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
);