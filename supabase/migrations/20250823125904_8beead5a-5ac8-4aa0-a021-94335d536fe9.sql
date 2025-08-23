-- Replace email-based RLS with user_id-based policy for client_subscriptions
DROP POLICY IF EXISTS "Clients can view their own subscriptions" ON public.client_subscriptions;

CREATE POLICY "Clients can view their own subscriptions"
ON public.client_subscriptions
FOR SELECT
TO public
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
);