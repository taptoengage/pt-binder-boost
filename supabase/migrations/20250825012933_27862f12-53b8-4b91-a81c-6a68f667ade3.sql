-- Critical RLS fix for clients: prevent NULL auth bypass and enforce authenticated access only

-- Drop existing policies to start clean
DROP POLICY IF EXISTS "Clients can select their own data" ON public.clients;
DROP POLICY IF EXISTS "Trainers can manage their own clients" ON public.clients;
DROP POLICY IF EXISTS "Prevent unauthorized client data access" ON public.clients;

-- Ensure RLS is enabled on the table (no-op if already enabled)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- 1) Authenticated clients can select their own data (null-safe)
CREATE POLICY "Authenticated clients can select their own data"
ON public.clients
FOR SELECT
TO public
USING (
  auth.uid() IS NOT NULL AND user_id = auth.uid()
);

-- 2) Authenticated trainers can manage their own clients (null-safe)
CREATE POLICY "Authenticated trainers can manage their own clients"
ON public.clients
FOR ALL
TO public
USING (
  auth.uid() IS NOT NULL AND trainer_id = auth.uid()
)
WITH CHECK (
  auth.uid() IS NOT NULL AND trainer_id = auth.uid()
);

-- 3) Block ALL access for unauthenticated users via restrictive policy
CREATE POLICY "Block unauthenticated access"
ON public.clients
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
