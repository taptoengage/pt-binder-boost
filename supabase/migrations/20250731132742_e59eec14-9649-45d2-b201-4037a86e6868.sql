-- Add RLS policies to allow clients to view their trainer's availability
CREATE POLICY "Clients can view their trainer's availability templates" 
ON public.trainer_availability_templates 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.clients 
    WHERE clients.user_id = auth.uid() 
    AND clients.trainer_id = trainer_availability_templates.trainer_id
  )
);

CREATE POLICY "Clients can view their trainer's availability exceptions" 
ON public.trainer_availability_exceptions 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.clients 
    WHERE clients.user_id = auth.uid() 
    AND clients.trainer_id = trainer_availability_exceptions.trainer_id
  )
);