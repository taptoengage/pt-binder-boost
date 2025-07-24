ALTER TABLE public.subscription_service_allocations
ADD COLUMN max_sessions_per_period INTEGER NOT NULL DEFAULT 1;