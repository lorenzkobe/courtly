create table if not exists public.favorite_venues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, venue_id)
);

create index if not exists favorite_venues_user_id_idx
  on public.favorite_venues(user_id);
