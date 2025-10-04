-- Check if client_time_preferences table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'client_time_preferences';