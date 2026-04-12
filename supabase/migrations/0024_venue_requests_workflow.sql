do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'venue_request_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.venue_request_status as enum (
      'pending',
      'approved',
      'rejected',
      'cancelled'
    );
  end if;
end
$$;

create table if not exists public.venue_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  contact_phone text not null,
  facebook_url text,
  instagram_url text,
  sport text not null,
  hourly_rate_windows jsonb not null default '[]'::jsonb,
  status public.venue_status not null default 'active',
  amenities text[] not null default '{}',
  image_url text not null default '',
  map_latitude double precision,
  map_longitude double precision,
  accepts_gcash boolean not null default false,
  gcash_account_name text,
  gcash_account_number text,
  accepts_maya boolean not null default false,
  maya_account_name text,
  maya_account_number text,
  request_status public.venue_request_status not null default 'pending',
  requested_by uuid not null references public.profiles(id) on delete cascade,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  approved_venue_id uuid references public.venues(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venue_requests_status_created_idx
  on public.venue_requests(request_status, created_at desc);

create index if not exists venue_requests_requested_by_status_idx
  on public.venue_requests(requested_by, request_status, created_at desc);

create index if not exists venue_requests_name_idx
  on public.venue_requests(lower(name));

create or replace function public.venue_requests_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists venue_requests_set_updated_at on public.venue_requests;
create trigger venue_requests_set_updated_at
before update on public.venue_requests
for each row execute function public.venue_requests_set_updated_at();

alter table public.venue_requests enable row level security;

create policy "venue requests read own or superadmin" on public.venue_requests
for select to authenticated
using (requested_by = auth.uid() or public.is_superadmin());

create policy "venue requests insert own admin" on public.venue_requests
for insert to authenticated
with check (
  requested_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'::public.app_role
  )
);

create policy "venue requests update own pending admin" on public.venue_requests
for update to authenticated
using (
  request_status = 'pending'
  and requested_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'::public.app_role
  )
)
with check (
  requested_by = auth.uid()
  and (
    request_status = 'pending'
    or request_status = 'cancelled'
  )
  and reviewed_by is null
  and reviewed_at is null
  and approved_venue_id is null
);

create policy "venue requests update superadmin" on public.venue_requests
for update to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

create policy "venue requests delete superadmin" on public.venue_requests
for delete to authenticated
using (public.is_superadmin());
