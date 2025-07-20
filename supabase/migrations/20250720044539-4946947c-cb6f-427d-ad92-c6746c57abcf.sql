-- Add RLS policies for client data access

-- Allow clients to SELECT their own record based on their email matching the client's email
CREATE POLICY "Clients can select their own data" ON public.clients
FOR SELECT USING (auth.email() = email);

-- For sessions: Allow clients to select their own sessions
CREATE POLICY "Clients can select their own sessions" ON public.sessions
FOR SELECT USING (
    (SELECT id FROM public.clients WHERE email = auth.email()) = client_id
);

-- For payments: Allow clients to select their own payments  
CREATE POLICY "Clients can select their own payments" ON public.payments
FOR SELECT USING (
    (SELECT id FROM public.clients WHERE email = auth.email()) = client_id
);