-- Replace email-based RLS with user_id-based policy for service_types via payments
DROP POLICY IF EXISTS "Clients can select their own service types via payments" ON public.service_types;

CREATE POLICY "Clients can select their own service types via payments"
ON public.service_types
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.payments p
    JOIN public.clients c ON p.client_id = c.id
    WHERE p.service_type_id = service_types.id
      AND c.user_id = auth.uid()
  )
);