-- Remove redundant columns from public.service_types
ALTER TABLE public.service_types DROP COLUMN IF EXISTS billing_model;
ALTER TABLE public.service_types DROP COLUMN IF EXISTS units_included;
ALTER TABLE public.service_types DROP COLUMN IF EXISTS default_price;

-- Add foreign key constraints to link back to core service_types
ALTER TABLE public.payments ADD CONSTRAINT payments_core_service_type_fkey
FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE CASCADE;

ALTER TABLE public.sessions ADD CONSTRAINT sessions_core_service_type_fkey
FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE CASCADE;

ALTER TABLE public.session_packs ADD CONSTRAINT session_packs_core_service_type_fkey
FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE CASCADE;