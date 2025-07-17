-- Create clients table
CREATE TABLE public.clients (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    email TEXT NOT NULL,
    training_age INTEGER,
    rough_goals TEXT,
    physical_activity_readiness TEXT,
    initial_session_count INTEGER,
    current_session_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on clients table
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for clients
CREATE POLICY "Trainers can manage their own clients" 
ON public.clients 
FOR ALL 
USING (auth.uid() = trainer_id);

-- Create trigger for clients updated_at
CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create sessions table
CREATE TABLE public.sessions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    session_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled_late', 'cancelled_early')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on sessions table
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for sessions
CREATE POLICY "Trainers can manage their own sessions" 
ON public.sessions 
FOR ALL 
USING (auth.uid() = trainer_id);

-- Create trigger for sessions updated_at
CREATE TRIGGER update_sessions_updated_at
BEFORE UPDATE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create payments table
CREATE TABLE public.payments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    date_paid DATE,
    due_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('paid', 'overdue', 'due')),
    service_period TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on payments table
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for payments
CREATE POLICY "Trainers can manage their own payments" 
ON public.payments 
FOR ALL 
USING (auth.uid() = trainer_id);

-- Create trigger for payments updated_at
CREATE TRIGGER update_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();