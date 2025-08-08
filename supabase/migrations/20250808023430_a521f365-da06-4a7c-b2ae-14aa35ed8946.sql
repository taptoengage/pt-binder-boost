-- Drop the incorrect policy that uses auth.uid()
DROP POLICY IF EXISTS "Clients can view their own session packs" ON public.session_packs;

-- Create the correct policy using email-based lookup pattern
CREATE POLICY "Clients can view their own session packs"
ON public.session_packs
FOR SELECT
TO authenticated
USING (
  client_id = (SELECT clients.id FROM public.clients WHERE clients.email = auth.email())
);