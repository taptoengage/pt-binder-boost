-- Clear existing data that has incorrect foreign key references
DELETE FROM public.payments;
DELETE FROM public.sessions;
DELETE FROM public.session_packs;

-- Drop existing incorrect FKs pointing to service_offerings
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_service_offering_id_fkey;
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_service_offering_id_fkey;
ALTER TABLE public.session_packs DROP CONSTRAINT IF EXISTS session_packs_service_offering_id_fkey;

-- Add correct FKs pointing to public.service_types (core services)
ALTER TABLE public.payments ADD CONSTRAINT payments_core_service_type_fkey
FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE CASCADE;

ALTER TABLE public.sessions ADD CONSTRAINT sessions_core_service_type_fkey
FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE CASCADE;

ALTER TABLE public.session_packs ADD CONSTRAINT session_packs_core_service_type_fkey
FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE CASCADE;