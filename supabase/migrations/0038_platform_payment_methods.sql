create table if not exists public.platform_payment_methods (
  id             uuid primary key default gen_random_uuid(),
  method         text not null,
  account_name   text not null,
  account_number text not null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint platform_payment_methods_method_check check (method in ('gcash', 'maya'))
);

create or replace function public.platform_payment_methods_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists platform_payment_methods_set_updated_at on public.platform_payment_methods;
create trigger platform_payment_methods_set_updated_at
before update on public.platform_payment_methods
for each row execute function public.platform_payment_methods_set_updated_at();

alter table public.platform_payment_methods enable row level security;

create policy "platform payment methods superadmin all" on public.platform_payment_methods
for all to authenticated
using (public.is_superadmin()) with check (public.is_superadmin());

create policy "platform payment methods authenticated read active" on public.platform_payment_methods
for select to authenticated
using (is_active = true);
