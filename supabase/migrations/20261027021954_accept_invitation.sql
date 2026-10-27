-- 招待の受諾（設計書 §9-3）
-- サーバーが service_role で呼ぶ。受諾する時点では利用者はまだテナントに所属していないため、本人の権限では所属を作れない。
-- 使用済みにする更新と所属の作成を1つのトランザクションで行い、同じ招待が2回使われないようにする。
--
-- SECURITY DEFINER にはしない（呼び出し元の service_role の権限で動く）。実行権限は service_role だけに与える

create function public.accept_invitation(p_token_hash text, p_user_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_role      public.membership_role;
begin
  -- 未使用・未取り消し・期限内の招待だけを使用済みにする。同時に2回呼ばれても、更新できるのは先の1回だけ
  update public.invitations i
     set accepted_at = now(),
         accepted_by = p_user_id
   where i.token_hash = p_token_hash
     and i.accepted_at is null
     and i.revoked_at is null
     and i.expires_at > now()
  returning i.tenant_id, i.role into v_tenant_id, v_role;

  if v_tenant_id is null then
    raise exception 'invitation is invalid, used, revoked or expired' using errcode = 'P0001';
  end if;

  -- すでに所属している人は受諾できない（例外で上の更新も取り消され、招待は未使用のまま残る）
  if exists (
    select 1 from public.memberships m
    where m.tenant_id = v_tenant_id and m.user_id = p_user_id
  ) then
    raise exception 'already a member of the tenant' using errcode = 'P0001';
  end if;

  insert into public.memberships (tenant_id, user_id, role)
  values (v_tenant_id, p_user_id, v_role);

  return v_tenant_id;
end;
$$;

revoke all on function public.accept_invitation(text, uuid) from public, anon, authenticated;
grant execute on function public.accept_invitation(text, uuid) to service_role;
