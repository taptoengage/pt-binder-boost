-- PHASE 1.2 — RLS policies (idempotent)

-- Trainers: view own profile
DROP POLICY IF EXISTS "Trainers can view their own profile" ON public.trainers;
CREATE POLICY "Trainers can view their own profile"
ON public.trainers
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Clients: view own profile
DROP POLICY IF EXISTS "Clients can view their own profile" ON public.clients;
CREATE POLICY "Clients can view their own profile"
ON public.clients
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
