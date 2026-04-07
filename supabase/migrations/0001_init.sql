create extension if not exists pgcrypto;

create type public.app_role as enum ('user', 'admin', 'superadmin');
create type public.venue_status as enum ('active', 'closed');
create type public.court_status as enum ('active', 'closed');
create type public.booking_status as enum ('confirmed', 'cancelled', 'completed');
create type public.tournament_format as enum ('singles', 'doubles', 'mixed_doubles', 'round_robin');
create type public.tournament_skill as enum ('beginner', 'intermediate', 'advanced', 'open');
create type public.tournament_status as enum ('upcoming', 'registration_open', 'registration_closed', 'in_progress', 'completed');
create type public.registration_status as enum ('registered', 'waitlisted', 'cancelled');
create type public.open_play_skill as enum ('all_levels', 'beginner', 'intermediate', 'advanced');
create type public.open_play_status as enum ('open', 'full', 'cancelled', 'completed');
create type public.notification_type as enum (
  'booking_cancelled',
  'booking_changed',
  'booking_completed_review_reminder',
  'booking_created_admin',
  'review_added_admin',
  'review_flagged_author',
  'review_flagged_superadmin',
  'review_flag_resolution_feedback',
  'court_created_superadmin'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'user',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  contact_phone text not null,
  sport text not null,
  hourly_rate numeric(10,2) not null default 0,
  hourly_rate_windows jsonb not null default '[]'::jsonb,
  opens_at text not null,
  closes_at text not null,
  status public.venue_status not null default 'active',
  amenities text[] not null default '{}',
  image_url text not null default '',
  created_at timestamptz not null default now(),
  map_latitude double precision,
  map_longitude double precision
);

create table public.venue_admin_assignments (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (venue_id, admin_user_id)
);

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  status public.court_status not null default 'active',
  type text not null default 'indoor',
  surface text not null default 'sport_court',
  gallery_urls text[] not null default '{}',
  description text
);

