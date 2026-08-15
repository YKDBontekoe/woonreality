alter table public.profiles
  add column if not exists compare_ids jsonb not null default '[]'::jsonb;

alter table public.case_finance
  add column if not exists financing_amount numeric;

create table if not exists public.saved_properties (
  user_id uuid not null references auth.users(id) on delete cascade,
  bag_vbo_id varchar(32) not null,
  address_label text not null,
  postcode varchar(12) not null,
  city text not null,
  stage varchar(24) not null default 'saved',
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, bag_vbo_id)
);

create table if not exists public.property_checklists (
  user_id uuid not null references auth.users(id) on delete cascade,
  bag_vbo_id varchar(32) not null,
  items_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, bag_vbo_id)
);

create table if not exists public.property_bid_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bag_vbo_id varchar(32) not null,
  asking_price numeric check (asking_price is null or asking_price >= 0),
  selected_scenario varchar(16) not null default 'balanced' check (selected_scenario in ('cautious', 'balanced', 'strong')),
  updated_at timestamptz not null default now(),
  unique (user_id, bag_vbo_id)
);

create index if not exists saved_properties_user_updated_idx on public.saved_properties(user_id, updated_at desc);
create index if not exists property_checklists_user_idx on public.property_checklists(user_id);
create index if not exists property_bid_drafts_user_idx on public.property_bid_drafts(user_id);

alter table public.saved_properties enable row level security;
alter table public.property_checklists enable row level security;
alter table public.property_bid_drafts enable row level security;

grant select, insert, update, delete on public.saved_properties, public.property_checklists, public.property_bid_drafts to authenticated;

create policy "users own saved properties" on public.saved_properties for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users own property checklists" on public.property_checklists for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users own property bid drafts" on public.property_bid_drafts for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
