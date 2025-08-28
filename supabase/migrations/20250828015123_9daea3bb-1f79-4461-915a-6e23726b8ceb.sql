-- PHASE 1.3 — Role RPC (apply + perms)

CREATE OR REPLACE FUNCTION public.has_role(role_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = role_name::app_role
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_role(text) TO authenticated;