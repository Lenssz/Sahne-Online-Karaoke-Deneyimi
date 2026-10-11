begin;

create table public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  clip_asset_id uuid not null references public.media_assets(id),
  instrumental_asset_id uuid not null references public.media_assets(id),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'array'),
  status text not null default 'waiting' check (status in ('waiting','processing','ready','error')),
  result_asset_id uuid references public.media_assets(id),
  error_message text check (length(error_message) <= 300),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  lease_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'ready') = (result_asset_id is not null))
);
create unique index one_active_render_job_per_room on public.render_jobs(room_id)
  where status in ('waiting','processing');
create index render_jobs_queue on public.render_jobs(created_at) where status = 'waiting';
alter table public.render_jobs enable row level security;
create policy render_jobs_read on public.render_jobs for select to authenticated
  using (public.can_access_room(room_id));
revoke all on public.render_jobs from anon, authenticated;
grant select on public.render_jobs to authenticated;
grant select, insert, update, delete on public.render_jobs to service_role;

create function public.enqueue_render_job(p_room uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_song uuid;
  v_clip uuid;
  v_instrumental uuid;
  v_snapshot jsonb;
  v_total integer;
  v_saved integer;
begin
  if not public.is_admin() or not public.can_access_room(p_room) then
    raise exception 'Yalnızca oda yöneticisi video oluşturabilir';
  end if;
  select song_id into v_song from public.rooms where id = p_room for update;
  if v_song is null then raise exception 'Oda bulunamadı'; end if;
  select id into v_id from public.render_jobs
    where room_id = p_room and status in ('waiting','processing')
    order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;

  if exists (
    select 1 from public.song_roles sr
    where sr.song_id = v_song and not exists (
      select 1 from public.room_members m
      where m.room_id = p_room and m.role_id = sr.id
    )
  ) then raise exception 'Tüm rollere bir arkadaş atanmalı'; end if;
  if exists (
    select 1 from public.song_roles sr
    where sr.song_id = v_song and not exists (
      select 1 from public.lyrics l where l.role_id = sr.id
    )
  ) then raise exception 'Her rol için söz satırı gerekli'; end if;
  select count(*), count(rr.lyric_id), jsonb_agg(jsonb_build_object(
    'asset_id', rr.asset_id, 'capture_start_ms', rr.capture_start_ms,
    'duration_ms', rr.duration_ms, 'offset_ms', rr.offset_ms
  ) order by l.start_ms, l.id)
    into v_total, v_saved, v_snapshot
    from public.lyrics l
    join public.song_roles sr on sr.id = l.role_id and sr.song_id = v_song
    left join public.room_recordings rr on rr.room_id = p_room and rr.lyric_id = l.id;
  if v_total = 0 or v_saved <> v_total then
    raise exception 'Önce tüm söz satırları kaydedilmeli';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_snapshot) item(value)
    left join public.media_assets a on a.id = (item.value->>'asset_id')::uuid
    left join storage.objects o on o.bucket_id = 'studio-private' and o.name = a.object_path
    where a.id is null or a.room_id <> p_room or a.kind <> 'recording' or o.id is null
  ) then raise exception 'Bir mikrofon kaydı depolamada bulunamadı'; end if;

  select a.id into v_clip from public.media_assets a
    join storage.objects o on o.bucket_id = 'studio-private' and o.name = a.object_path
    where a.song_id = v_song and a.kind = 'clip'
    order by a.created_at desc limit 1;
  select a.id into v_instrumental from public.media_assets a
    join storage.objects o on o.bucket_id = 'studio-private' and o.name = a.object_path
    where a.song_id = v_song and a.kind = 'instrumental' and a.approved_at is not null
    limit 1;
  if v_clip is null or v_instrumental is null then
    raise exception 'Klip ve onaylı altyapı gerekli';
  end if;
  insert into public.render_jobs(room_id, clip_asset_id, instrumental_asset_id, input_snapshot)
    values(p_room, v_clip, v_instrumental, v_snapshot) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.enqueue_render_job(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_render_job(uuid) to authenticated;

create function public.claim_render_job()
returns table(job_id uuid, lease_id uuid, clip_path text, instrumental_path text, snapshot jsonb, duration_seconds integer)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Yetkisiz işlem'; end if;
  update public.render_jobs j
    set status = case when j.attempt_count >= 3 then 'error' else 'waiting' end,
        error_message = case when j.attempt_count >= 3 then 'Render üç kez yarıda kaldı. Yeniden oluşturabilirsin.' else null end,
        lease_id = null, updated_at = now()
    where j.status = 'processing' and j.updated_at < now() - interval '5 minutes';
  return query
    with picked as (
      select j.id from public.render_jobs j
      where j.status = 'waiting' and j.attempt_count < 3
      order by j.created_at for update skip locked limit 1
    ), changed as (
      update public.render_jobs j
      set status = 'processing', attempt_count = j.attempt_count + 1,
          lease_id = gen_random_uuid(), updated_at = now()
      from picked where j.id = picked.id
      returning j.id, j.lease_id, j.clip_asset_id, j.instrumental_asset_id,
                j.input_snapshot, j.room_id
    )
    select changed.id, changed.lease_id, clip.object_path, music.object_path,
      (select jsonb_agg(jsonb_build_object(
        'path', a.object_path,
        'capture_start_ms', (item.value->>'capture_start_ms')::integer,
        'duration_ms', (item.value->>'duration_ms')::integer,
        'offset_ms', (item.value->>'offset_ms')::integer
      ) order by item.ordinality)
      from jsonb_array_elements(changed.input_snapshot) with ordinality item(value, ordinality)
      join public.media_assets a on a.id = (item.value->>'asset_id')::uuid),
      s.duration_seconds
    from changed
    join public.media_assets clip on clip.id = changed.clip_asset_id
    join public.media_assets music on music.id = changed.instrumental_asset_id
    join public.rooms r on r.id = changed.room_id
    join public.songs s on s.id = r.song_id;
end $$;
revoke all on function public.claim_render_job() from public, anon, authenticated;
grant execute on function public.claim_render_job() to service_role;

-- A render must keep its input files stable. The recording API can retry after
-- the job reaches ready/error; failures never remove the microphone takes.
create function public.guard_render_recording_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.rooms where id = old.room_id for update;
  if exists (
    select 1 from public.render_jobs
    where room_id = old.room_id and status in ('waiting','processing')
  ) then
    raise exception 'Video oluşturulurken kayıt değiştirilemez';
  end if;
  if tg_op = 'UPDATE' then return new; end if;
  return old;
end $$;
create trigger guard_render_recording_change
  before update or delete on public.room_recordings
  for each row execute function public.guard_render_recording_change();
revoke all on function public.guard_render_recording_change() from public, anon, authenticated;

commit;
