-- Drop any remaining foreign key constraints pointing to service_offerings
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_service_offering_id_fkey;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_core_service_type_fkey;
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_service_offering_id_fkey;
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_core_service_type_fkey;
ALTER TABLE public.session_packs DROP CONSTRAINT IF EXISTS session_packs_service_offering_id_fkey;
ALTER TABLE public.session_packs DROP CONSTRAINT IF EXISTS session_packs_core_service_type_fkey;

-- Drop the service_offerings table completely
DROP TABLE IF EXISTS public.service_offerings CASCADE;

-- Add correct foreign key constraints with original naming convention
ALTER TABLE public.payments ADD CONSTRAINT payments_service_type_id_fkey
FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE CASCADE;

ALTER TABLE public.sessions ADD CONSTRAINT sessions_service_type_id_fkey
FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE CASCADE;

ALTER TABLE public.session_packs ADD CONSTRAINT session_packs_service_type_id_fkey
FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE CASCADE;