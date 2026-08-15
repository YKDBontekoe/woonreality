do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'property_bid_drafts_asking_price_non_negative') then
    alter table public.property_bid_drafts add constraint property_bid_drafts_asking_price_non_negative check (asking_price is null or asking_price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'property_bid_drafts_selected_scenario_valid') then
    alter table public.property_bid_drafts add constraint property_bid_drafts_selected_scenario_valid check (selected_scenario in ('cautious', 'balanced', 'strong'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'case_finance_financing_amount_non_negative') then
    alter table public.case_finance add constraint case_finance_financing_amount_non_negative check (financing_amount is null or financing_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'valuation_snapshots_values_non_negative') then
    alter table public.valuation_snapshots add constraint valuation_snapshots_values_non_negative check (
      (low_value is null or low_value >= 0) and
      (midpoint_value is null or midpoint_value >= 0) and
      (high_value is null or high_value >= 0)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bid_drafts_amount_non_negative') then
    alter table public.bid_drafts add constraint bid_drafts_amount_non_negative check (amount is null or amount >= 0);
  end if;
end $$;

alter table public.bid_drafts alter column amount drop not null;

create or replace function public.merge_profile_preferences(
  p_preferences jsonb default null,
  p_buyer_profile jsonb default null,
  p_compare_ids jsonb default null
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

create or replace function public.apply_case_workflow(p_case_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_case public.purchase_cases%rowtype;
  v_latest_bid public.bid_drafts%rowtype;
  v_finance public.case_finance%rowtype;
  v_version integer;
  v_asking numeric;
  v_offer numeric;
  v_financing numeric;
  v_contract numeric;
  v_transfer date;
  v_conditions jsonb;
  v_stage text;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_case from public.purchase_cases where id = p_case_id and user_id = v_user for update;
  if not found then raise exception 'case_not_found' using errcode = 'P0002'; end if;
  if p_payload ? 'contractAmount' and p_payload->'contractAmount' <> 'null'::jsonb and jsonb_typeof(p_payload->'contractAmount') <> 'number' then raise exception 'invalid_contract_amount' using errcode = '22023'; end if;
  if p_payload ? 'contractAmount' and p_payload->'contractAmount' <> 'null'::jsonb and (p_payload->>'contractAmount')::numeric < 0 then raise exception 'invalid_contract_amount' using errcode = '22023'; end if;
  if p_payload ? 'financingCondition' and jsonb_typeof(p_payload->'financingCondition') <> 'boolean' then raise exception 'invalid_financing_condition' using errcode = '22023'; end if;
  if p_payload ? 'inspectionCondition' and jsonb_typeof(p_payload->'inspectionCondition') <> 'boolean' then raise exception 'invalid_inspection_condition' using errcode = '22023'; end if;

  if p_payload ? 'askingPrice' then
    if p_payload->'askingPrice' <> 'null'::jsonb and jsonb_typeof(p_payload->'askingPrice') <> 'number' then raise exception 'invalid_asking_price' using errcode = '22023'; end if;
    v_asking := nullif(p_payload->>'askingPrice', '')::numeric;
    if v_asking is not null and v_asking < 0 then raise exception 'invalid_asking_price' using errcode = '22023'; end if;
    select coalesce(max(version), 0) + 1 into v_version from public.valuation_snapshots where case_id = p_case_id;
    insert into public.valuation_snapshots (case_id, user_id, version, low_value, midpoint_value, high_value, methodology)
    values (p_case_id, v_user, v_version,
      case when v_asking is null then null else round(v_asking * .985 / 500) * 500 end,
      v_asking,
      case when v_asking is null then null else round(v_asking * 1.015 / 500) * 500 end,
      jsonb_build_object('type', 'asking-price-screening', 'askingPrice', v_asking, 'note', 'Indicatieve rekenschets; geen taxatie.'));
  end if;

  if p_payload ? 'offerAmount' then
    if p_payload->'offerAmount' <> 'null'::jsonb and jsonb_typeof(p_payload->'offerAmount') <> 'number' then raise exception 'invalid_offer_amount' using errcode = '22023'; end if;
    v_offer := nullif(p_payload->>'offerAmount', '')::numeric;
    if v_offer is not null and v_offer < 0 then raise exception 'invalid_offer_amount' using errcode = '22023'; end if;
    select * into v_latest_bid from public.bid_drafts where case_id = p_case_id order by version desc limit 1;
    select coalesce(max(version), 0) + 1 into v_version from public.bid_drafts where case_id = p_case_id;
    v_transfer := case when p_payload ? 'transferDate' then nullif(p_payload->>'transferDate', '')::date else v_latest_bid.transfer_date end;
    v_conditions := coalesce(v_latest_bid.conditions, '{}'::jsonb);
    if p_payload ? 'contractAmount' then v_conditions := v_conditions || jsonb_build_object('contractAmount', nullif(p_payload->>'contractAmount', '')::numeric); end if;
    if p_payload ? 'financingCondition' then v_conditions := v_conditions || jsonb_build_object('financingCondition', (p_payload->>'financingCondition')::boolean); end if;
    if p_payload ? 'inspectionCondition' then v_conditions := v_conditions || jsonb_build_object('inspectionCondition', (p_payload->>'inspectionCondition')::boolean); end if;
    insert into public.bid_drafts (case_id, user_id, version, amount, transfer_date, conditions, body, status)
    values (p_case_id, v_user, v_version, v_offer, v_transfer, v_conditions,
      format('Bodconcept %s', coalesce(to_char(v_offer, 'FM9999999990'), 'gewist')), 'draft');
  end if;

  if p_payload ? 'financingAmount' or p_payload ? 'transferDate' or p_payload ? 'offerAmount' or p_payload ? 'financingCondition' then
    select * into v_finance from public.case_finance where case_id = p_case_id for update;
    if p_payload ? 'financingAmount' then
      if p_payload->'financingAmount' <> 'null'::jsonb and jsonb_typeof(p_payload->'financingAmount') <> 'number' then raise exception 'invalid_financing_amount' using errcode = '22023'; end if;
      v_financing := nullif(p_payload->>'financingAmount', '')::numeric;
      if v_financing is not null and v_financing < 0 then raise exception 'invalid_financing_amount' using errcode = '22023'; end if;
    else v_financing := v_finance.financing_amount; end if;
    insert into public.case_finance (case_id, user_id, maximum_price, financing_amount, financing_status, transfer_preference, updated_at)
    values (p_case_id, v_user,
      case when p_payload ? 'offerAmount' then v_offer else v_finance.maximum_price end,
      v_financing,
      case when p_payload ? 'financingCondition' then case when (p_payload->>'financingCondition')::boolean then 'required' else 'without-condition' end else coalesce(v_finance.financing_status, 'unknown') end,
      case when p_payload ? 'transferDate' then nullif(p_payload->>'transferDate', '')::date else v_finance.transfer_preference end,
      now())
    on conflict (case_id) do update set maximum_price = excluded.maximum_price, financing_amount = excluded.financing_amount, financing_status = excluded.financing_status, transfer_preference = excluded.transfer_preference, updated_at = now();
  end if;

  if p_payload ? 'stage' then
    v_stage := p_payload->>'stage';
    if v_stage is null or v_stage not in ('profile', 'shortlist', 'documents', 'viewing', 'offer', 'contract', 'transfer') then raise exception 'invalid_stage' using errcode = '22023'; end if;
    update public.purchase_cases set stage = v_stage, updated_at = now() where id = p_case_id and user_id = v_user;
    insert into public.case_events (case_id, user_id, event_type, payload) values (p_case_id, v_user, 'stage_changed', jsonb_build_object('from', v_case.stage, 'to', v_stage));
  end if;
  return jsonb_build_object('saved', true);
end;
$$;

grant execute on function public.merge_profile_preferences(jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.apply_case_workflow(uuid, jsonb) to authenticated;
