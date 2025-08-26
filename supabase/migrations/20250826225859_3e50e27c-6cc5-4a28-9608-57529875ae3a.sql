-- Phase 1: Least-privilege admin metrics RPC
-- Creates a SECURITY DEFINER function that only returns global aggregates
-- and enforces admin access using has_role(auth.uid(),'admin').

-- Revoke default execute permissions and grant only to 'authenticated'
DO $$
BEGIN
  -- Safe revoke (ignore errors if function doesn't exist yet)
  BEGIN
    REVOKE ALL ON FUNCTION public.get_admin_metrics() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.get_admin_metrics() FROM authenticated;
  EXCEPTION WHEN undefined_function THEN
    -- function didn't exist yet
    NULL;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.get_admin_metrics()
RETURNS TABLE (
  total_trainers bigint,
  total_clients bigint,
  active_session_packs bigint,
  total_revenue numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Require an authenticated user with admin role
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.trainers) AS total_trainers,
    (SELECT COUNT(*) FROM public.clients) AS total_clients,
    (SELECT COUNT(*) FROM public.session_packs sp WHERE sp.status = 'active') AS active_session_packs,
    COALESCE((SELECT SUM(p.amount) FROM public.payments p WHERE p.status = 'paid'), 0)::numeric AS total_revenue;
END;
$$;

-- Restrict execute to authenticated users only (function itself enforces admin check)
GRANT EXECUTE ON FUNCTION public.get_admin_metrics() TO authenticated;
REVOKE ALL ON FUNCTION public.get_admin_metrics() FROM PUBLIC;