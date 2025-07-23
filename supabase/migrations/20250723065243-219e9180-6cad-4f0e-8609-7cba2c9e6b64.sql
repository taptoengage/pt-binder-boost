-- Create client_subscriptions table
CREATE TABLE public.client_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  trainer_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE, -- Nullable for ongoing subscriptions
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('weekly', 'fortnightly', 'monthly')),
  payment_frequency TEXT NOT NULL CHECK (payment_frequency IN ('weekly', 'fortnightly', 'monthly')),
  billing_amount NUMERIC(10, 2), -- Total amount for the chosen billing_cycle
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.client_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policies for client_subscriptions
CREATE POLICY "Trainers can manage their own client subscriptions" 
ON public.client_subscriptions 
FOR ALL 
USING (auth.uid() = trainer_id);

CREATE POLICY "Clients can view their own subscriptions" 
ON public.client_subscriptions 
FOR SELECT 
USING (( SELECT clients.id FROM clients WHERE clients.email = auth.email()) = client_id);

-- Create subscription_service_allocations table
CREATE TABLE public.subscription_service_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.client_subscriptions(id) ON DELETE CASCADE NOT NULL,
  service_type_id UUID NOT NULL,
  quantity_per_period INTEGER NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly')),
  cost_per_session NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  
  UNIQUE (subscription_id, service_type_id, period_type)
);

-- Enable RLS
ALTER TABLE public.subscription_service_allocations ENABLE ROW LEVEL SECURITY;

-- Create policies for subscription_service_allocations
CREATE POLICY "Trainers can manage their own subscription allocations" 
ON public.subscription_service_allocations 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.client_subscriptions cs 
  WHERE cs.id = subscription_id AND cs.trainer_id = auth.uid()
));

CREATE POLICY "Clients can view their own subscription allocations" 
ON public.subscription_service_allocations 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.client_subscriptions cs 
  WHERE cs.id = subscription_id 
  AND cs.client_id = ( SELECT clients.id FROM clients WHERE clients.email = auth.email())
));

-- Add triggers for automatic timestamp updates
CREATE TRIGGER update_client_subscriptions_updated_at
BEFORE UPDATE ON public.client_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscription_service_allocations_updated_at
BEFORE UPDATE ON public.subscription_service_allocations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();