CREATE TABLE public.trainer_availability_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL, -- e.g., 'monday', 'tuesday'
  start_time TEXT NOT NULL,  -- e.g., '09:00'
  end_time TEXT NOT NULL,    -- e.g., '17:00'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure a trainer doesn't have overlapping templates for the same day
  CONSTRAINT unique_trainer_day_time_template UNIQUE (trainer_id, day_of_week, start_time, end_time),

  -- Basic check for day_of_week values (optional but good practice)
  CONSTRAINT chk_day_of_week CHECK (day_of_week IN (
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  )),

  -- Basic check for time format (optional, but good practice if not using TIME type)
  CONSTRAINT chk_start_time_format CHECK (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  CONSTRAINT chk_end_time_format CHECK (end_time ~ '^[0-2][0-9]:[0-5][0-9]$')
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.trainer_availability_templates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Policy for trainers to view and manage their own availability templates
CREATE POLICY "Trainers can manage their own availability templates"
ON public.trainer_availability_templates
FOR ALL
USING (trainer_id = auth.uid())
WITH CHECK (trainer_id = auth.uid());

-- Add trigger for automatic updated_at timestamp
CREATE TRIGGER update_trainer_availability_templates_updated_at
BEFORE UPDATE ON public.trainer_availability_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();