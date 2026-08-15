create extension if not exists pgcrypto;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  bag_vbo_id varchar(32) not null unique,
  address_label text not null,
  postcode varchar(12) not null,
  house_number text not null,
  house_number_addition text,
  city text not null,
  lat real not null,
  lng real not null,
  rd_x real,
  rd_y real,
  area_m2 real,
  build_year real,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.property_buildings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  bag_pand_id varchar(32) not null,
  is_primary text not null default 'true'
);

create table public.source_cache (
  id uuid primary key default gen_random_uuid(),
  source varchar(120) not null,
  cache_key text not null,
  payload_json jsonb not null,
  etag text,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz,
  schema_version varchar(32) not null default '1',
  unique (source, cache_key)
);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  source varchar(120) not null,
  source_record_id text,
  source_url text not null,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  spatial_resolution text,
  confidence varchar(16) not null,
  caveat text,
  raw_json jsonb
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  analysis_version varchar(32) not null,
  scoring_version varchar(32) not null,
  overall_score real not null,
  components_json jsonb not null,
  created_at timestamptz not null default now()
);

create table public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  report_version varchar(32) not null,
  prompt_version varchar(32) not null,
  input_fingerprint varchar(128) not null,
  status varchar(24) not null,
  report_json jsonb,
  source_manifest_json jsonb,
  research_model varchar(80),
  synthesis_model varchar(80),
  usage_json jsonb,
  error_code text,
  generated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, report_version)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferences_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  title text not null,
  stage varchar(32) not null default 'profile',
  status varchar(20) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.case_tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.purchase_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  status varchar(20) not null default 'open',
  due_at timestamptz,
  priority varchar(12) not null default 'normal',
  source varchar(80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.purchase_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  filename text not null,
  mime_type text not null,
  byte_size integer not null,
  document_type varchar(40) not null default 'other',
  status varchar(20) not null default 'uploaded',
  extracted_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_findings (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.case_documents(id) on delete cascade,
  case_id uuid not null references public.purchase_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  summary text not null,
  severity varchar(12) not null default 'neutral',
  page_number integer,
  action text,
  status varchar(20) not null default 'open',
  created_at timestamptz not null default now()
);

create table public.case_finance (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.purchase_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  maximum_price numeric,
  own_funds numeric,
  financing_status varchar(24) not null default 'unknown',
  transfer_preference date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comparable_sales (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.purchase_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  address_label text not null,
  sale_price numeric not null,
  sale_date date,
  area_m2 real,
  distance_m real,
  source text not null,
  source_url text,
  created_at timestamptz not null default now()
);

create table public.valuation_snapshots (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.purchase_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  low_value numeric,
  midpoint_value numeric,
  high_value numeric,
  methodology jsonb not null,
  created_at timestamptz not null default now(),
  unique (case_id, version)
);

create table public.bid_drafts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.purchase_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  amount numeric not null,
  transfer_date date,
  conditions jsonb not null default '{}'::jsonb,
  body text not null,
  status varchar(24) not null default 'draft',
  created_at timestamptz not null default now(),
  unique (case_id, version)
);

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  deadline_reminders boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.purchase_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type varchar(40) not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index case_tasks_user_due_idx on public.case_tasks(user_id, due_at);
create index case_documents_case_idx on public.case_documents(case_id);
create index document_findings_case_idx on public.document_findings(case_id);
create index comparable_sales_case_idx on public.comparable_sales(case_id);

alter table public.properties enable row level security;
alter table public.property_buildings enable row level security;
alter table public.source_cache enable row level security;
alter table public.evidence enable row level security;
alter table public.analyses enable row level security;
alter table public.ai_reports enable row level security;

alter table public.profiles enable row level security;
alter table public.purchase_cases enable row level security;
alter table public.case_tasks enable row level security;
alter table public.case_documents enable row level security;
alter table public.document_findings enable row level security;
alter table public.case_finance enable row level security;
alter table public.comparable_sales enable row level security;
alter table public.valuation_snapshots enable row level security;
alter table public.bid_drafts enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.case_events enable row level security;

grant select, insert, update, delete on public.profiles, public.purchase_cases, public.case_tasks, public.case_documents, public.document_findings, public.case_finance, public.comparable_sales, public.valuation_snapshots, public.bid_drafts, public.notification_preferences, public.case_events to authenticated;

create policy "profiles are private" on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "users own purchase cases" on public.purchase_cases for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users own case tasks" on public.case_tasks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.purchase_cases c where c.id = case_id and c.user_id = (select auth.uid())));
create policy "users own documents" on public.case_documents for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.purchase_cases c where c.id = case_id and c.user_id = (select auth.uid())));
create policy "users own findings" on public.document_findings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.purchase_cases c where c.id = case_id and c.user_id = (select auth.uid())));
create policy "users own finance" on public.case_finance for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.purchase_cases c where c.id = case_id and c.user_id = (select auth.uid())));
create policy "users own comparables" on public.comparable_sales for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.purchase_cases c where c.id = case_id and c.user_id = (select auth.uid())));
create policy "users own valuations" on public.valuation_snapshots for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.purchase_cases c where c.id = case_id and c.user_id = (select auth.uid())));
create policy "users own bids" on public.bid_drafts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.purchase_cases c where c.id = case_id and c.user_id = (select auth.uid())));
create policy "users own notifications" on public.notification_preferences for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users own events" on public.case_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.purchase_cases c where c.id = case_id and c.user_id = (select auth.uid())));

insert into storage.buckets (id, name, public) values ('purchase-documents', 'purchase-documents', false) on conflict (id) do nothing;
create policy "users upload own purchase documents" on storage.objects for insert to authenticated with check (bucket_id = 'purchase-documents' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "users read own purchase documents" on storage.objects for select to authenticated using (bucket_id = 'purchase-documents' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "users update own purchase documents" on storage.objects for update to authenticated using (bucket_id = 'purchase-documents' and (storage.foldername(name))[1] = (select auth.uid()::text)) with check (bucket_id = 'purchase-documents' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "users delete own purchase documents" on storage.objects for delete to authenticated using (bucket_id = 'purchase-documents' and (storage.foldername(name))[1] = (select auth.uid()::text));
