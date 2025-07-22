-- Drop incorrect foreign key constraints pointing to service_types
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_core_service_type_fkey;
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_core_service_type_fkey;
ALTER TABLE public.session_packs DROP CONSTRAINT IF EXISTS session_packs_core_service_type_fkey;