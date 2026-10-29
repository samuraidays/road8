-- OKR にひもづかないタスクも作れるようにし、あとから KR を選び直せるようにする
-- KR は任意。ひもづけるときは、複合外部キー (key_result_id, tenant_id) が同じテナントの KR だけを許す（null は検査されない）

alter table public.tasks alter column key_result_id drop not null;

grant update (key_result_id) on public.tasks to authenticated;
