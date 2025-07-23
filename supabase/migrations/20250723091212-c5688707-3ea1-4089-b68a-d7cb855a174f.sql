-- Add subscription_id column to sessions table for linking sessions to subscriptions
ALTER TABLE public.sessions 
ADD COLUMN subscription_id UUID REFERENCES public.client_subscriptions(id) ON DELETE SET NULL;