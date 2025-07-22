-- Drop foreign key constraints from tables that reference service_types
-- This prepares them to reference service_offerings instead

-- Drop FK from sessions to service_types
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_service_type_id_fkey;

-- Drop FK from payments to service_types  
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_service_type_id_fkey;

-- Drop FK from session_packs to service_types
ALTER TABLE public.session_packs DROP CONSTRAINT IF EXISTS session_packs_service_type_id_fkey;

-- Clear all data from affected tables to prepare for new schema
DELETE FROM public.payments;
DELETE FROM public.sessions; 
DELETE FROM public.session_packs;