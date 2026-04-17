create table if not exists public.booking_admin_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  booking_group_id uuid,
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists booking_admin_notes_booking_idx
  on public.booking_admin_notes (booking_id, created_at desc);

create index if not exists booking_admin_notes_group_idx
  on public.booking_admin_notes (booking_group_id, created_at desc)
  where booking_group_id is not null;

