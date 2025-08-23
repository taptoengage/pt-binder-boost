-- Replace email-based client SELECT policy on session_packs with user_id-based authentication

-- Drop the existing email-based policy if present
DROP POLICY IF EXISTS "Clients can view their own session packs" ON public.session_packs;

-- Recreate secure client SELECT policy using user_id chain
CREATE POLICY "Clients can view their own session packs"
ON public.session_packs
FOR SELECT
TO public
USING (
  client_id IN (
    SELECT c.id
    FROM public.clients c
    WHERE c.user_id = auth.uid()
  )
);