create table public.venue_closures (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  date date not null,
  start_time text not null,
  end_time text not null,
  reason text not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.court_closures (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts(id) on delete cascade,
  date date not null,
  start_time text not null,
  end_time text not null,
  reason text not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  booking_group_id uuid,
  date date not null,
  start_time text not null,
  end_time text not null,
  player_name text,
  player_email text,
  players_count int,
  court_subtotal numeric(10,2),
  booking_fee numeric(10,2),
  total_cost numeric(10,2),
  status public.booking_status not null default 'confirmed',
  notes text,
  admin_note text,
  admin_note_updated_by_user_id uuid references public.profiles(id) on delete set null,
  admin_note_updated_by_name text,
  admin_note_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.court_reviews (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_name text not null,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  flagged boolean not null default false,
  flagged_at timestamptz,
  flagged_by_user_id uuid references public.profiles(id) on delete set null,
  flag_reason text
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  sport text not null,
  name text not null,
  description text,
  date date not null,
  start_time text not null,
  end_time text not null,
  format public.tournament_format not null,
  skill_level public.tournament_skill not null,
  max_participants int not null,
  current_participants int not null default 0,
  entry_fee numeric(10,2) not null default 0,
  prize text,
  location text not null,
  image_url text,
  status public.tournament_status not null default 'upcoming'
);

create table public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  player_name text not null,
  player_email text not null,
  partner_name text,
  skill_level public.tournament_skill not null,
  status public.registration_status not null default 'registered',
  created_at timestamptz not null default now()
);

create table public.open_play_sessions (
  id uuid primary key default gen_random_uuid(),
  sport text not null,
  title text not null,
  date date not null,
  start_time text not null,
  end_time text not null,
  skill_level public.open_play_skill not null default 'all_levels',
  location text not null,
  court_id uuid references public.courts(id) on delete set null,
  max_players int not null,
  current_players int not null default 0,
  host_name text not null,
  host_email text,
  description text,
  fee numeric(10,2) not null default 0,
  status public.open_play_status not null default 'open'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default 'platform',
  type public.notification_type not null default 'booking_changed',
  title text not null,
  body text not null,
  metadata jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index bookings_court_id_date_idx on public.bookings(court_id, date);
create index bookings_user_id_idx on public.bookings(user_id);
create index court_reviews_venue_id_idx on public.court_reviews(venue_id);
create index venue_admin_assignments_admin_idx on public.venue_admin_assignments(admin_user_id);
create index notifications_user_id_idx on public.notifications(user_id, created_at desc);

create or replace function public.is_superadmin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'::public.app_role
  );
$$;

create or replace function public.is_venue_admin_for_venue(target_venue_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.venue_admin_assignments va
    where va.admin_user_id = auth.uid() and va.venue_id = target_venue_id
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.venues enable row level security;
alter table public.venue_admin_assignments enable row level security;
alter table public.courts enable row level security;
alter table public.venue_closures enable row level security;
alter table public.court_closures enable row level security;
alter table public.bookings enable row level security;
alter table public.court_reviews enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.open_play_sessions enable row level security;
alter table public.notifications enable row level security;

create policy "profiles select own or superadmin" on public.profiles
for select using (id = auth.uid() or public.is_superadmin());
create policy "profiles update own or superadmin" on public.profiles
for update using (id = auth.uid() or public.is_superadmin());
create policy "profiles insert superadmin" on public.profiles
for insert with check (public.is_superadmin());

create policy "venues read all authed" on public.venues
for select to authenticated using (true);
create policy "venues mutate admins and superadmin" on public.venues
for all to authenticated using (public.is_superadmin())
with check (public.is_superadmin());

create policy "venue assignments read authed" on public.venue_admin_assignments
for select to authenticated using (true);
create policy "venue assignments mutate superadmin" on public.venue_admin_assignments
for all to authenticated using (public.is_superadmin())
with check (public.is_superadmin());

create policy "courts read all authed" on public.courts
for select to authenticated using (true);
create policy "courts mutate admins and superadmin" on public.courts
for all to authenticated
using (
  public.is_superadmin() or public.is_venue_admin_for_venue(venue_id)
)
with check (
  public.is_superadmin() or public.is_venue_admin_for_venue(venue_id)
);

create policy "venue closures read authed" on public.venue_closures
for select to authenticated using (true);
create policy "venue closures mutate admins and superadmin" on public.venue_closures
for all to authenticated
using (
  public.is_superadmin() or public.is_venue_admin_for_venue(venue_id)
)
with check (
  public.is_superadmin() or public.is_venue_admin_for_venue(venue_id)
);

create policy "court closures read authed" on public.court_closures
for select to authenticated using (true);
create policy "court closures mutate admins and superadmin" on public.court_closures
for all to authenticated
using (
  public.is_superadmin() or exists (
    select 1 from public.courts c
    where c.id = court_id and public.is_venue_admin_for_venue(c.venue_id)
  )
)
with check (
  public.is_superadmin() or exists (
    select 1 from public.courts c
    where c.id = court_id and public.is_venue_admin_for_venue(c.venue_id)
  )
);

create policy "bookings read own admin or superadmin" on public.bookings
for select to authenticated
using (
  user_id = auth.uid()
  or public.is_superadmin()
  or exists (
    select 1 from public.courts c
    where c.id = court_id and public.is_venue_admin_for_venue(c.venue_id)
  )
);
create policy "bookings insert own admin or superadmin" on public.bookings
for insert to authenticated
with check (
  user_id = auth.uid()
  or public.is_superadmin()
  or exists (
    select 1 from public.courts c
    where c.id = court_id and public.is_venue_admin_for_venue(c.venue_id)
  )
);
create policy "bookings update own admin or superadmin" on public.bookings
for update to authenticated
using (
  user_id = auth.uid()
  or public.is_superadmin()
  or exists (
    select 1 from public.courts c
    where c.id = court_id and public.is_venue_admin_for_venue(c.venue_id)
  )
);

create policy "reviews read authed" on public.court_reviews
for select to authenticated using (true);
create policy "reviews insert own booking" on public.court_reviews
for insert to authenticated
with check (user_id = auth.uid() or public.is_superadmin());
create policy "reviews update own or superadmin" on public.court_reviews
for update to authenticated
using (user_id = auth.uid() or public.is_superadmin());
create policy "reviews delete own or superadmin" on public.court_reviews
for delete to authenticated
using (user_id = auth.uid() or public.is_superadmin());

create policy "tournaments read authed" on public.tournaments
for select to authenticated using (true);
create policy "tournaments mutate superadmin" on public.tournaments
for all to authenticated using (public.is_superadmin())
with check (public.is_superadmin());

create policy "registrations read own or superadmin" on public.tournament_registrations
for select to authenticated using (user_id = auth.uid() or public.is_superadmin());
create policy "registrations insert own or superadmin" on public.tournament_registrations
for insert to authenticated with check (user_id = auth.uid() or public.is_superadmin());
create policy "registrations update own or superadmin" on public.tournament_registrations
for update to authenticated using (user_id = auth.uid() or public.is_superadmin());

create policy "open play read authed" on public.open_play_sessions
for select to authenticated using (true);
create policy "open play mutate admin or superadmin" on public.open_play_sessions
for all to authenticated using (public.is_superadmin())
with check (public.is_superadmin());

create policy "notifications read own" on public.notifications
for select to authenticated using (user_id = auth.uid());
create policy "notifications update own" on public.notifications
for update to authenticated using (user_id = auth.uid());
create policy "notifications insert own or superadmin" on public.notifications
for insert to authenticated with check (user_id = auth.uid() or public.is_superadmin());
