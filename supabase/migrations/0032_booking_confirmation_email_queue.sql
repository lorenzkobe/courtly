create table if not exists public.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'queued',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists outbound_emails_status_idx
  on public.outbound_emails(status, created_at);
