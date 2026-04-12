alter table public.bookings
  add column if not exists status_updated_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists status_updated_by_name text,
  add column if not exists status_updated_at timestamptz;
