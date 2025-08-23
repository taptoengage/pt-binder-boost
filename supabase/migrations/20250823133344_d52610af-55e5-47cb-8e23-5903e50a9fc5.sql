-- Replace email-based RLS with user_id-based policy for service_types via sessions
DROP POLICY IF EXISTS "Clients can select their own service types via sessions" ON public.service_types;

CREATE POLICY "Clients can select their own service types via sessions"
ON public.service_types
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.sessions s
    JOIN public.clients c ON s.client_id = c.id
    WHERE s.service_type_id = service_types.id
      AND c.user_id = auth.uid()
  )
);