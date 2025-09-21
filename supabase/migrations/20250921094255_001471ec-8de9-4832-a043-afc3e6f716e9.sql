-- Add session notifications table for reminder idempotency
create table if not exists public.session_notifications (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  notification_type text not null check (notification_type in ('reminder_24h','reminder_2h')),
  sent_at timestamptz not null default now()
);

-- Prevent duplicates per session + type
create unique index if not exists session_notifications_unique_idx
  on public.session_notifications (session_id, notification_type);

-- Make RLS explicit (service role bypasses RLS, but we keep it enabled for safety)
alter table public.session_notifications enable row level security;