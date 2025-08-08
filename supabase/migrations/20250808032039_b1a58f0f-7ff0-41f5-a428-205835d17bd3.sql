-- Update sessions table RLS policies to use email-based authentication

-- Drop the incorrect policy that uses auth.uid() for client inserts
DROP POLICY IF EXISTS "Clients can create their own sessions" ON public.sessions;

-- Drop the incorrect policy that uses auth.uid() for client selects  
DROP POLICY IF EXISTS "Clients can view their own sessions" ON public.sessions;

-- Create correct policies using email-based lookup pattern
CREATE POLICY "Clients can create their own sessions"
ON public.sessions
FOR INSERT
TO authenticated
WITH CHECK (
  client_id = (SELECT clients.id FROM public.clients WHERE clients.email = auth.email())
);

CREATE POLICY "Clients can view their own sessions"
ON public.sessions
FOR SELECT
TO authenticated
USING (
  client_id = (SELECT clients.id FROM public.clients WHERE clients.email = auth.email())
);