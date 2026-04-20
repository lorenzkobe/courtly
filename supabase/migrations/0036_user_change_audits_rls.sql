-- Restrict user_change_audits to superadmin reads/writes (table had no RLS before).

alter table public.user_change_audits enable row level security;

create policy "user_change_audits select superadmin"
  on public.user_change_audits
  for select
  to authenticated
  using (public.is_superadmin());

create policy "user_change_audits insert superadmin"
  on public.user_change_audits
  for insert
  to authenticated
  with check (public.is_superadmin());
