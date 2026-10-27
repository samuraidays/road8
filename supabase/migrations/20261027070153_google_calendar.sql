-- Google カレンダー連携（設計書 §6、§8 #5・#6）
-- リフレッシュトークンは Supabase Vault に置き、google_connections には参照 ID だけを持つ。
-- Vault を触る関数は SECURITY DEFINER にせず、実行権限を service_role だけに与える（呼び出し元の service_role の権限で動く）。
-- サーバーは本人を確かめてから、本人の user_id でだけ呼ぶ（src/lib/supabase/service.ts）

------------------------------------------------------------------------------
-- 1. 連携先のカレンダーと、タスクの予定 ID
------------------------------------------------------------------------------

-- road8 が作ったカレンダーの ID（スコープ calendar.app.created では、アプリが作ったカレンダーにだけ書ける）
alter table public.google_connections
  add column calendar_id text check (char_length(calendar_id) <= 1024);

-- タスクを予定として入れたときの予定 ID。利用者の JWT で書く（RLS が効く）
alter table public.tasks
  add constraint tasks_calendar_event_id_check check (char_length(calendar_event_id) <= 1024);
grant update (calendar_event_id) on public.tasks to authenticated;

------------------------------------------------------------------------------
-- 2. トークンの保存・読み出し・削除（service_role だけ）
------------------------------------------------------------------------------

-- 連携（再連携を含む）。既存の連携があればトークンを差し替える
create function public.save_google_connection(p_user_id uuid, p_refresh_token text, p_scopes text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  select vault_secret_id into v_secret_id from public.google_connections where user_id = p_user_id;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_refresh_token, null, 'road8: Google refresh token');
    insert into public.google_connections (user_id, vault_secret_id, scopes)
    values (p_user_id, v_secret_id, p_scopes);
  else
    perform vault.update_secret(v_secret_id, p_refresh_token);
    update public.google_connections
       set scopes = p_scopes, connected_at = now(), revoked_at = null
     where user_id = p_user_id;
  end if;
end;
$$;

-- 有効な連携のリフレッシュトークンとカレンダー ID（なければ行を返さない）
create function public.get_google_connection(p_user_id uuid)
returns table (refresh_token text, calendar_id text)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.decrypted_secret, c.calendar_id
  from public.google_connections c
  join vault.decrypted_secrets s on s.id = c.vault_secret_id
  where c.user_id = p_user_id and c.revoked_at is null;
$$;

-- 連携の解除。トークンを Vault から消し、連携の行も消す
create function public.delete_google_connection(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  delete from public.google_connections where user_id = p_user_id returning vault_secret_id into v_secret_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

revoke all on function public.save_google_connection(uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_google_connection(uuid) from public, anon, authenticated;
revoke all on function public.delete_google_connection(uuid) from public, anon, authenticated;
grant execute on function public.save_google_connection(uuid, text, text) to service_role;
grant execute on function public.get_google_connection(uuid) to service_role;
grant execute on function public.delete_google_connection(uuid) to service_role;
