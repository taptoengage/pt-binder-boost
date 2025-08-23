-- Add client SELECT policy for subscription_billing_periods using user_id chain
CREATE POLICY "Clients can view their own billing periods"
ON public.subscription_billing_periods
FOR SELECT
TO public
USING (
  client_subscription_id IN (
    SELECT cs.id
    FROM public.client_subscriptions cs
    JOIN public.clients c ON cs.client_id = c.id
    WHERE c.user_id = auth.uid()
  )
);