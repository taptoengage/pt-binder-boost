-- Create the session_packs table
CREATE TABLE public.session_packs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    service_type_id UUID NOT NULL REFERENCES public.service_types(id) ON DELETE CASCADE,
    total_sessions INTEGER NOT NULL,
    sessions_remaining INTEGER NOT NULL,
    amount_paid NUMERIC NOT NULL,
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    purchase_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expiry_date DATE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on session_packs
ALTER TABLE public.session_packs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for session_packs
CREATE POLICY "Trainers can manage their own session packs" ON public.session_packs
FOR ALL USING (auth.uid() = trainer_id);

CREATE POLICY "Clients can view their own session packs" ON public.session_packs
FOR SELECT USING (
    (SELECT id FROM public.clients WHERE email = auth.email()) = client_id
);

-- Add updated_at trigger to session_packs
CREATE TRIGGER update_session_packs_updated_at
    BEFORE UPDATE ON public.session_packs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add session_pack_id column to sessions table
ALTER TABLE public.sessions 
ADD COLUMN session_pack_id UUID REFERENCES public.session_packs(id) ON DELETE SET NULL;