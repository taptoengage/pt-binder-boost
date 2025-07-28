-- Enable Row Level Security on subscription_session_credits table
ALTER TABLE public.subscription_session_credits ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for subscription_session_credits
CREATE POLICY "Trainers can manage their subscription session credits"
ON public.subscription_session_credits
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM client_subscriptions cs 
    WHERE cs.id = subscription_session_credits.subscription_id 
    AND cs.trainer_id = auth.uid()
  )
);

CREATE POLICY "Clients can view their subscription session credits"
ON public.subscription_session_credits
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM client_subscriptions cs 
    WHERE cs.id = subscription_session_credits.subscription_id 
    AND cs.client_id = (
      SELECT clients.id FROM clients WHERE clients.email = auth.email()
    )
  )
);