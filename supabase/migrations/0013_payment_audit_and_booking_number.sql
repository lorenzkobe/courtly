alter table public.bookings
  add column if not exists booking_number text;

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  booking_group_id uuid,
  payment_link_id text,
  provider_event_id text,
  event_type text,
  provider_payment_id text,
  provider_payment_intent_id text,
  provider_balance_transaction_id text,
  provider_external_reference_number text,
  amount integer,
  currency text,
  fee integer,
  net_amount integer,
  source_id text,
  source_type text,
  source_brand text,
  source_last4 text,
  source_country text,
  source_provider_id text,
  refund_id text,
  refund_status text,
  refund_amount integer,
  refund_reason text,
  refund_notes text,
  trace_status text not null,
  reconciled_by text not null,
  trace_note text,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  paid_at timestamptz,
  refund_attempted_at timestamptz,
  refund_created_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  constraint payment_transactions_trace_status_nonempty check (trace_status <> ''),
  constraint payment_transactions_reconciled_by_check check (reconciled_by in ('webhook', 'manual_reconcile'))
);

create unique index if not exists payment_transactions_provider_event_uidx
  on public.payment_transactions (provider, provider_event_id)
  where provider_event_id is not null;

create unique index if not exists payment_transactions_provider_refund_uidx
  on public.payment_transactions (provider, refund_id)
  where refund_id is not null;

create index if not exists payment_transactions_booking_created_idx
  on public.payment_transactions (booking_id, created_at desc);

create index if not exists payment_transactions_group_created_idx
  on public.payment_transactions (booking_group_id, created_at desc)
  where booking_group_id is not null;

create index if not exists payment_transactions_provider_payment_idx
  on public.payment_transactions (provider, provider_payment_id)
  where provider_payment_id is not null;

create index if not exists payment_transactions_provider_link_idx
  on public.payment_transactions (provider, payment_link_id)
  where payment_link_id is not null;

create index if not exists payment_transactions_trace_status_created_idx
  on public.payment_transactions (trace_status, created_at desc);

create index if not exists payment_transactions_unresolved_idx
  on public.payment_transactions (created_at desc)
  where trace_status in ('pending', 'failed', 'refund_required', 'refund_attempted');

create index if not exists bookings_booking_number_idx
  on public.bookings (booking_number);

do $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  group_row record;
  suffix text;
  booking_date text;
  attempts int;
  i int;
  random_byte int;
begin
  for group_row in
    select
      coalesce(booking_group_id::text, id::text) as group_key,
      min(date) as min_date,
      min(created_at) as first_created_at,
      min(id::text) as first_id_text,
      array_agg(id) as booking_ids
    from public.bookings
    where booking_number is null
    group by 1
    order by first_created_at, first_id_text
  loop
    suffix := '';
    for i in 1..6 loop
      random_byte := get_byte(gen_random_bytes(1), 0);
      suffix := suffix || substr(alphabet, (random_byte % length(alphabet)) + 1, 1);
    end loop;
    booking_date := to_char(coalesce(group_row.min_date, current_date)::date, 'YYMMDD');
    attempts := 0;

    while exists (
      select 1
      from public.bookings b
      where b.booking_number = ('CTLY-' || booking_date || '-' || suffix)
    ) loop
      attempts := attempts + 1;
      if attempts > 100 then
        raise exception 'failed to generate unique booking_number during backfill';
      end if;
      suffix := '';
      for i in 1..6 loop
        random_byte := get_byte(gen_random_bytes(1), 0);
        suffix := suffix || substr(alphabet, (random_byte % length(alphabet)) + 1, 1);
      end loop;
    end loop;

    update public.bookings
    set booking_number = ('CTLY-' || booking_date || '-' || suffix)
    where id = any(group_row.booking_ids);
  end loop;
end
$$;

alter table public.bookings
  alter column booking_number set not null;
