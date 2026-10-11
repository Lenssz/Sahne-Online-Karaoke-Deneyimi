begin;

-- A reviewed instrumental is the only instrumental visible to room members.
alter table public.media_assets add column approved_at timestamptz;
alter table public.media_assets add constraint instrumental_approval_only
  check (approved_at is null or kind = 'instrumental');
create unique index one_approved_instrumental_per_song on public.media_assets(song_id)
  where approved_at is not null;

drop policy assets_read on public.media_assets;
create policy assets_read on public.media_assets for select to authenticated using (
  (song_id is not null and public.can_access_song(song_id)
    and (kind <> 'instrumental' or approved_at is not null or public.is_admin()))
  or (room_id is not null and public.can_access_room(room_id))
);

create function public.create_studio_song_v2(
  p_title text, p_artist text, p_duration integer, p_roles jsonb, p_lyrics jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_song uuid;
  v_role jsonb;
  v_line jsonb;
  v_role_ids uuid[] := '{}';
  v_role_id uuid;
  v_position integer := 0;
  v_role_position integer;
  v_start integer;
  v_end integer;
begin
  if not public.is_admin() then raise exception 'Yetkisiz işlem'; end if;
  if length(trim(p_title)) not between 1 and 160 or length(trim(p_artist)) not between 1 and 160
    or p_duration not between 1 and 7200 or jsonb_typeof(p_roles) <> 'array'
    or jsonb_array_length(p_roles) not between 1 and 24 or jsonb_typeof(p_lyrics) <> 'array'
    or jsonb_array_length(p_lyrics) > 500 then raise exception 'Geçersiz şarkı bilgileri'; end if;
  insert into public.songs(title, artist, duration_seconds)
    values(trim(p_title), trim(p_artist), p_duration) returning id into v_song;
  for v_role in select value from jsonb_array_elements(p_roles) loop
    v_position := v_position + 1;
    if length(trim(v_role->>'name')) not between 1 and 80
      or (v_role->>'color') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Geçersiz rol'; end if;
    insert into public.song_roles(song_id, name, color, position)
      values(v_song, trim(v_role->>'name'), v_role->>'color', v_position)
      returning id into v_role_id;
    v_role_ids := array_append(v_role_ids, v_role_id);
  end loop;
  for v_line in select value from jsonb_array_elements(p_lyrics) loop
    v_role_position := (v_line->>'role_position')::integer;
    v_start := (v_line->>'start_ms')::integer;
    v_end := (v_line->>'end_ms')::integer;
    if v_role_position not between 1 and v_position or v_start < 0
      or v_end <= v_start or v_end > p_duration * 1000
      or length(trim(v_line->>'text')) not between 1 and 1000 then raise exception 'Geçersiz söz zamanı'; end if;
    insert into public.lyrics(role_id, start_ms, end_ms, text)
      values(v_role_ids[v_role_position], v_start, v_end, trim(v_line->>'text'));
  end loop;
  return v_song;
end $$;
revoke all on function public.create_studio_song_v2(text,text,integer,jsonb,jsonb) from public, anon;
grant execute on function public.create_studio_song_v2(text,text,integer,jsonb,jsonb) to authenticated;

create table public.vocal_jobs (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  source_asset_id uuid not null references public.media_assets(id),
  result_asset_id uuid references public.media_assets(id),
  status text not null default 'waiting' check (status in ('waiting','processing','ready','error')),
  error_message text check (length(error_message) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz,
  check ((status = 'ready') = (result_asset_id is not null))
);
create unique index one_active_vocal_job_per_song on public.vocal_jobs(song_id)
  where status in ('waiting','processing');
create index vocal_jobs_queue on public.vocal_jobs(created_at) where status = 'waiting';
alter table public.vocal_jobs enable row level security;
create policy vocal_jobs_admin_read on public.vocal_jobs for select to authenticated using (public.is_admin());
revoke all on public.vocal_jobs from anon, authenticated;
grant select on public.vocal_jobs to authenticated;

create function public.enqueue_vocal_job(p_song uuid, p_source uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Yetkisiz işlem'; end if;
  if not exists (
    select 1 from public.media_assets a join storage.objects o
      on o.bucket_id = 'studio-private' and o.name = a.object_path
    where a.id = p_source and a.song_id = p_song and a.kind = 'clip'
  ) then raise exception 'Yüklenmiş bir şarkı klibi gerekli'; end if;
  -- Serialize requests for the same song before checking for an active job.
  perform 1 from public.songs where id = p_song for update;
  select id into v_id from public.vocal_jobs
    where song_id = p_song and status in ('waiting','processing') order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.vocal_jobs(song_id, source_asset_id) values(p_song, p_source) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.enqueue_vocal_job(uuid,uuid) from public, anon;
grant execute on function public.enqueue_vocal_job(uuid,uuid) to authenticated;

create function public.claim_vocal_job() returns table(job_id uuid, source_path text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Yetkisiz işlem'; end if;
  return query
    with picked as (
      select j.id from public.vocal_jobs j where j.status = 'waiting'
      order by j.created_at for update skip locked limit 1
    ), changed as (
      update public.vocal_jobs j set status = 'processing', claimed_at = now(), updated_at = now()
      from picked where j.id = picked.id returning j.id, j.source_asset_id
    )
    select changed.id, a.object_path from changed
      join public.media_assets a on a.id = changed.source_asset_id;
end $$;
revoke all on function public.claim_vocal_job() from public, anon, authenticated;
grant execute on function public.claim_vocal_job() to service_role;

create function public.approve_song_instrumental(p_song uuid, p_asset uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Yetkisiz işlem'; end if;
  perform 1 from public.songs where id = p_song for update;
  if not exists (
    select 1 from public.media_assets a join storage.objects o
      on o.bucket_id = 'studio-private' and o.name = a.object_path
    where a.id = p_asset and a.song_id = p_song and a.kind = 'instrumental'
  ) then raise exception 'Yüklenmiş bir altyapı seç'; end if;
  update public.media_assets set approved_at = null where song_id = p_song and approved_at is not null;
  update public.media_assets set approved_at = now() where id = p_asset;
end $$;
revoke all on function public.approve_song_instrumental(uuid,uuid) from public, anon;
grant execute on function public.approve_song_instrumental(uuid,uuid) to authenticated;

create function public.studio_storage_usage() returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare v_bytes bigint;
begin
  if not public.is_admin() and auth.role() is distinct from 'service_role' then
    raise exception 'Yetkisiz işlem';
  end if;
  select coalesce(sum(case when o.metadata->>'size' ~ '^[0-9]+$'
    then (o.metadata->>'size')::bigint else 0 end), 0)::bigint into v_bytes
    from storage.objects o where o.bucket_id = 'studio-private';
  return v_bytes;
end $$;
revoke all on function public.studio_storage_usage() from public, anon;
grant execute on function public.studio_storage_usage() to authenticated, service_role;

commit;
