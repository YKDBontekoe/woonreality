alter table public.ai_reports
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.ai_reports
  drop constraint if exists ai_reports_property_id_report_version_key;

create unique index if not exists ai_reports_global_unique
  on public.ai_reports (property_id, report_version)
  where user_id is null;

create unique index if not exists ai_reports_user_unique
  on public.ai_reports (property_id, report_version, user_id)
  where user_id is not null;

create index if not exists ai_reports_user_id_idx
  on public.ai_reports (user_id);
