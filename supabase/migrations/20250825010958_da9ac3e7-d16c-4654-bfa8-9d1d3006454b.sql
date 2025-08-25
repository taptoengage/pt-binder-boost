-- Fix clients table critical RLS: add restrictive policy without broadening permissions

-- Drop existing policy if it exists to avoid name conflicts
DROP POLICY IF EXISTS "Prevent unauthorized client data access" ON public.clients;

-- Create restrictive policy that applies to all commands
CREATE POLICY "Prevent unauthorized client data access"
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
