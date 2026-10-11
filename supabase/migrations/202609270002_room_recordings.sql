begin;

create table public.room_recordings (
  room_id uuid not null references public.rooms(id) on delete cascade,
  lyric_id uuid not null references public.lyrics(id) on delete cascade,
  role_id uuid not null,
  user_id uuid not null,
  asset_id uuid not null unique references public.media_assets(id),
  capture_start_ms integer not null check (capture_start_ms >= 0),
  duration_ms integer not null check (duration_ms between 200 and 7205000),
  offset_ms integer not null default 0 check (offset_ms between -500 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, lyric_id),
  foreign key (room_id, user_id) references public.room_members(room_id, user_id) on delete cascade,
  foreign key (room_id, role_id) references public.room_members(room_id, role_id) on delete cascade
);
create index room_recordings_role on public.room_recordings(room_id, role_id);
alter table public.room_recordings enable row level security;
create policy room_recordings_read on public.room_recordings for select to authenticated
  using (public.can_access_room(room_id));
revoke all on public.room_recordings from anon, authenticated;
grant select on public.room_recordings to authenticated;
grant select, insert, update, delete on public.room_recordings to service_role;

-- Only the server's service key may finalize a take. The caller has already
-- uploaded a private object; this transaction verifies its owner and order.
create function public.finalize_room_recording(
  p_room uuid, p_lyric uuid, p_user uuid, p_asset uuid,
  p_capture_start_ms integer, p_duration_ms integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_role uuid;
  v_start integer;
  v_song_duration integer;
  v_old_asset uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Yetkisiz işlem'; end if;
  perform 1 from public.rooms where id = p_room for update;
  if not found then raise exception 'Oda bulunamadı'; end if;

  select l.role_id, l.start_ms, s.duration_seconds * 1000
    into v_role, v_start, v_song_duration
    from public.lyrics l
    join public.song_roles sr on sr.id = l.role_id
    join public.rooms r on r.song_id = sr.song_id
    join public.songs s on s.id = r.song_id
    where r.id = p_room and l.id = p_lyric;
  if v_role is null or not exists (
    select 1 from public.room_members m
    where m.room_id = p_room and m.user_id = p_user and m.role_id = v_role
  ) then raise exception 'Bu söz satırı atanmış rolüne ait değil'; end if;
  if not exists (
    select 1 from public.media_assets a
    where a.id = p_asset and a.room_id = p_room and a.kind = 'recording'
      and a.object_path like p_room::text || '/recordings/%'
  ) then raise exception 'Özel kayıt dosyası bulunamadı'; end if;
  if p_capture_start_ms < greatest(0, v_start - 5000)
    or p_capture_start_ms > v_start + 500
    or p_duration_ms < 200
    or p_duration_ms > v_song_duration + 5000 - p_capture_start_ms
  then raise exception 'Kayıt zamanı geçersiz'; end if;

  if exists (
    select 1 from public.lyrics earlier
    where earlier.role_id = v_role and earlier.start_ms < v_start
      and not exists (
        select 1 from public.room_recordings saved
        where saved.room_id = p_room and saved.lyric_id = earlier.id
      )
  ) then raise exception 'Önceki söz satırını önce kaydet'; end if;

  select asset_id into v_old_asset from public.room_recordings
    where room_id = p_room and lyric_id = p_lyric for update;
  insert into public.room_recordings
    (room_id, lyric_id, role_id, user_id, asset_id, capture_start_ms, duration_ms)
    values (p_room, p_lyric, v_role, p_user, p_asset, p_capture_start_ms, p_duration_ms)
    on conflict (room_id, lyric_id) do update
      set user_id = excluded.user_id, role_id = excluded.role_id,
          asset_id = excluded.asset_id, capture_start_ms = excluded.capture_start_ms,
          duration_ms = excluded.duration_ms, offset_ms = 0, updated_at = now();
  return v_old_asset;
end $$;
revoke all on function public.finalize_room_recording(uuid,uuid,uuid,uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function public.finalize_room_recording(uuid,uuid,uuid,uuid,integer,integer)
  to service_role;

create function public.set_room_recording_offset(p_room uuid, p_lyric uuid, p_offset_ms integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_offset_ms not between -500 and 500 then
    raise exception 'Geçersiz zaman düzeltmesi';
  end if;
  update public.room_recordings set offset_ms = p_offset_ms, updated_at = now()
    where room_id = p_room and lyric_id = p_lyric and user_id = auth.uid();
  if not found then raise exception 'Kendi kaydın bulunamadı'; end if;
end $$;
revoke all on function public.set_room_recording_offset(uuid,uuid,integer)
  from public, anon, authenticated;
grant execute on function public.set_room_recording_offset(uuid,uuid,integer) to authenticated;

update storage.buckets set allowed_mime_types = array[
  'video/mp4','video/webm','audio/mpeg','audio/wav','audio/x-wav',
  'audio/webm','audio/ogg','audio/mp4'
] where id = 'studio-private';

commit;
