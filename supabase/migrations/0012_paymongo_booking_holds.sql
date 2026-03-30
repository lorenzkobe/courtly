alter type public.booking_status add value if not exists 'pending_payment';

alter table public.bookings
  add column if not exists hold_expires_at timestamptz,
  add column if not exists payment_provider text,
  add column if not exists payment_link_id text,
  add column if not exists payment_link_url text,
  add column if not exists payment_link_created_at timestamptz,
  add column if not exists payment_attempt_count int not null default 0,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_failed_at timestamptz,
  add column if not exists payment_reference_id text,
  add column if not exists cancel_reason text,
  add column if not exists refund_required boolean not null default false,
  add column if not exists refund_attempted_at timestamptz,
  add column if not exists refunded_at timestamptz;

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists bookings_pending_hold_idx
  on public.bookings (status, court_id, date, hold_expires_at);

create index if not exists bookings_payment_link_id_idx
  on public.bookings (payment_link_id)
  where payment_link_id is not null;

create index if not exists bookings_payment_reference_id_idx
  on public.bookings (payment_reference_id)
  where payment_reference_id is not null;
