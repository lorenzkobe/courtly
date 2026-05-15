-- Admin Terms & Conditions: versioned content authored by superadmin plus
-- per-admin accept/reject tracking. Admins are gated on each published version.

------------------------------------------------------------------------------
-- 1. Schema
------------------------------------------------------------------------------

create table public.terms_versions (
  id            uuid primary key default gen_random_uuid(),
  version       int  not null,
  content_html  text not null default '',
  is_published  boolean not null default false,
  published_at  timestamptz,
  published_by  uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index terms_versions_version_uq
  on public.terms_versions (version);

-- Exactly one draft row at a time so upserts have a single deterministic target.
create unique index terms_versions_single_draft_uq
  on public.terms_versions ((1)) where is_published = false;

create index terms_versions_published_idx
  on public.terms_versions (is_published, version desc);

create table public.terms_acceptances (
  id                uuid primary key default gen_random_uuid(),
  terms_version_id  uuid not null references public.terms_versions(id) on delete cascade,
  admin_user_id     uuid not null references public.profiles(id) on delete cascade,
  status            text not null check (status in ('accepted', 'rejected')),
  responded_at      timestamptz not null default now(),
  unique (terms_version_id, admin_user_id)
);

create index terms_acceptances_admin_idx
  on public.terms_acceptances (admin_user_id);

------------------------------------------------------------------------------
-- 2. Grants (required for Data API access on tables created after 2026-10-30)
------------------------------------------------------------------------------

grant select, insert, update, delete
  on public.terms_versions
  to authenticated;
grant select, insert, update, delete
  on public.terms_versions
  to service_role;

grant select, insert, update, delete
  on public.terms_acceptances
  to authenticated;
grant select, insert, update, delete
  on public.terms_acceptances
  to service_role;

------------------------------------------------------------------------------
-- 3. Row-level security
------------------------------------------------------------------------------

alter table public.terms_versions enable row level security;

create policy "terms_versions read published or superadmin"
  on public.terms_versions
  for select to authenticated
  using (is_published = true or public.is_superadmin());

create policy "terms_versions write superadmin"
  on public.terms_versions
  for insert to authenticated
  with check (public.is_superadmin());

create policy "terms_versions update superadmin"
  on public.terms_versions
  for update to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy "terms_versions delete superadmin"
  on public.terms_versions
  for delete to authenticated
  using (public.is_superadmin());

alter table public.terms_acceptances enable row level security;

create policy "terms_acceptances read own or superadmin"
  on public.terms_acceptances
  for select to authenticated
  using (admin_user_id = auth.uid() or public.is_superadmin());

create policy "terms_acceptances insert own"
  on public.terms_acceptances
  for insert to authenticated
  with check (admin_user_id = auth.uid());

create policy "terms_acceptances delete superadmin"
  on public.terms_acceptances
  for delete to authenticated
  using (public.is_superadmin());

------------------------------------------------------------------------------
-- 4. updated_at trigger on terms_versions
------------------------------------------------------------------------------

create or replace function public.terms_versions_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists terms_versions_set_updated_at on public.terms_versions;
create trigger terms_versions_set_updated_at
before update on public.terms_versions
for each row execute function public.terms_versions_set_updated_at();

------------------------------------------------------------------------------
-- 5. Realtime: admin clients subscribe to inserts to flip the gate on publish
------------------------------------------------------------------------------

alter publication supabase_realtime add table public.terms_versions;

------------------------------------------------------------------------------
-- 6. Seed: a single empty draft row so upsertDraftTerms always targets it
------------------------------------------------------------------------------

insert into public.terms_versions (version, content_html, is_published)
values (0, '', false);
