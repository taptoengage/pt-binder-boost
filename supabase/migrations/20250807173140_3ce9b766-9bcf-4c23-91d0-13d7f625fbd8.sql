CREATE POLICY "Trainers can view their clients' session packs"
ON public.session_packs
FOR SELECT
TO authenticated
USING (trainer_id = auth.uid());