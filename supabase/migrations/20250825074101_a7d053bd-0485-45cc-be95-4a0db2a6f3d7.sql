
-- Enable and enforce Row Level Security on waitlist_signups
ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_signups FORCE ROW LEVEL SECURITY;
