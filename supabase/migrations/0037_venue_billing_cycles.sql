create table if not exists public.venue_billing_cycles (
  id                       uuid primary key default gen_random_uuid(),
  venue_id                 uuid not null references public.venues(id) on delete cascade,
  period_start             date not null,
  period_end               date not null,
  booking_count            integer not null default 0,
  total_booking_fees       numeric not null default 0,
  status                   text not null default 'unsettled',
  payment_method           text,
  payment_proof_url        text,
  payment_proof_mime_type  text,
  payment_proof_bytes      integer,
  payment_proof_width      integer,
  payment_proof_height     integer,
  payment_submitted_at     timestamptz,
  marked_paid_at           timestamptz,
  marked_paid_by_user_id   uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint venue_billing_cycles_status_check check (status in ('unsettled', 'paid'))
);

create unique index if not exists venue_billing_cycles_venue_period_idx
  on public.venue_billing_cycles(venue_id, period_start);
create index if not exists venue_billing_cycles_venue_status_idx
  on public.venue_billing_cycles(venue_id, status, period_start asc);
create index if not exists venue_billing_cycles_status_period_idx
  on public.venue_billing_cycles(status, period_start desc);

create or replace function public.venue_billing_cycles_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists venue_billing_cycles_set_updated_at on public.venue_billing_cycles;
create trigger venue_billing_cycles_set_updated_at
before update on public.venue_billing_cycles
for each row execute function public.venue_billing_cycles_set_updated_at();

alter table public.venue_billing_cycles enable row level security;

create policy "billing cycles superadmin all" on public.venue_billing_cycles
for all to authenticated
using (public.is_superadmin()) with check (public.is_superadmin());

create policy "billing cycles venue admin select" on public.venue_billing_cycles
for select to authenticated
using (public.is_venue_admin_for_venue(venue_id));

create policy "billing cycles venue admin update proof" on public.venue_billing_cycles
for update to authenticated
using (public.is_venue_admin_for_venue(venue_id))
with check (public.is_venue_admin_for_venue(venue_id) and status = 'unsettled');
