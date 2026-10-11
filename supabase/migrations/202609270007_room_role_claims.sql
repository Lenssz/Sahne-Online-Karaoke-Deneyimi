begin;

-- A room membership is independent of singer roles. One member may claim
-- several roles; each role still has exactly one current owner.
create table public.room_role_claims (
  room_id uuid not null,
  song_id uuid not null,
  role_id uuid not null,
  user_id uuid not null,
  claimed_at timestamptz not null default now(),
  primary key (room_id, role_id),
  unique (room_id, role_id, user_id),
  foreign key (room_id, song_id) references public.rooms(id, song_id) on delete cascade,
  foreign key (role_id, song_id) references public.song_roles(id, song_id),
  foreign key (room_id, user_id) references public.room_members(room_id, user_id) on delete cascade
);
insert into public.room_role_claims(room_id, song_id, role_id, user_id)
  select room_id, song_id, role_id, user_id from public.room_members where role_id is not null;
alter table public.room_role_claims enable row level security;
create policy room_role_claims_read on public.room_role_claims for select to authenticated
  using (public.can_access_room(room_id));
revoke all on public.room_role_claims from public, anon, authenticated;
grant select on public.room_role_claims to authenticated;
grant select, insert, update, delete on public.room_role_claims to service_role;

alter table public.room_recordings drop constraint room_recordings_room_id_role_id_fkey;
alter table public.room_recordings add constraint room_recordings_owner_claim_fkey
  foreign key (room_id, role_id, user_id)
  references public.room_role_claims(room_id, role_id, user_id) on delete cascade;
update public.room_members set role_id = null where role_id is not null;

-- Old role-bound invitations can no longer be accepted. Accepted members remain.
update public.room_invites set revoked_at = now()
  where accepted_at is null and revoked_at is null and role_id is not null;
