-- ============================================================
-- Atomic Pack Consumption RPC (safe for RLS)
-- Decrements N sessions in one transaction with caller binding
-- ============================================================

CREATE OR REPLACE FUNCTION public.consume_pack_sessions(
  p_pack_id uuid,
  p_trainer_id uuid,
  p_service_type_id uuid,
  p_to_consume int
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining integer;
BEGIN
  -- Guard: positive amount
  IF p_to_consume IS NULL OR p_to_consume <= 0 THEN
    RAISE EXCEPTION 'to_consume must be > 0';
  END IF;

  -- Bind caller to trainer: MUST be the same as JWT subject
  IF auth.uid() IS NULL OR auth.uid() <> p_trainer_id THEN
    RAISE EXCEPTION 'forbidden: caller does not match trainer';
  END IF;

  -- Single atomic decrement with guards
  UPDATE public.session_packs sp
     SET sessions_remaining = sp.sessions_remaining - p_to_consume,
         updated_at = now()
   WHERE sp.id = p_pack_id
     AND sp.trainer_id = p_trainer_id
     AND sp.service_type_id = p_service_type_id
     AND sp.status = 'active'
     AND sp.sessions_remaining >= p_to_consume
  RETURNING sp.sessions_remaining
    INTO v_remaining;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient capacity or service type mismatch';
  END IF;

  RETURN v_remaining;
END;
$$;

-- Lock down execution: no PUBLIC
REVOKE ALL ON FUNCTION public.consume_pack_sessions(uuid,uuid,uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_pack_sessions(uuid,uuid,uuid,int) TO authenticated;

-- (Optional but recommended) make sure the owner is a safe role
-- ALTER FUNCTION public.consume_pack_sessions(uuid,uuid,uuid,int) OWNER TO postgres;