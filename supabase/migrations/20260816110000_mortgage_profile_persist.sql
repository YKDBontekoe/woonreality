-- Persist full mortgage calculator state on the buyer profile (preferences_json.mortgageState).
create or replace function public.merge_profile_preferences(
  p_preferences jsonb default null,
  p_buyer_profile jsonb default null,
  p_compare_ids jsonb default null,
  p_mortgage jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_patch jsonb := '{}'::jsonb;
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_preferences is not null then v_patch := v_patch || jsonb_build_object('personalPreferences', p_preferences); end if;
  if p_buyer_profile is not null then v_patch := v_patch || jsonb_build_object('buyerProfile', p_buyer_profile); end if;
  if p_mortgage is not null then v_patch := v_patch || jsonb_build_object('mortgageState', p_mortgage); end if;
  insert into public.profiles (id, preferences_json, compare_ids, updated_at)
  values (auth.uid(), v_patch, coalesce(p_compare_ids, '[]'::jsonb), now())
  on conflict (id) do update set
    preferences_json = coalesce(public.profiles.preferences_json, '{}'::jsonb) || excluded.preferences_json,
    compare_ids = case when p_compare_ids is null then public.profiles.compare_ids else p_compare_ids end,
    updated_at = now()
  returning * into v_profile;
  if pg_column_size(v_profile.preferences_json) > 16000 then
    raise exception 'preferences_payload_too_large' using errcode = '22023';
  end if;
  return jsonb_build_object('saved', true);
end;
$$;

grant execute on function public.merge_profile_preferences(jsonb, jsonb, jsonb, jsonb) to authenticated;
