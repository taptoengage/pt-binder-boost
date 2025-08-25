-- Fix security warning: Add RLS policy for waitlist_signups table
-- This allows only service role / edge functions to manage waitlist signups
-- No policies for regular users since this is managed via edge function only

CREATE POLICY "Service role can manage waitlist signups" 
ON public.waitlist_signups 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);