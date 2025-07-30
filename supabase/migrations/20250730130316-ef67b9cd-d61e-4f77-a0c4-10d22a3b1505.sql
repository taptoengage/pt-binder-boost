-- Add receipt_number column to payments table
ALTER TABLE public.payments
ADD COLUMN receipt_number TEXT;