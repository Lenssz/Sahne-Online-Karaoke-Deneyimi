begin;
create extension if not exists pgcrypto with schema extensions;

create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.songs (
  id uuid primary key default gen_random_uuid(), title text not null check (length(title) between 1 and 160),
  artist text not null check (length(artist) between 1 and 160),
  duration_seconds integer not null check (duration_seconds between 1 and 7200),
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now()
);
create table public.song_roles (
  id uuid primary key default gen_random_uuid(), song_id uuid not null references public.songs(id) on delete cascade,
  name text not null check (length(name) between 1 and 80), color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null check (position between 1 and 24), unique (song_id, position), unique (id, song_id)
);
create table public.lyrics (
  id uuid primary key default gen_random_uuid(), role_id uuid not null references public.song_roles(id) on delete cascade,
  start_ms integer not null check (start_ms >= 0), end_ms integer not null check (end_ms > start_ms),
  text text not null check (length(text) between 1 and 1000), unique (role_id, start_ms)
);
create table public.rooms (
  id uuid primary key default gen_random_uuid(), song_id uuid not null references public.songs(id),
  name text not null check (length(name) between 1 and 120),
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  unique (id, song_id)
);
create table public.room_members (
  room_id uuid not null, song_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid, display_name text not null check (length(display_name) between 1 and 80),
  joined_at timestamptz not null default now(), primary key (room_id, user_id), unique (room_id, role_id),
  foreign key (room_id, song_id) references public.rooms(id, song_id) on delete cascade,
  foreign key (role_id, song_id) references public.song_roles(id, song_id)
);
create table public.room_invites (
  id uuid primary key default gen_random_uuid(), room_id uuid not null, song_id uuid not null, role_id uuid not null,
  email text not null check (email = lower(trim(email)) and length(email) <= 254 and email like '%@%'),
  token_hash text not null unique, expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now(),
  foreign key (room_id, song_id) references public.rooms(id, song_id) on delete cascade,
  foreign key (role_id, song_id) references public.song_roles(id, song_id)
);
create table public.media_assets (
  id uuid primary key default gen_random_uuid(), song_id uuid references public.songs(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  kind text not null check (kind in ('clip','instrumental','recording','final')),
  object_path text not null unique check (length(object_path) between 1 and 300),
  label text not null check (length(label) between 1 and 160), created_at timestamptz not null default now(),
  check ((song_id is not null and room_id is null and kind in ('clip','instrumental')) or
         (song_id is null and room_id is not null and kind in ('recording','final')))
);
create index on public.room_members(user_id, room_id);
create index on public.rooms(song_id);
create index on public.room_invites(room_id, role_id);
create index on public.lyrics(role_id);

create function public.is_admin() returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.admins where user_id = (select auth.uid())) $$;
create function public.can_access_room(target uuid) returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.room_members where room_id = target and user_id = (select auth.uid())) $$;
create function public.can_access_song(target uuid) returns boolean language sql stable security definer set search_path = ''
as $$ select public.is_admin() or exists(select 1 from public.room_members where song_id = target and user_id = (select auth.uid())) $$;

alter table public.admins enable row level security;
alter table public.songs enable row level security;
alter table public.song_roles enable row level security;
alter table public.lyrics enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_invites enable row level security;
alter table public.media_assets enable row level security;

create policy admin_self on public.admins for select to authenticated using (user_id = (select auth.uid()));
create policy songs_read on public.songs for select to authenticated using (public.can_access_song(id));
create policy songs_insert on public.songs for insert to authenticated with check (public.is_admin() and created_by = (select auth.uid()));
create policy songs_update on public.songs for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy roles_read on public.song_roles for select to authenticated using (public.can_access_song(song_id));
create policy roles_write on public.song_roles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy lyrics_read on public.lyrics for select to authenticated using (exists(select 1 from public.song_roles r where r.id = role_id and public.can_access_song(r.song_id)));
create policy lyrics_write on public.lyrics for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy rooms_read on public.rooms for select to authenticated using (public.can_access_room(id));
create policy rooms_insert on public.rooms for insert to authenticated with check (public.is_admin() and created_by = (select auth.uid()));
create policy members_read on public.room_members for select to authenticated using (public.can_access_room(room_id));
create policy invites_read on public.room_invites for select to authenticated using (public.is_admin() and public.can_access_room(room_id));
create policy assets_read on public.media_assets for select to authenticated using (
  (song_id is not null and public.can_access_song(song_id)) or (room_id is not null and public.can_access_room(room_id)));
create policy assets_insert on public.media_assets for insert to authenticated with check (public.is_admin() and
  ((song_id is not null and public.can_access_song(song_id)) or (room_id is not null and public.can_access_room(room_id))));
create policy assets_delete on public.media_assets for delete to authenticated using (public.is_admin() and
  ((song_id is not null and public.can_access_song(song_id)) or (room_id is not null and public.can_access_room(room_id))));

create function public.add_room_creator() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.room_members(room_id, song_id, user_id, display_name) values (new.id, new.song_id, new.created_by, 'Yönetici');
  return new;
