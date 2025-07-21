-- Debug session pack consumption trigger by removing WHEN clause
DROP TRIGGER IF EXISTS on_session_completed_decrement_pack ON public.sessions;

CREATE TRIGGER on_session_completed_decrement_pack
  AFTER UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_session_pack_on_complete();