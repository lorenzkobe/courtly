alter table public.profiles
  add column if not exists dupr_rating numeric(5,2) not null default 0.00;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_dupr_rating_chk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_dupr_rating_chk
      check (dupr_rating >= 0 and dupr_rating <= 8);
  end if;
end;
$$;

alter table public.open_play_sessions
  add column if not exists booking_group_id uuid,
  add column if not exists host_user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists dupr_min numeric(5,2),
  add column if not exists dupr_max numeric(5,2),
  add column if not exists price_per_player numeric(10,2) not null default 0,
  add column if not exists accepts_gcash boolean not null default false,
  add column if not exists gcash_account_name text,
  add column if not exists gcash_account_number text,
  add column if not exists accepts_maya boolean not null default false,
  add column if not exists maya_account_name text,
  add column if not exists maya_account_number text;

update public.open_play_sessions
set price_per_player = coalesce(fee, 0)
where price_per_player = 0 and coalesce(fee, 0) <> 0;

update public.open_play_sessions s
set
  accepts_gcash = coalesce(v.accepts_gcash, false),
  gcash_account_name = v.gcash_account_name,
  gcash_account_number = v.gcash_account_number,
  accepts_maya = coalesce(v.accepts_maya, false),
  maya_account_name = v.maya_account_name,
  maya_account_number = v.maya_account_number
from public.courts c
join public.venues v on v.id = c.venue_id
where c.id = s.court_id
  and (
    s.accepts_gcash = false
    and s.accepts_maya = false
  );

update public.open_play_sessions
set
  accepts_gcash = true,
  gcash_account_name = coalesce(nullif(btrim(gcash_account_name), ''), host_name, 'Host Account'),
  gcash_account_number = coalesce(
    nullif(btrim(gcash_account_number), ''),
    nullif(btrim(host_email), ''),
    'UPDATE_REQUIRED'
  )
where not accepts_gcash
  and not accepts_maya;

update public.open_play_sessions s
set host_user_id = p.id
from public.profiles p
where s.host_user_id is null
  and p.id::text = s.host_email;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'open_play_sessions_dupr_range_chk'
      and conrelid = 'public.open_play_sessions'::regclass
  ) then
    alter table public.open_play_sessions
      add constraint open_play_sessions_dupr_range_chk
      check (
        (dupr_min is null and dupr_max is null)
        or (
          dupr_min is not null
          and dupr_max is not null
          and dupr_min >= 0
          and dupr_max <= 8
          and dupr_min <= dupr_max
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'open_play_sessions_host_payment_method_chk'
      and conrelid = 'public.open_play_sessions'::regclass
  ) then
    alter table public.open_play_sessions
      add constraint open_play_sessions_host_payment_method_chk
      check (
        accepts_gcash
        or accepts_maya
      );
  end if;
end;
$$;

create unique index if not exists open_play_sessions_booking_group_uidx
  on public.open_play_sessions(booking_group_id)
  where booking_group_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'open_play_join_request_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.open_play_join_request_status as enum (
      'waitlisted',
      'payment_locked',
      'pending_approval',
      'approved',
      'denied',
      'expired',
      'cancelled'
    );
  end if;
end;
$$;

create table if not exists public.open_play_join_requests (
  id uuid primary key default gen_random_uuid(),
  open_play_session_id uuid not null references public.open_play_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.open_play_join_request_status not null default 'waitlisted',
  payment_lock_expires_at timestamptz,
  payment_method text,
  payment_proof_url text,
  payment_proof_mime_type text,
  payment_proof_bytes integer,
  payment_proof_width integer,
  payment_proof_height integer,
  payment_submitted_at timestamptz,
  join_note text,
  organizer_note text,
  decided_at timestamptz,
  decided_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.open_play_comments (
  id uuid primary key default gen_random_uuid(),
  open_play_session_id uuid not null references public.open_play_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  flagged boolean not null default false,
  flagged_at timestamptz,
  flagged_by_user_id uuid references public.profiles(id) on delete set null,
  flag_reason text
);

create index if not exists open_play_join_requests_session_status_idx
  on public.open_play_join_requests(open_play_session_id, status);

create index if not exists open_play_join_requests_session_created_idx
  on public.open_play_join_requests(open_play_session_id, created_at);

create index if not exists open_play_comments_session_created_idx
  on public.open_play_comments(open_play_session_id, created_at);

create unique index if not exists open_play_join_requests_user_active_uidx
  on public.open_play_join_requests(open_play_session_id, user_id)
  where status in ('waitlisted', 'payment_locked', 'pending_approval', 'approved');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'open_play_join_requests_payment_method_chk'
      and conrelid = 'public.open_play_join_requests'::regclass
  ) then
    alter table public.open_play_join_requests
      add constraint open_play_join_requests_payment_method_chk
      check (payment_method is null or payment_method in ('gcash', 'maya'));
  end if;
