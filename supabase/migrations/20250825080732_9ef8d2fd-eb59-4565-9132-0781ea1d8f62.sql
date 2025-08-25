
-- 1) Ensure deduplication by normalized_email (idempotent unique index)
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_signups_normalized_email_unique_idx
  ON public.waitlist_signups (normalized_email);

-- 2) Create SECURITY DEFINER function to handle waitlist signups with graceful duplicate handling
CREATE OR REPLACE FUNCTION public.add_to_waitlist(
  p_email text,
  p_source text DEFAULT 'unknown',
  p_referrer text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  email text,
  created_at timestamptz,
  duplicate boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_email text;
  v_created timestamptz;
  v_duplicate boolean := false;
  v_normalized_email text := lower(trim(p_email));
BEGIN
  -- Basic validation: require a non-empty email (format validation can be done in the edge function)
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'Valid email address is required';
  END IF;

  -- Try to insert; if a duplicate exists, do nothing and detect it via lack of RETURNING row
  INSERT INTO public.waitlist_signups (
    email,
    normalized_email,
    source,
    referrer,
    metadata,
    ip_address,
    user_agent,
    status
  ) VALUES (
    trim(p_email),
    v_normalized_email,
    COALESCE(p_source, 'unknown'),
    COALESCE(p_referrer, ''),
    COALESCE(p_metadata, '{}'::jsonb),
    p_ip_address,
    p_user_agent,
    'pending'
  )
  ON CONFLICT (normalized_email) DO NOTHING
  RETURNING id, email, created_at
  INTO v_id, v_email, v_created;

  IF v_id IS NULL THEN
    -- Duplicate: fetch existing row to return a clean response
    SELECT w.id, w.email, w.created_at
    INTO v_id, v_email, v_created
    FROM public.waitlist_signups w
    WHERE w.normalized_email = v_normalized_email;

    v_duplicate := true;
  END IF;

  RETURN QUERY SELECT v_id, v_email, v_created, v_duplicate;
END;
$$;

-- 3) Allow anon/authenticated to execute the function (they still cannot read the table due to RLS)
GRANT EXECUTE ON FUNCTION public.add_to_waitlist(text, text, text, jsonb, text, text)
TO anon, authenticated;
