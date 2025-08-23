-- Replace email-based RLS with user_id-based policy for payments
DROP POLICY IF EXISTS "Clients can select their own payments" ON public.payments;

CREATE POLICY "Clients can select their own payments"
ON public.payments
FOR SELECT
TO public
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
);
