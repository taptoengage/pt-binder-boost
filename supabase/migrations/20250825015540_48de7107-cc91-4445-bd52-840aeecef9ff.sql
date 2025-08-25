
-- Phase 1: SQL hardening for sessions and subscription tables, plus secure RPC.
-- Safe to run multiple times (drops are IF EXISTS).

-- 1) Remove cross-client exposure on sessions
DROP POLICY IF EXISTS "Clients can view basic session timing for their trainer" ON public.sessions;

-- 2) Strengthen session INSERTs to bind to the client's trainer
DROP POLICY IF EXISTS "Clients can create their own sessions" ON public.sessions;

CREATE POLICY "Clients can create their own sessions (trainer-bound)"
ON public.sessions
FOR INSERT
TO public
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = sessions.client_id
      AND c.user_id = auth.uid()
      AND sessions.trainer_id = c.trainer_id
  )
);

-- 3) Block unauthenticated access on sessions (defense-in-depth)
DROP POLICY IF EXISTS "Block unauthenticated access (sessions)" ON public.sessions;

CREATE POLICY "Block unauthenticated access (sessions)"
ON public.sessions
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 4) Secure RPC for trainer busy slots (replaces permissive sessions policy)
CREATE OR REPLACE FUNCTION public.get_trainer_busy_slots()
RETURNS TABLE(trainer_id uuid, session_date timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT s.trainer_id, s.session_date
  FROM public.sessions s
  WHERE s.status IN ('scheduled','completed')
    AND (
      -- Clients can see their trainer's busy slots
      s.trainer_id IN (
        SELECT c.trainer_id
        FROM public.clients c
        WHERE c.user_id = auth.uid()
      )
      OR
      -- Trainers can see their own busy slots
      s.trainer_id = auth.uid()
    );
END;
$function$;

-- Lock down RPC execution to authenticated only
REVOKE ALL ON FUNCTION public.get_trainer_busy_slots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trainer_busy_slots() TO authenticated;

-- 5) Fix email-based RLS on subscription_service_allocations
DROP POLICY IF EXISTS "Clients can view their own subscription allocations" ON public.subscription_service_allocations;

CREATE POLICY "Clients can view their own subscription allocations (uid)"
ON public.subscription_service_allocations
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.client_subscriptions cs
    JOIN public.clients c ON cs.client_id = c.id
    WHERE cs.id = subscription_service_allocations.subscription_id
      AND c.user_id = auth.uid()
  )
);

-- Block unauthenticated (restrictive) for subscription_service_allocations
DROP POLICY IF EXISTS "Block unauthenticated access (subscription_service_allocations)" ON public.subscription_service_allocations;

CREATE POLICY "Block unauthenticated access (subscription_service_allocations)"
ON public.subscription_service_allocations
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 6) Fix email-based RLS on subscription_session_credits
DROP POLICY IF EXISTS "Clients can view their subscription session credits" ON public.subscription_session_credits;

CREATE POLICY "Clients can view their subscription session credits (uid)"
ON public.subscription_session_credits
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.client_subscriptions cs
    JOIN public.clients c ON cs.client_id = c.id
    WHERE cs.id = subscription_session_credits.subscription_id
      AND c.user_id = auth.uid()
  )
);

-- Block unauthenticated (restrictive) for subscription_session_credits
DROP POLICY IF EXISTS "Block unauthenticated access (subscription_session_credits)" ON public.subscription_session_credits;

CREATE POLICY "Block unauthenticated access (subscription_session_credits)"
ON public.subscription_session_credits
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
