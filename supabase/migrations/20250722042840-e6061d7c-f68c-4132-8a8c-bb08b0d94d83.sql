-- Create the service_offerings table
CREATE TABLE IF NOT EXISTS public.service_offerings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
    service_type_id UUID NOT NULL REFERENCES public.service_types(id) ON DELETE CASCADE,
    billing_model TEXT NOT NULL CHECK (billing_model IN ('per_unit', 'pack', 'subscription')),
    price NUMERIC NOT NULL DEFAULT 0.00,
    units_included INTEGER,
    name_suffix TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint to prevent duplicate offerings for same service type and billing model
ALTER TABLE public.service_offerings 
ADD CONSTRAINT IF NOT EXISTS unique_trainer_service_billing 
UNIQUE (trainer_id, service_type_id, billing_model);

-- Enable Row Level Security
ALTER TABLE public.service_offerings ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for trainers to manage their own offerings
DROP POLICY IF EXISTS "Trainers can manage their own service offerings" ON public.service_offerings;
CREATE POLICY "Trainers can manage their own service offerings" 
ON public.service_offerings 
FOR ALL 
USING (auth.uid() = trainer_id);

-- Create RLS policy for clients to view offerings from their trainer
DROP POLICY IF EXISTS "Clients can view their own service offerings" ON public.service_offerings;
CREATE POLICY "Clients can view their own service offerings" 
ON public.service_offerings 
FOR SELECT 
USING (EXISTS (
    SELECT 1 
    FROM public.clients 
    WHERE email = auth.email() 
    AND clients.trainer_id = service_offerings.trainer_id
));

-- Create trigger for automatic updated_at timestamp updates
DROP TRIGGER IF EXISTS update_service_offerings_updated_at ON public.service_offerings;
CREATE TRIGGER update_service_offerings_updated_at
    BEFORE UPDATE ON public.service_offerings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();