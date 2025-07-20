-- Allow clients to SELECT service types associated with their own sessions
CREATE POLICY "Clients can select their own service types via sessions" ON public.service_types
FOR SELECT USING (
    EXISTS (
        SELECT 1
        FROM public.sessions
        WHERE sessions.service_type_id = service_types.id
        AND sessions.client_id = (SELECT id FROM public.clients WHERE email = auth.email())
    )
);

-- Allow clients to SELECT service types associated with their own payments
CREATE POLICY "Clients can select their own service types via payments" ON public.service_types
FOR SELECT USING (
    EXISTS (
        SELECT 1
        FROM public.payments
        WHERE payments.service_type_id = service_types.id
        AND payments.client_id = (SELECT id FROM public.clients WHERE email = auth.email())
    )
);