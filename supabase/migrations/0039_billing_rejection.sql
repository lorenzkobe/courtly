alter table public.venue_billing_cycles
  add column if not exists payment_rejected_at         timestamptz,
  add column if not exists payment_rejection_note      text,
  add column if not exists payment_rejected_by_user_id uuid references public.profiles(id) on delete set null;
