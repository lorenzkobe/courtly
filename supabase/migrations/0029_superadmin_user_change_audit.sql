create table if not exists public.user_change_audits (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  changed_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_change_audits_target_idx
  on public.user_change_audits(target_user_id, created_at desc);
