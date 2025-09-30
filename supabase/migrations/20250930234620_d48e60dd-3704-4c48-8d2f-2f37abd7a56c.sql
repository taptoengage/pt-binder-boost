-- Backfill user_roles for existing clients
-- Insert 'client' role for all clients that have a user_id but no user_roles record
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT c.user_id, 'client'::app_role
FROM public.clients c
WHERE c.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = c.user_id
  );