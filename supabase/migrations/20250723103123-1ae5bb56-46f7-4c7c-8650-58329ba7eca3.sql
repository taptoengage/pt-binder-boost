-- Create subscription_session_credits table
CREATE TABLE public.subscription_session_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.client_subscriptions(id) ON DELETE CASCADE NOT NULL,
  service_type_id UUID REFERENCES public.service_types(id) NOT NULL,
  credit_amount INTEGER NOT NULL DEFAULT 1 CHECK (credit_amount > 0),
  credit_value NUMERIC(10, 2) NOT NULL,
  credit_reason TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'used_for_session', 'applied_to_payment', 'refunded', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS on subscription_session_credits
ALTER TABLE public.subscription_session_credits ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for subscription_session_credits
CREATE POLICY "Trainers can manage their own subscription session credits" ON public.subscription_session_credits
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.client_subscriptions cs
    WHERE cs.id = subscription_session_credits.subscription_id 
    AND cs.trainer_id = auth.uid()
  )
);

CREATE POLICY "Clients can view their own subscription session credits" ON public.subscription_session_credits
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.client_subscriptions cs
    WHERE cs.id = subscription_session_credits.subscription_id 
    AND cs.client_id = (
      SELECT c.id FROM public.clients c WHERE c.email = auth.email()
    )
  )
);

-- Add new columns to sessions table
ALTER TABLE public.sessions
ADD COLUMN is_from_credit BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN credit_id_consumed UUID REFERENCES public.subscription_session_credits(id);