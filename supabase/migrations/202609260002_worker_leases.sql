begin;

-- A worker that disappears while processing must not hold a job forever.
alter table public.vocal_jobs
  add column if not exists attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  add column if not exists lease_id uuid;

drop function public.claim_vocal_job();
create function public.claim_vocal_job()
returns table(job_id uuid, source_path text, lease_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Yetkisiz işlem'; end if;

  update public.vocal_jobs j
     set status = case when j.attempt_count >= 3 then 'error' else 'waiting' end,
         error_message = case when j.attempt_count >= 3 then 'İş üç kez yarıda kaldı. Yeniden sıraya alabilirsin.' else null end,
         lease_id = null,
         updated_at = now()
   where j.status = 'processing' and j.updated_at < now() - interval '5 minutes';

  return query
    with picked as (
      select j.id from public.vocal_jobs j
       where j.status = 'waiting' and j.attempt_count < 3
       order by j.created_at for update skip locked limit 1
    ), changed as (
      update public.vocal_jobs j
         set status = 'processing',
             attempt_count = j.attempt_count + 1,
             lease_id = gen_random_uuid(),
             claimed_at = now(),
             updated_at = now()
        from picked where j.id = picked.id
        returning j.id, j.source_asset_id, j.lease_id
    )
    select changed.id, a.object_path, changed.lease_id
      from changed join public.media_assets a on a.id = changed.source_asset_id;
end $$;

revoke all on function public.claim_vocal_job() from public, anon, authenticated;
grant execute on function public.claim_vocal_job() to service_role;

commit;
