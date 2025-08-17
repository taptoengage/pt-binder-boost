-- Add first_name and last_name columns to clients table
ALTER TABLE public.clients 
ADD COLUMN first_name TEXT,
ADD COLUMN last_name TEXT;

-- Add first_name and last_name columns to trainers table  
ALTER TABLE public.trainers
ADD COLUMN first_name TEXT,
ADD COLUMN last_name TEXT;

-- Split existing name data for clients
UPDATE public.clients 
SET 
  first_name = TRIM(split_part(name, ' ', 1)),
  last_name = TRIM(substring(name from position(' ' in name) + 1))
WHERE name IS NOT NULL AND name != '';

-- Handle single names (no space) for clients
UPDATE public.clients 
SET 
  first_name = TRIM(name),
  last_name = ''
WHERE name IS NOT NULL AND name != '' AND position(' ' in name) = 0;

-- Split existing business_name data for trainers (assuming it might contain first/last names)
UPDATE public.trainers 
SET 
  first_name = TRIM(split_part(business_name, ' ', 1)),
  last_name = TRIM(substring(business_name from position(' ' in business_name) + 1))
WHERE business_name IS NOT NULL AND business_name != '' AND position(' ' in business_name) > 0;

-- Handle single names for trainers
UPDATE public.trainers 
SET 
  first_name = TRIM(business_name),
  last_name = ''
WHERE business_name IS NOT NULL AND business_name != '' AND position(' ' in business_name) = 0;

-- Set NOT NULL constraints after data migration
ALTER TABLE public.clients 
ALTER COLUMN first_name SET NOT NULL,
ALTER COLUMN first_name SET DEFAULT '',
ALTER COLUMN last_name SET NOT NULL,
ALTER COLUMN last_name SET DEFAULT '';

ALTER TABLE public.trainers
ALTER COLUMN first_name SET NOT NULL,
ALTER COLUMN first_name SET DEFAULT '',
ALTER COLUMN last_name SET NOT NULL, 
ALTER COLUMN last_name SET DEFAULT '';