-- Add missing foreign key constraint for service_type_id
ALTER TABLE public.subscription_service_allocations 
ADD CONSTRAINT fk_subscription_service_allocations_service_type
FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE CASCADE;