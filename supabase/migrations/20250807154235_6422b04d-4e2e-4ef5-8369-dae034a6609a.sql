-- Drop existing policies to ensure clean slate
DROP POLICY IF EXISTS "Clients can select their own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Trainers can manage their own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Clients can view their own session packs" ON public.session_packs;
DROP POLICY IF EXISTS "Trainers can manage their own session packs" ON public.session_packs;

-- Sessions table policies
-- Allow authenticated users to insert a session for themselves
CREATE POLICY "Clients can create their own sessions"
ON public.sessions
FOR INSERT
TO authenticated
WITH CHECK (client_id = auth.uid());

-- Allow authenticated users to select their own sessions
CREATE POLICY "Clients can view their own sessions"
ON public.sessions
FOR SELECT
TO authenticated
USING (client_id = auth.uid());

-- Allow trainers to manage sessions for their clients
CREATE POLICY "Trainers can manage their clients' sessions"
ON public.sessions
FOR ALL
TO authenticated
USING (trainer_id = auth.uid())
WITH CHECK (trainer_id = auth.uid());

-- Session packs table policies
-- Allow authenticated users to read their own session packs
CREATE POLICY "Clients can view their own session packs"
ON public.session_packs
FOR SELECT
TO authenticated
USING (client_id = auth.uid());

-- Allow trainers to update their clients' session packs
CREATE POLICY "Trainers can update their clients' session packs"
ON public.session_packs
FOR UPDATE
TO authenticated
USING (trainer_id = auth.uid())
WITH CHECK (trainer_id = auth.uid());