-- Persist the receipt date of the signed koopovereenkomst separately from the
-- signing date: bedenktijd (Art. 7:2 BW) starts on receipt, while ontbindende
-- voorwaarden termijnen run from the signing date.
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
  v_touches_bid boolean;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_case from public.purchase_cases where id = p_case_id and user_id = v_user for update;
  if not found then raise exception 'case_not_found' using errcode = 'P0002'; end if;
  if p_payload ? 'contractAmount' and p_payload->'contractAmount' <> 'null'::jsonb and jsonb_typeof(p_payload->'contractAmount') <> 'number' then raise exception 'invalid_contract_amount' using errcode = '22023'; end if;
  if p_payload ? 'contractAmount' and p_payload->'contractAmount' <> 'null'::jsonb and (p_payload->>'contractAmount')::numeric < 0 then raise exception 'invalid_contract_amount' using errcode = '22023'; end if;
  if p_payload ? 'financingCondition' and jsonb_typeof(p_payload->'financingCondition') <> 'boolean' then raise exception 'invalid_financing_condition' using errcode = '22023'; end if;
  if p_payload ? 'inspectionCondition' and jsonb_typeof(p_payload->'inspectionCondition') <> 'boolean' then raise exception 'invalid_inspection_condition' using errcode = '22023'; end if;
  if p_payload ? 'contractSignedAt' and p_payload->'contractSignedAt' <> 'null'::jsonb then
    if jsonb_typeof(p_payload->'contractSignedAt') <> 'string' then raise exception 'invalid_contract_signed_at' using errcode = '22023'; end if;
    if coalesce(p_payload->>'contractSignedAt', '') <> '' then
      if p_payload->>'contractSignedAt' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_contract_signed_at' using errcode = '22023'; end if;
      begin
        if to_char((p_payload->>'contractSignedAt')::date, 'YYYY-MM-DD') <> p_payload->>'contractSignedAt' then
          raise exception 'invalid_contract_signed_at' using errcode = '22023';
        end if;
      exception when others then
        raise exception 'invalid_contract_signed_at' using errcode = '22023';
      end;
    end if;
  end if;
  if p_payload ? 'contractReceivedAt' and p_payload->'contractReceivedAt' <> 'null'::jsonb then
    if jsonb_typeof(p_payload->'contractReceivedAt') <> 'string' then raise exception 'invalid_contract_received_at' using errcode = '22023'; end if;
    if coalesce(p_payload->>'contractReceivedAt', '') <> '' then
      if p_payload->>'contractReceivedAt' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_contract_received_at' using errcode = '22023'; end if;
      begin
        if to_char((p_payload->>'contractReceivedAt')::date, 'YYYY-MM-DD') <> p_payload->>'contractReceivedAt' then
          raise exception 'invalid_contract_received_at' using errcode = '22023';
        end if;
      exception when others then
        raise exception 'invalid_contract_received_at' using errcode = '22023';
      end;
    end if;
  end if;
  if p_payload ? 'financingWeeks' and p_payload->'financingWeeks' <> 'null'::jsonb and (jsonb_typeof(p_payload->'financingWeeks') <> 'number' or (p_payload->>'financingWeeks')::numeric < 0 or (p_payload->>'financingWeeks')::numeric > 52) then raise exception 'invalid_financing_weeks' using errcode = '22023'; end if;
  if p_payload ? 'inspectionWeeks' and p_payload->'inspectionWeeks' <> 'null'::jsonb and (jsonb_typeof(p_payload->'inspectionWeeks') <> 'number' or (p_payload->>'inspectionWeeks')::numeric < 0 or (p_payload->>'inspectionWeeks')::numeric > 52) then raise exception 'invalid_inspection_weeks' using errcode = '22023'; end if;

  if p_payload ? 'askingPrice' then
    if p_payload->'askingPrice' <> 'null'::jsonb and jsonb_typeof(p_payload->'askingPrice') <> 'number' then raise exception 'invalid_asking_price' using errcode = '22023'; end if;
    v_asking := nullif(p_payload->>'askingPrice', '')::numeric;
    if v_asking is not null and v_asking < 0 then raise exception 'invalid_asking_price' using errcode = '22023'; end if;
    select coalesce(max(version), 0) + 1 into v_version from public.valuation_snapshots where case_id = p_case_id;
    insert into public.valuation_snapshots (case_id, user_id, version, low_value, midpoint_value, high_value, methodology)
    values (p_case_id, v_user, v_version, null, v_asking, null,
      jsonb_build_object('type', 'asking-price-only', 'askingPrice', v_asking, 'note', 'Geen taxatie. De vraagprijs is wat de verkoper vraagt, niet de marktwaarde.'));
  end if;

  v_touches_bid := p_payload ? 'offerAmount' or p_payload ? 'contractAmount' or p_payload ? 'financingCondition'
    or p_payload ? 'inspectionCondition' or p_payload ? 'scenario' or p_payload ? 'reasons'
    or p_payload ? 'transferDate' or p_payload ? 'contractSignedAt' or p_payload ? 'contractReceivedAt' or p_payload ? 'financingWeeks' or p_payload ? 'inspectionWeeks';

  if v_touches_bid then
    if p_payload ? 'offerAmount' then
      if p_payload->'offerAmount' <> 'null'::jsonb and jsonb_typeof(p_payload->'offerAmount') <> 'number' then raise exception 'invalid_offer_amount' using errcode = '22023'; end if;
      v_offer := nullif(p_payload->>'offerAmount', '')::numeric;
      if v_offer is not null and v_offer < 0 then raise exception 'invalid_offer_amount' using errcode = '22023'; end if;
    end if;
    select * into v_latest_bid from public.bid_drafts where case_id = p_case_id order by version desc limit 1;
    select coalesce(max(version), 0) + 1 into v_version from public.bid_drafts where case_id = p_case_id;
    v_transfer := case when p_payload ? 'transferDate' then nullif(p_payload->>'transferDate', '')::date else v_latest_bid.transfer_date end;
    if not (p_payload ? 'offerAmount') then v_offer := v_latest_bid.amount; end if;
    v_conditions := coalesce(v_latest_bid.conditions, '{}'::jsonb);
    if p_payload ? 'contractAmount' then v_conditions := v_conditions || jsonb_build_object('contractAmount', nullif(p_payload->>'contractAmount', '')::numeric); end if;
    if p_payload ? 'financingCondition' then v_conditions := v_conditions || jsonb_build_object('financingCondition', (p_payload->>'financingCondition')::boolean); end if;
    if p_payload ? 'inspectionCondition' then v_conditions := v_conditions || jsonb_build_object('inspectionCondition', (p_payload->>'inspectionCondition')::boolean); end if;
    if p_payload ? 'scenario' then v_conditions := v_conditions || jsonb_build_object('scenario', p_payload->>'scenario'); end if;
    if p_payload ? 'reasons' then v_conditions := v_conditions || jsonb_build_object('reasons', p_payload->'reasons'); end if;
    if p_payload ? 'contractSignedAt' then v_conditions := v_conditions || jsonb_build_object('contractSignedAt', nullif(p_payload->>'contractSignedAt', '')); end if;
    if p_payload ? 'contractReceivedAt' then v_conditions := v_conditions || jsonb_build_object('contractReceivedAt', nullif(p_payload->>'contractReceivedAt', '')); end if;
    if p_payload ? 'financingWeeks' then v_conditions := v_conditions || jsonb_build_object('financingWeeks', nullif(p_payload->>'financingWeeks', '')::numeric); end if;
    if p_payload ? 'inspectionWeeks' then v_conditions := v_conditions || jsonb_build_object('inspectionWeeks', nullif(p_payload->>'inspectionWeeks', '')::numeric); end if;
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

grant execute on function public.apply_case_workflow(uuid, jsonb) to authenticated;
