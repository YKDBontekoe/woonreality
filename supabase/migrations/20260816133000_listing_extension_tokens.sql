create table if not exists public.listing_extension_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  label text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint listing_extension_tokens_hash_sha256 check (token_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists listing_extension_tokens_user_id_idx
  on public.listing_extension_tokens (user_id)
  where revoked_at is null;

create table if not exists public.listing_extension_ingest_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists listing_extension_ingest_log_user_created_idx
  on public.listing_extension_ingest_log (user_id, created_at desc);

alter table public.listing_extension_tokens enable row level security;
alter table public.listing_extension_ingest_log enable row level security;

grant select, insert, update, delete on public.listing_extension_tokens to authenticated;
grant select on public.listing_extension_ingest_log to authenticated;

drop policy if exists "users own extension tokens" on public.listing_extension_tokens;
create policy "users own extension tokens"
  on public.listing_extension_tokens
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users read own ingest log" on public.listing_extension_ingest_log;
create policy "users read own ingest log"
  on public.listing_extension_ingest_log
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
