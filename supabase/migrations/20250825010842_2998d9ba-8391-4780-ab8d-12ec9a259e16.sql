-- Add restrictive policy to prevent unauthorized client data access on clients table

-- Create a RESTRICTIVE policy that applies to all commands, ensuring the row is only
-- accessible/modifiable by the owning trainer or the client themselves when user_id exists.
-- This does not broaden permissions; it further restricts existing permissive policies.
CREATE POLICY IF NOT EXISTS "Prevent unauthorized client data access"
ON public.clients
AS RESTRICTIVE
FOR ALL
TO public
USING (
  trainer_id = auth.uid()
  OR (user_id IS NOT NULL AND user_id = auth.uid())
)
WITH CHECK (
  trainer_id = auth.uid()
  OR (user_id IS NOT NULL AND user_id = auth.uid())
);
