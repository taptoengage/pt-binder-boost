CREATE TABLE public.trainer_availability_exceptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL, -- The specific date of the exception
  exception_type TEXT NOT NULL, -- e.g., 'unavailable_full_day', 'unavailable_partial_day', 'available_extra_slot'
  start_time TEXT,             -- Optional: for 'unavailable_partial_day' or 'available_extra_slot'
  end_time TEXT,               -- Optional: for 'unavailable_partial_day' or 'available_extra_slot'
  is_available BOOLEAN NOT NULL, -- TRUE if adding an available slot, FALSE if making time unavailable
  notes TEXT,                  -- Optional: reason for exception (e.g., "Holiday", "Appointment")
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique exceptions for a given date/time block (if applicable)
  CONSTRAINT unique_trainer_exception UNIQUE (trainer_id, exception_date, start_time, end_time),

  -- Basic check for exception_type values
  CONSTRAINT chk_exception_type CHECK (exception_type IN (
      'unavailable_full_day', 'unavailable_partial_day', 'available_extra_slot'
  )),

  -- Basic check for time format (optional, if using TEXT for time)
  CONSTRAINT chk_exception_start_time_format CHECK (start_time ~ '^[0-2][0-9]:[0-5][0-9]$' OR start_time IS NULL),
  CONSTRAINT chk_exception_end_time_format CHECK (end_time ~ '^[0-2][0-9]:[0-5][0-9]$' OR end_time IS NULL)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.trainer_availability_exceptions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Policy for trainers to view and manage their own availability exceptions
CREATE POLICY "Trainers can manage their own availability exceptions"
ON public.trainer_availability_exceptions
FOR ALL
USING (trainer_id = auth.uid())
WITH CHECK (trainer_id = auth.uid());

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_trainer_availability_exceptions_updated_at
    BEFORE UPDATE ON public.trainer_availability_exceptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();