end $$;
create trigger room_creator after insert on public.rooms for each row execute function public.add_room_creator();

create function public.check_lyric_time() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from public.song_roles r join public.songs s on s.id = r.song_id
    where r.id = new.role_id and new.end_ms <= s.duration_seconds * 1000) then
    raise exception 'Söz zamanı şarkı süresi içinde olmalı';
  end if;
  return new;
end $$;
create trigger lyric_time before insert or update on public.lyrics for each row execute function public.check_lyric_time();

-- Hashes are stored; raw invitation tokens are returned only on creation.
create function public.create_room_invite(p_room uuid, p_role uuid, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_song uuid; v_token text; v_email text := lower(trim(p_email));
begin
  if not public.is_admin() or not public.can_access_room(p_room) then raise exception 'Yetkisiz işlem'; end if;
  select song_id into v_song from public.rooms where id = p_room for update;
  if not exists(select 1 from public.song_roles where id = p_role and song_id = v_song)
    or v_email not like '%@%' or length(v_email) > 254 then raise exception 'Geçersiz davet'; end if;
  if exists(select 1 from public.room_members where room_id = p_room and role_id = p_role) then raise exception 'Rol zaten atanmış'; end if;
  update public.room_invites set revoked_at = now() where room_id = p_room
    and (role_id = p_role or email = v_email) and accepted_at is null and revoked_at is null;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.room_invites(room_id, song_id, role_id, email, token_hash)
    values (p_room, v_song, p_role, v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return v_token;
end $$;

create function public.invite_matches(p_token text, p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.room_invites where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and email = lower(trim(p_email)) and expires_at > now() and accepted_at is null and revoked_at is null)
$$;

create function public.accept_room_invite(p_token text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_invite public.room_invites; v_email text; v_room uuid;
begin
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null or length(trim(p_name)) not between 1 and 80 then raise exception 'Giriş ve isim gerekli'; end if;
  -- Same lock order as invite creation prevents accepting a concurrently revoked token.
  select room_id into v_room from public.room_invites where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  perform 1 from public.rooms where id = v_room for update;
  select * into v_invite from public.room_invites where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if v_invite.id is null or v_invite.email <> v_email or v_invite.expires_at <= now()
    or v_invite.accepted_at is not null or v_invite.revoked_at is not null then raise exception 'Davet geçersiz veya süresi dolmuş'; end if;
  if exists(select 1 from public.room_members where room_id = v_invite.room_id and role_id = v_invite.role_id) then raise exception 'Rol zaten atanmış'; end if;
  insert into public.room_members(room_id, song_id, user_id, role_id, display_name)
    values(v_invite.room_id, v_invite.song_id, auth.uid(), v_invite.role_id, trim(p_name))
    on conflict (room_id, user_id) do update set role_id = excluded.role_id, display_name = excluded.display_name
    where public.room_members.role_id is null;
  if not found then raise exception 'Bu odada zaten bir rolün var'; end if;
  update public.room_invites set accepted_at = now() where id = v_invite.id;
  return v_invite.room_id;
end $$;

create function public.revoke_room_invite(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_room uuid;
begin
  select room_id into v_room from public.room_invites where id = p_id;
  if not public.is_admin() or not public.can_access_room(v_room) then raise exception 'Yetkisiz işlem'; end if;
  perform 1 from public.rooms where id = v_room for update;
  update public.room_invites set revoked_at = now() where id = p_id and accepted_at is null;
end $$;

revoke all on public.admins, public.songs, public.song_roles, public.lyrics, public.rooms, public.room_members, public.room_invites, public.media_assets from anon, authenticated;
grant select on public.admins, public.room_members, public.room_invites to authenticated;
grant select, insert, update on public.songs to authenticated;
grant select, insert on public.rooms to authenticated;
grant select, insert, update, delete on public.song_roles, public.lyrics to authenticated;
grant select, insert, delete on public.media_assets to authenticated;
revoke all on function public.is_admin(), public.can_access_room(uuid), public.can_access_song(uuid), public.add_room_creator(), public.check_lyric_time(), public.create_room_invite(uuid,uuid,text), public.invite_matches(text,text), public.accept_room_invite(text,text), public.revoke_room_invite(uuid) from public, anon, authenticated;
grant execute on function public.is_admin(), public.can_access_room(uuid), public.can_access_song(uuid), public.create_room_invite(uuid,uuid,text), public.accept_room_invite(text,text), public.revoke_room_invite(uuid) to authenticated;
grant execute on function public.invite_matches(text,text) to anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('studio-private', 'studio-private', false, 52428800, array['video/mp4','video/webm','audio/mpeg','audio/wav','audio/x-wav','audio/webm','audio/ogg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy studio_media_read on storage.objects for select to authenticated using (
  bucket_id = 'studio-private' and exists(select 1 from public.media_assets a where a.object_path = name));
create policy studio_media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'studio-private' and public.is_admin() and exists(select 1 from public.media_assets a where a.object_path = name));
create policy studio_media_delete on storage.objects for delete to authenticated using (
  bucket_id = 'studio-private' and public.is_admin() and exists(select 1 from public.media_assets a where a.object_path = name));
commit;
