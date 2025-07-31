-- Create a cron job to run the billing periods generation function daily at 2 AM
SELECT cron.schedule(
  'generate-recurring-billing-periods',
  '0 2 * * *',
  $$
  SELECT
    net.http_post(
        url:='https://rjislxmkntaunloeqdzx.supabase.co/functions/v1/generate-recurring-billing-periods',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqaXNseG1rbnRhdW5sb2VxZHp4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjczMDE5NiwiZXhwIjoyMDY4MzA2MTk2fQ.EuOXM3kaPi1HqxXmgdOCqAB2HCl9xhw9zP61Uy1UHyY"}'::jsonb,
        body:='{"scheduled": true}'::jsonb
    ) as request_id;
  $$
);