alter table public.room_invites alter column role_id drop not null;
drop function public.create_room_invite_link(uuid,uuid);
create function public.create_room_invite_link(p_room uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_song uuid; v_token text;
begin
  if not public.is_admin() or not public.can_access_room(p_room) then raise exception 'Yetkisiz işlem'; end if;
  select song_id into v_song from public.rooms where id = p_room for update;
  if v_song is null then raise exception 'Oda bulunamadı'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.room_invites(room_id, song_id, role_id, email, token_hash)
    values(p_room, v_song, null, null, encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return v_token;
end $$;
revoke all on function public.create_room_invite_link(uuid) from public, anon, authenticated;
grant execute on function public.create_room_invite_link(uuid) to authenticated;

create or replace function public.invite_link_valid(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_token) = 64 and p_token ~ '^[0-9a-f]{64}$'
    and exists(select 1 from public.room_invites where email is null and role_id is null
      and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and expires_at > now() and accepted_at is null and revoked_at is null), false)
$$;

create or replace function public.accept_room_invite_link(p_token text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_invite public.room_invites; v_room uuid;
begin
  if auth.uid() is null or length(trim(p_name)) not between 1 and 80
    or not public.invite_link_valid(p_token) then raise exception 'Giriş, ad ve geçerli davet gerekli'; end if;
  select room_id into v_room from public.room_invites
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and role_id is null;
  perform 1 from public.rooms where id = v_room for update;
  select * into v_invite from public.room_invites
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and role_id is null for update;
  if v_invite.id is null or v_invite.expires_at <= now()
    or v_invite.accepted_at is not null or v_invite.revoked_at is not null
    then raise exception 'Davet geçersiz veya kullanılmış'; end if;
  insert into public.room_members(room_id, song_id, user_id, display_name)
    values(v_invite.room_id, v_invite.song_id, auth.uid(), trim(p_name))
    on conflict (room_id, user_id) do update set display_name = excluded.display_name;
  update public.room_invites set accepted_at = now() where id = v_invite.id;
  return v_invite.room_id;
end $$;

create function public.claim_room_role(p_room uuid, p_role uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_song uuid;
begin
  if auth.uid() is null then raise exception 'Giriş gerekli'; end if;
  select song_id into v_song from public.rooms where id = p_room for update;
  if v_song is null or not exists(select 1 from public.room_members where room_id = p_room and user_id = auth.uid())
    then raise exception 'Oda üyesi değilsin'; end if;
  if not exists(select 1 from public.song_roles where id = p_role and song_id = v_song)
    then raise exception 'Bu rol bu şarkıya ait değil'; end if;
  if exists(select 1 from public.render_jobs where room_id = p_room and status in ('waiting','processing'))
    then raise exception 'Video işi sürerken rol alınamaz'; end if;
  insert into public.room_role_claims(room_id, song_id, role_id, user_id)
    values(p_room, v_song, p_role, auth.uid())
    on conflict (room_id, role_id) do nothing;
  if not found then raise exception 'Bu rol başka birinde'; end if;
end $$;
revoke all on function public.claim_room_role(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_room_role(uuid,uuid) to authenticated;

create function public.remove_room_role(p_room uuid, p_role uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or not public.can_access_room(p_room) then raise exception 'Yetkisiz işlem'; end if;
  perform 1 from public.rooms where id = p_room for update;
  if not exists(select 1 from public.room_role_claims where room_id = p_room and role_id = p_role)
    then raise exception 'Rol sahibi bulunamadı'; end if;
  if exists(select 1 from public.render_jobs where room_id = p_room and status in ('waiting','processing'))
    then raise exception 'Video işi sürerken rol değiştirilemez'; end if;
  insert into public.studio_media_cleanup(object_path)
    select object_path from public.media_assets where room_id = p_room and
      (kind = 'final' or (kind = 'recording' and
        object_path like p_room::text || '/recordings/' || p_role::text || '/%'))
    on conflict (object_path) do nothing;
  delete from public.render_jobs where room_id = p_room;
  delete from public.room_recordings where room_id = p_room and role_id = p_role;
  delete from public.media_assets where room_id = p_room and
    (kind = 'final' or (kind = 'recording' and
      object_path like p_room::text || '/recordings/' || p_role::text || '/%'));
  delete from public.room_role_claims where room_id = p_room and role_id = p_role;
end $$;
revoke all on function public.remove_room_role(uuid,uuid) from public, anon, authenticated;
grant execute on function public.remove_room_role(uuid,uuid) to authenticated;

create function public.remove_room_member(p_room uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role uuid; v_creator uuid;
begin
  if not public.is_admin() or not public.can_access_room(p_room) then raise exception 'Yetkisiz işlem'; end if;
  select created_by into v_creator from public.rooms where id = p_room for update;
  if v_creator is null or p_user = v_creator then raise exception 'Oda kurucusu çıkarılamaz'; end if;
  if not exists(select 1 from public.room_members where room_id = p_room and user_id = p_user)
    then raise exception 'Üye bulunamadı'; end if;
  if exists(select 1 from public.render_jobs where room_id = p_room and status in ('waiting','processing'))
    then raise exception 'Video işi sürerken üye çıkarılamaz'; end if;
  for v_role in select role_id from public.room_role_claims where room_id = p_room and user_id = p_user loop
    perform public.remove_room_role(p_room, v_role);
  end loop;
  delete from public.room_members where room_id = p_room and user_id = p_user;
end $$;
revoke all on function public.remove_room_member(uuid,uuid) from public, anon, authenticated;
grant execute on function public.remove_room_member(uuid,uuid) to authenticated;

create or replace function public.finalize_room_recording(
  p_room uuid, p_lyric uuid, p_user uuid, p_asset uuid,
  p_capture_start_ms integer, p_duration_ms integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_role uuid; v_start integer; v_song_duration integer; v_old_asset uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Yetkisiz işlem'; end if;
  perform 1 from public.rooms where id = p_room for update;
  if not found then raise exception 'Oda bulunamadı'; end if;
  select l.role_id, l.start_ms, s.duration_seconds * 1000 into v_role, v_start, v_song_duration
    from public.lyrics l join public.song_roles sr on sr.id = l.role_id
    join public.rooms r on r.song_id = sr.song_id join public.songs s on s.id = r.song_id
    where r.id = p_room and l.id = p_lyric;
  if v_role is null or not exists(select 1 from public.room_role_claims c
    where c.room_id = p_room and c.role_id = v_role and c.user_id = p_user)
    then raise exception 'Bu söz satırı aldığın role ait değil'; end if;
  if not exists(select 1 from public.media_assets a
    where a.id = p_asset and a.room_id = p_room and a.kind = 'recording'
      and a.object_path like p_room::text || '/recordings/' || v_role::text || '/%')
    then raise exception 'Özel kayıt dosyası bulunamadı'; end if;
  if p_capture_start_ms < greatest(0, v_start - 5000) or p_capture_start_ms > v_start + 500
    or p_duration_ms < 200 or p_duration_ms > v_song_duration + 5000 - p_capture_start_ms
    then raise exception 'Kayıt zamanı geçersiz'; end if;
  if exists(select 1 from public.lyrics earlier where earlier.role_id = v_role and earlier.start_ms < v_start
    and not exists(select 1 from public.room_recordings saved where saved.room_id = p_room and saved.lyric_id = earlier.id))
    then raise exception 'Önceki söz satırını önce kaydet'; end if;
  select asset_id into v_old_asset from public.room_recordings where room_id = p_room and lyric_id = p_lyric for update;
  insert into public.room_recordings(room_id, lyric_id, role_id, user_id, asset_id, capture_start_ms, duration_ms)
    values(p_room, p_lyric, v_role, p_user, p_asset, p_capture_start_ms, p_duration_ms)
    on conflict (room_id, lyric_id) do update set user_id = excluded.user_id, role_id = excluded.role_id,
      asset_id = excluded.asset_id, capture_start_ms = excluded.capture_start_ms,
      duration_ms = excluded.duration_ms, offset_ms = 0, updated_at = now();
  return v_old_asset;
end $$;

create or replace function public.enqueue_render_job(p_room uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_song uuid; v_clip uuid; v_instrumental uuid;
  v_snapshot jsonb; v_total integer; v_saved integer;
begin
  if not public.is_admin() or not public.can_access_room(p_room) then raise exception 'Yalnızca oda yöneticisi video oluşturabilir'; end if;
  select song_id into v_song from public.rooms where id = p_room for update;
  if v_song is null then raise exception 'Oda bulunamadı'; end if;
  select id into v_id from public.render_jobs where room_id = p_room and status in ('waiting','processing')
    order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;
  if exists(select 1 from public.song_roles sr where sr.song_id = v_song and not exists(
    select 1 from public.room_role_claims c where c.room_id = p_room and c.role_id = sr.id))
    then raise exception 'Tüm şarkıcı rolleri alınmalı'; end if;
  if exists(select 1 from public.song_roles sr where sr.song_id = v_song and not exists(
    select 1 from public.lyrics l where l.role_id = sr.id))
    then raise exception 'Her rol için söz satırı gerekli'; end if;
  select count(*), count(rr.lyric_id), jsonb_agg(jsonb_build_object(
    'asset_id', rr.asset_id, 'capture_start_ms', rr.capture_start_ms,
    'duration_ms', rr.duration_ms, 'offset_ms', rr.offset_ms
  ) order by l.start_ms, l.id) into v_total, v_saved, v_snapshot
    from public.lyrics l join public.song_roles sr on sr.id = l.role_id and sr.song_id = v_song
    left join public.room_recordings rr on rr.room_id = p_room and rr.lyric_id = l.id;
  if v_total = 0 or v_saved <> v_total then raise exception 'Önce tüm söz satırları kaydedilmeli'; end if;
  if exists(select 1 from jsonb_array_elements(v_snapshot) item(value)
    left join public.media_assets a on a.id = (item.value->>'asset_id')::uuid
    left join storage.objects o on o.bucket_id = 'studio-private' and o.name = a.object_path
    where a.id is null or a.room_id <> p_room or a.kind <> 'recording' or o.id is null)
    then raise exception 'Bir mikrofon kaydı depolamada bulunamadı'; end if;
  select a.id into v_clip from public.media_assets a join storage.objects o
    on o.bucket_id = 'studio-private' and o.name = a.object_path
    where a.song_id = v_song and a.kind = 'clip' order by a.created_at desc limit 1;
  select a.id into v_instrumental from public.media_assets a join storage.objects o
    on o.bucket_id = 'studio-private' and o.name = a.object_path
    where a.song_id = v_song and a.kind = 'instrumental' and a.approved_at is not null limit 1;
  if v_clip is null or v_instrumental is null then raise exception 'Klip ve onaylı altyapı gerekli'; end if;
  insert into public.render_jobs(room_id, clip_asset_id, instrumental_asset_id, input_snapshot)
    values(p_room, v_clip, v_instrumental, v_snapshot) returning id into v_id;
  return v_id;
end $$;

commit;
