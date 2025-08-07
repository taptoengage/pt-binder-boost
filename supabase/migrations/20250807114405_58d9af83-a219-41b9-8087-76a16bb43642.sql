-- Fix client user_id data integrity
-- This will link client records to their corresponding auth.users records based on email matching

-- Update clients table to set user_id based on matching email addresses
-- This assumes that client emails match the emails in auth.users
UPDATE public.clients 
SET user_id = auth_users.id,
    updated_at = now()
FROM auth.users AS auth_users
WHERE clients.email = auth_users.email
AND clients.user_id IS NULL;