-- Add new foreign key constraints from payments, sessions, and session_packs to service_offerings
-- Note: Reusing service_type_id column names but now pointing to service_offerings

-- Add FK from payments to service_offerings
ALTER TABLE public.payments ADD CONSTRAINT payments_service_offering_id_fkey 
FOREIGN KEY (service_type_id) REFERENCES public.service_offerings(id) ON DELETE CASCADE;

-- Add FK from sessions to service_offerings  
ALTER TABLE public.sessions ADD CONSTRAINT sessions_service_offering_id_fkey 
FOREIGN KEY (service_type_id) REFERENCES public.service_offerings(id) ON DELETE CASCADE;

-- Add FK from session_packs to service_offerings
ALTER TABLE public.session_packs ADD CONSTRAINT session_packs_service_offering_id_fkey 
FOREIGN KEY (service_type_id) REFERENCES public.service_offerings(id) ON DELETE CASCADE;

-- Remove redundant columns from service_types (these are now in service_offerings)
ALTER TABLE public.service_types DROP COLUMN billing_model;
ALTER TABLE public.service_types DROP COLUMN units_included; 
ALTER TABLE public.service_types DROP COLUMN default_price;