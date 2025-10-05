-- Remove legacy no-argument get_trainer_busy_slots function
-- This ensures only the 3-parameter version (p_trainer_id, p_start_date, p_end_date) remains
DROP FUNCTION IF EXISTS public.get_trainer_busy_slots();