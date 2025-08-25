
-- Grant 'admin' app role to the specified user (idempotent)
INSERT INTO public.user_roles (user_id, role)
SELECT 'c6d300b4-ea4a-4696-8e37-381c1cd545c7'::uuid, 'admin'::public.app_role
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_roles
  WHERE user_id = 'c6d300b4-ea4a-4696-8e37-381c1cd545c7'::uuid
    AND role = 'admin'::public.app_role
);
