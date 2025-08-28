-- PHASE 1.4 — Index on clients.user_id
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients (user_id);