alter type public.booking_status add value if not exists 'pending_confirmation';

alter table public.venues
  add column if not exists accepts_gcash boolean not null default false,
  add column if not exists gcash_account_name text,
  add column if not exists gcash_account_number text,
  add column if not exists accepts_maya boolean not null default false,
  add column if not exists maya_account_name text,
  add column if not exists maya_account_number text;

alter table public.bookings
  add column if not exists payment_submitted_method text,
  add column if not exists payment_proof_url text,
  add column if not exists payment_submitted_at timestamptz,
  add column if not exists payment_proof_mime_type text,
  add column if not exists payment_proof_bytes integer,
  add column if not exists payment_proof_width integer,
  add column if not exists payment_proof_height integer;

-- Backfill existing venues before enforcing constraints.
-- For active venues with no configured method yet, bootstrap GCash using existing venue data.
update public.venues
set
  accepts_gcash = true,
  gcash_account_name = coalesce(
    nullif(btrim(gcash_account_name), ''),
    nullif(btrim(name), ''),
    'Venue Account'
  ),
  gcash_account_number = coalesce(
    nullif(btrim(gcash_account_number), ''),
    nullif(btrim(contact_phone), ''),
    'UPDATE_REQUIRED'
  )
where status = 'active'
  and not accepts_gcash
  and not accepts_maya;

-- Ensure enabled methods always have non-empty account details for legacy rows.
update public.venues
set
  gcash_account_name = coalesce(
    nullif(btrim(gcash_account_name), ''),
    nullif(btrim(name), ''),
    'Venue Account'
  ),
  gcash_account_number = coalesce(
    nullif(btrim(gcash_account_number), ''),
    nullif(btrim(contact_phone), ''),
    'UPDATE_REQUIRED'
  )
where accepts_gcash;

update public.venues
set
  maya_account_name = coalesce(
    nullif(btrim(maya_account_name), ''),
    nullif(btrim(name), ''),
    'Venue Account'
  ),
  maya_account_number = coalesce(
    nullif(btrim(maya_account_number), ''),
    nullif(btrim(contact_phone), ''),
    'UPDATE_REQUIRED'
  )
where accepts_maya;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'venues_manual_payment_method_required_chk'
  ) then
    alter table public.venues
      add constraint venues_manual_payment_method_required_chk
      check (
        status = 'closed'
        or accepts_gcash
        or accepts_maya
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'venues_gcash_fields_when_enabled_chk'
  ) then
    alter table public.venues
      add constraint venues_gcash_fields_when_enabled_chk
      check (
        not accepts_gcash
        or (
          char_length(btrim(coalesce(gcash_account_name, ''))) > 0
          and char_length(btrim(coalesce(gcash_account_number, ''))) > 0
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'venues_maya_fields_when_enabled_chk'
  ) then
    alter table public.venues
      add constraint venues_maya_fields_when_enabled_chk
      check (
        not accepts_maya
        or (
          char_length(btrim(coalesce(maya_account_name, ''))) > 0
          and char_length(btrim(coalesce(maya_account_number, ''))) > 0
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_payment_submitted_method_chk'
  ) then
    alter table public.bookings
      add constraint bookings_payment_submitted_method_chk
      check (
        payment_submitted_method is null
        or payment_submitted_method in ('gcash', 'maya')
      );
  end if;
end
$$;

