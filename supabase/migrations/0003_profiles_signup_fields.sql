alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists birthdate date,
  add column if not exists mobile_number text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_first_name_min_length_check'
  ) then
    alter table public.profiles
      add constraint profiles_first_name_min_length_check
      check (first_name is null or char_length(trim(first_name)) >= 2);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_last_name_min_length_check'
  ) then
    alter table public.profiles
      add constraint profiles_last_name_min_length_check
      check (last_name is null or char_length(trim(last_name)) >= 2);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_mobile_number_ph_format_check'
  ) then
    alter table public.profiles
      add constraint profiles_mobile_number_ph_format_check
      check (
        mobile_number is null
        or mobile_number ~ '^(?:\+63|0)9[0-9]{9}$'
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_birthdate_in_past_check'
  ) then
    alter table public.profiles
      add constraint profiles_birthdate_in_past_check
      check (birthdate is null or birthdate <= current_date);
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    first_name,
    last_name,
    birthdate,
    mobile_number
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''),
    nullif(new.raw_user_meta_data ->> 'birthdate', '')::date,
    nullif(trim(new.raw_user_meta_data ->> 'mobile_number'), '')
  )
  on conflict (id) do update
    set
      full_name = excluded.full_name,
      first_name = coalesce(excluded.first_name, public.profiles.first_name),
      last_name = coalesce(excluded.last_name, public.profiles.last_name),
      birthdate = coalesce(excluded.birthdate, public.profiles.birthdate),
      mobile_number = coalesce(excluded.mobile_number, public.profiles.mobile_number),
      updated_at = now();

  return new;
end;
$$;
