-- Sub-Phase 1A: Backend foundation for waitlist signups
-- 1) Create waitlist_signups table (additive, no impact on existing flows)
CREATE TABLE IF NOT EXISTS public.waitlist_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  -- Generated lowercased version for uniqueness & dedupe
  normalized_email text GENERATED ALWAYS AS (lower(trim(email))) STORED,
  source text NOT NULL DEFAULT 'unknown',
  referrer text,
  ip_address text,
  user_agent text,
  metadata jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Indexes & constraints
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_signups_normalized_email_key 
  ON public.waitlist_signups (normalized_email);

-- 3) Enable RLS (no broad policies -> only service role / edge functions can access)
ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

-- 4) Update trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_waitlist_signups_updated_at'
  ) THEN
    CREATE TRIGGER update_waitlist_signups_updated_at
    BEFORE UPDATE ON public.waitlist_signups
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END$$;
