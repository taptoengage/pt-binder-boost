-- Add billing model and pricing columns to service_types table
ALTER TABLE public.service_types 
ADD COLUMN billing_model TEXT NOT NULL DEFAULT 'per_unit' 
CHECK (billing_model IN ('per_unit', 'pack', 'subscription'));

ALTER TABLE public.service_types 
ADD COLUMN units_included INTEGER;

ALTER TABLE public.service_types 
ADD COLUMN default_price NUMERIC NOT NULL DEFAULT 0.00;