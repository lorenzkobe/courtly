-- Migration template for new tables in `public` schema.
-- Copy this file to `supabase/migrations/<NNNN>_<short_name>.sql` and fill in.
-- Do NOT run this template file directly.
--
-- Why this template exists: starting May 30, 2026 (new projects) and October 30, 2026
-- (existing projects, including ours), Supabase no longer auto-grants table access to
-- the `anon`, `authenticated`, and `service_role` roles on tables created in `public`.
-- Without the GRANT block below, the Data API (supabase-js / PostgREST / GraphQL)
-- returns a 42501 error on every read or write of the new table.
--
-- Required for every new public table:
--   1. `create table public.<name> (...)`
--   2. GRANT block (this template)
--   3. `alter table public.<name> enable row level security`
--   4. At least one policy per role/operation the app uses
--
-- Existing tables created before Oct 30, 2026 retain their grants — do NOT backfill
-- grants for those unless Security Advisor flags them.

------------------------------------------------------------------------------
-- 1. Schema
------------------------------------------------------------------------------

create table public.your_table (
  id          uuid primary key default gen_random_uuid(),
  -- foreign keys typically reference public.profiles(id) or public.venues(id)
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- domain columns here
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Indexes for predicates the app filters by frequently.
create index if not exists your_table_user_id_idx on public.your_table (user_id);

------------------------------------------------------------------------------
-- 2. Grants (required for Data API access — see header)
------------------------------------------------------------------------------

-- `anon` = unauthenticated browser requests (public read endpoints).
-- Drop this grant entirely if the table is never read while logged out.
grant select
  on public.your_table
  to anon;

-- `authenticated` = logged-in users; RLS policies decide which rows they see.
grant select, insert, update, delete
  on public.your_table
  to authenticated;

-- `service_role` = server-side admin client (`createSupabaseAdminClient`), bypasses RLS.
grant select, insert, update, delete
  on public.your_table
  to service_role;

------------------------------------------------------------------------------
-- 3. Row-level security
------------------------------------------------------------------------------

alter table public.your_table enable row level security;

-- Pattern: explicit `to authenticated` (or `to anon`) on every policy.
-- Use `public.is_superadmin()` for superadmin gates (defined in migration 0004).

create policy "your_table read own or superadmin"
  on public.your_table
  for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

create policy "your_table insert own"
  on public.your_table
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "your_table update own or superadmin"
  on public.your_table
  for update to authenticated
  using (user_id = auth.uid() or public.is_superadmin())
  with check (user_id = auth.uid() or public.is_superadmin());

create policy "your_table delete own or superadmin"
  on public.your_table
  for delete to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

------------------------------------------------------------------------------
-- 4. Optional: `updated_at` trigger
------------------------------------------------------------------------------

create or replace function public.your_table_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists your_table_set_updated_at on public.your_table;
create trigger your_table_set_updated_at
before update on public.your_table
for each row execute function public.your_table_set_updated_at();
