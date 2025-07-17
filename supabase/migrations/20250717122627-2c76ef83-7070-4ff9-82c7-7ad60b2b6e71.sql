-- Create service_types table first (since other tables will reference it)
CREATE TABLE public.service_types (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(trainer_id, name)
);

-- Enable RLS on service_types
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for service_types
CREATE POLICY "Trainers can manage their own service types" 
ON public.service_types 
FOR ALL 
USING (auth.uid() = trainer_id);

-- Add updated_at trigger to service_types
CREATE TRIGGER update_service_types_updated_at
    BEFORE UPDATE ON public.service_types
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create client_service_rates table
CREATE TABLE public.client_service_rates (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    service_type_id UUID NOT NULL REFERENCES public.service_types(id) ON DELETE CASCADE,
    rate NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(client_id, service_type_id)
);

-- Enable RLS on client_service_rates
ALTER TABLE public.client_service_rates ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for client_service_rates
CREATE POLICY "Trainers can manage client service rates" 
ON public.client_service_rates 
FOR ALL 
USING (auth.uid() = trainer_id);

-- Add updated_at trigger to client_service_rates
CREATE TRIGGER update_client_service_rates_updated_at
    BEFORE UPDATE ON public.client_service_rates
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Modify clients table - remove session count columns and add default_session_rate
ALTER TABLE public.clients 
DROP COLUMN initial_session_count,
DROP COLUMN current_session_count,
ADD COLUMN default_session_rate NUMERIC NOT NULL DEFAULT 0.00;

-- Modify payments table - remove service_period and add service_type_id
ALTER TABLE public.payments 
DROP COLUMN service_period,
ADD COLUMN service_type_id UUID NOT NULL REFERENCES public.service_types(id);