end;
$$;

create or replace function public.open_play_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists open_play_join_requests_set_updated_at on public.open_play_join_requests;
create trigger open_play_join_requests_set_updated_at
before update on public.open_play_join_requests
for each row execute function public.open_play_set_updated_at();

drop trigger if exists open_play_comments_set_updated_at on public.open_play_comments;
create trigger open_play_comments_set_updated_at
before update on public.open_play_comments
for each row execute function public.open_play_set_updated_at();

create or replace function public.open_play_acquire_payment_lock(
  p_session_id uuid,
  p_user_id uuid,
  p_lock_minutes integer default 5
)
returns table(
  result text,
  request_id uuid,
  payment_lock_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_lock_until timestamptz := now() + make_interval(mins => greatest(1, p_lock_minutes));
  v_max_players integer;
  v_existing_id uuid;
  v_existing_status public.open_play_join_request_status;
  v_consuming_count integer;
  v_updated integer;
begin
  select s.max_players
  into v_max_players
  from public.open_play_sessions s
  where s.id = p_session_id
  for update;

  if v_max_players is null then
    return query select 'not_found'::text, null::uuid, null::timestamptz;
    return;
  end if;

  update public.open_play_join_requests
  set status = 'expired',
      payment_lock_expires_at = null
  where open_play_session_id = p_session_id
    and status = 'payment_locked'
    and payment_lock_expires_at is not null
    and payment_lock_expires_at <= v_now;

  select r.id, r.status
  into v_existing_id, v_existing_status
  from public.open_play_join_requests r
  where r.open_play_session_id = p_session_id
    and r.user_id = p_user_id
  order by r.created_at desc
  limit 1
  for update;

  if v_existing_status in ('approved', 'pending_approval', 'payment_locked') then
    return query select 'already_active'::text, v_existing_id, null::timestamptz;
    return;
  end if;

  if v_existing_status is null then
    insert into public.open_play_join_requests (open_play_session_id, user_id, status)
    values (p_session_id, p_user_id, 'waitlisted')
    returning id into v_existing_id;
    v_existing_status := 'waitlisted';
  end if;

  select count(*)
  into v_consuming_count
  from public.open_play_join_requests r
  where r.open_play_session_id = p_session_id
    and r.status in ('payment_locked', 'pending_approval', 'approved');

  if v_consuming_count >= v_max_players then
    return query select 'full'::text, v_existing_id, null::timestamptz;
    return;
  end if;

  update public.open_play_join_requests
  set status = 'payment_locked',
      payment_lock_expires_at = v_lock_until
  where id = v_existing_id
    and status = 'waitlisted';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return query select 'already_active'::text, v_existing_id, null::timestamptz;
    return;
  end if;

  return query select 'locked'::text, v_existing_id, v_lock_until;
end;
$$;

alter table public.open_play_join_requests enable row level security;
alter table public.open_play_comments enable row level security;

drop policy if exists "open play mutate admin or superadmin" on public.open_play_sessions;
create policy "open play mutate host or superadmin" on public.open_play_sessions
for all to authenticated
using (public.is_superadmin() or host_user_id = auth.uid())
with check (public.is_superadmin() or host_user_id = auth.uid());

create policy "open play requests read own host superadmin" on public.open_play_join_requests
for select to authenticated
using (
  user_id = auth.uid()
  or public.is_superadmin()
  or exists (
    select 1
    from public.open_play_sessions s
    where s.id = open_play_session_id
      and s.host_user_id = auth.uid()
  )
);

create policy "open play requests insert own" on public.open_play_join_requests
for insert to authenticated
with check (user_id = auth.uid());

create policy "open play requests update own host superadmin" on public.open_play_join_requests
for update to authenticated
using (
  user_id = auth.uid()
  or public.is_superadmin()
  or exists (
    select 1
    from public.open_play_sessions s
    where s.id = open_play_session_id
      and s.host_user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  or public.is_superadmin()
  or exists (
    select 1
    from public.open_play_sessions s
    where s.id = open_play_session_id
      and s.host_user_id = auth.uid()
  )
);

create policy "open play comments read authed" on public.open_play_comments
for select to authenticated using (true);

create policy "open play comments insert own" on public.open_play_comments
for insert to authenticated with check (user_id = auth.uid());

create policy "open play comments update own or superadmin" on public.open_play_comments
for update to authenticated
using (user_id = auth.uid() or public.is_superadmin())
with check (user_id = auth.uid() or public.is_superadmin());
