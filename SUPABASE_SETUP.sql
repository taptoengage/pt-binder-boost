-- SQL for setting up the trainers table and Row Level Security (RLS)
-- Run this in your Supabase SQL editor

-- Create the trainers table
CREATE TABLE trainers (
    id UUID PRIMARY KEY DEFAULT auth.uid(),
    business_name TEXT NOT NULL,
    contact_email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security on the trainers table
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for trainers table
-- Allow authenticated users to SELECT, INSERT, UPDATE their own trainer record
CREATE POLICY "Trainers can manage their own record" ON trainers
    FOR ALL USING (auth.uid() = id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at on trainers table
CREATE TRIGGER update_trainers_updated_at
    BEFORE UPDATE ON trainers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();