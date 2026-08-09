-- ═══════════════════════════════════════════════════════════════
--  StarFusion — Débit / remboursement atomique des crédits
--  Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

create or replace function public.consume_generation_credit(
  p_session_id uuid,
  p_amount integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  bal integer;
begin
  if p_amount is null or p_amount < 1 then
    return jsonb_build_object('ok', false, 'new_balance', 0, 'error', 'invalid_amount');
  end if;

  update public.sessions
  set credits_balance = credits_balance - p_amount
  where id = p_session_id
    and credits_balance >= p_amount
  returning credits_balance into bal;

  if bal is null then
    select credits_balance into bal from public.sessions where id = p_session_id;
    return jsonb_build_object(
      'ok', false,
      'new_balance', coalesce(bal, 0),
      'error', 'insufficient_credits'
    );
  end if;

  insert into public.credit_transactions (session_id, amount, reason, reference_id)
  values (p_session_id, -p_amount, 'generation', null);

  return jsonb_build_object('ok', true, 'new_balance', bal);
end;
$$;

create or replace function public.refund_generation_credit(
  p_session_id uuid,
  p_amount integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  bal integer;
begin
  if p_amount is null or p_amount < 1 then
    return jsonb_build_object('ok', false, 'new_balance', 0);
  end if;

  update public.sessions
  set credits_balance = credits_balance + p_amount
  where id = p_session_id
  returning credits_balance into bal;

  if bal is null then
    return jsonb_build_object('ok', false, 'new_balance', 0);
  end if;

  insert into public.credit_transactions (session_id, amount, reason, reference_id)
  values (p_session_id, p_amount, 'refund', null);

  return jsonb_build_object('ok', true, 'new_balance', bal);
end;
$$;

revoke all on function public.consume_generation_credit(uuid, integer) from public, anon, authenticated;
revoke all on function public.refund_generation_credit(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_generation_credit(uuid, integer) to service_role;
grant execute on function public.refund_generation_credit(uuid, integer) to service_role;
