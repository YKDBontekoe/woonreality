create or replace function public.property_stage_from_case_stage(p_stage text)
returns text
language sql
immutable
as $$
  select case p_stage
    when 'intake' then 'saved'
    when 'research' then 'research'
    when 'viewing' then 'viewing'
    when 'offer' then 'offer'
    when 'negotiation' then 'negotiation'
    when 'contract' then 'accepted'
    when 'finance_inspection' then 'accepted'
    when 'transfer' then 'bought'
    else 'saved'
  end;
$$;

create or replace function public.normalize_case_stage_input(p_stage text)
returns text
language sql
immutable
as $$
  select case p_stage
    when 'profile' then 'intake'
    when 'shortlist' then 'research'
    when 'documents' then 'research'
    else p_stage
  end;
$$;

create or replace function public.sync_saved_property_stage(p_user_id uuid, p_property_id uuid, p_case_stage text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bag varchar(16);
begin
  if p_property_id is null then return; end if;
  select bag_vbo_id into v_bag from public.properties where id = p_property_id;
  if v_bag is null then return; end if;
  update public.saved_properties
  set stage = public.property_stage_from_case_stage(p_case_stage), updated_at = now()
  where user_id = p_user_id and bag_vbo_id = v_bag;
end;
$$;

create or replace function public.apply_case_stage(
  p_case_id uuid,
  p_stage text default null,
  p_title text default null,
  p_status text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_from text;
  v_case public.purchase_cases%rowtype;
  v_stage text;
  v_title text;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_case from public.purchase_cases where id = p_case_id and user_id = v_user for update;
  if not found then raise exception 'case_not_found' using errcode = 'P0002'; end if;

  v_from := v_case.stage;
  v_stage := v_case.stage;
  if p_stage is not null and length(trim(p_stage)) > 0 then
    v_stage := public.normalize_case_stage_input(p_stage);
    if v_stage not in ('intake', 'research', 'viewing', 'offer', 'negotiation', 'contract', 'finance_inspection', 'transfer') then
      raise exception 'invalid_stage' using errcode = '22023';
    end if;
  end if;

  v_title := coalesce(nullif(trim(coalesce(p_title, '')), ''), v_case.title);

  update public.purchase_cases
  set title = v_title,
      stage = v_stage,
      status = coalesce(nullif(p_status, ''), v_case.status),
      updated_at = now()
  where id = p_case_id and user_id = v_user
  returning * into v_case;

  if v_stage is distinct from v_from then
    insert into public.case_events (case_id, user_id, event_type, payload)
    values (p_case_id, v_user, 'stage_changed', jsonb_build_object('from', v_from, 'to', v_stage));
    perform public.sync_saved_property_stage(v_user, v_case.property_id, v_stage);
  end if;

  return row_to_json(v_case)::jsonb;
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
  v_stage text;
  v_conditions jsonb;
  v_transfer date;
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
    values (p_case_id, v_user, v_version, null, v_asking, null,
      jsonb_build_object('type', 'asking-price-only', 'askingPrice', v_asking, 'note', 'Geen taxatie. De vraagprijs is wat de verkoper vraagt, niet de marktwaarde.'));
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
    if p_payload ? 'scenario' then v_conditions := v_conditions || jsonb_build_object('scenario', p_payload->>'scenario'); end if;
    if p_payload ? 'reasons' then v_conditions := v_conditions || jsonb_build_object('reasons', p_payload->'reasons'); end if;
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
    v_stage := public.normalize_case_stage_input(p_payload->>'stage');
    if v_stage is null or v_stage not in ('intake', 'research', 'viewing', 'offer', 'negotiation', 'contract', 'finance_inspection', 'transfer') then raise exception 'invalid_stage' using errcode = '22023'; end if;
    update public.purchase_cases set stage = v_stage, updated_at = now() where id = p_case_id and user_id = v_user;
    insert into public.case_events (case_id, user_id, event_type, payload) values (p_case_id, v_user, 'stage_changed', jsonb_build_object('from', v_case.stage, 'to', v_stage));
    perform public.sync_saved_property_stage(v_user, v_case.property_id, v_stage);
  end if;
  return jsonb_build_object('saved', true, 'stage', coalesce(v_stage, v_case.stage));
end;
$$;

grant execute on function public.property_stage_from_case_stage(text) to authenticated;
grant execute on function public.normalize_case_stage_input(text) to authenticated;
grant execute on function public.sync_saved_property_stage(uuid, uuid, text) to authenticated;
grant execute on function public.apply_case_stage(uuid, text, text, text) to authenticated;
grant execute on function public.apply_case_workflow(uuid, jsonb) to authenticated;
