-- Extends terms_versions with optional targeting: a published version may apply
-- to all admins (target_admin_ids IS NULL) or only to a specific list. An
-- admin's "applicable" version is the highest-version published row whose
-- target list either is NULL or contains their id.

alter table public.terms_versions
  add column target_admin_ids uuid[];

alter table public.terms_versions
  add constraint terms_versions_target_admin_ids_nonempty
  check (target_admin_ids is null or array_length(target_admin_ids, 1) > 0);

-- Speeds the per-admin applicable-version lookup (`$1 = ANY(target_admin_ids)`).
create index terms_versions_target_admin_ids_gin_idx
  on public.terms_versions using gin (target_admin_ids);
