begin;

-- New invitations carry no e-mail address. Existing accepted invitations stay intact.
alter table public.room_invites alter column email drop not null;

create function public.create_room_invite_link(p_room uuid, p_role uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_song uuid; v_token text;
begin
  if not public.is_admin() or not public.can_access_room(p_room) then raise exception 'Yetkisiz işlem'; end if;
  select song_id into v_song from public.rooms where id = p_room for update;
  if v_song is null or not exists(select 1 from public.song_roles where id = p_role and song_id = v_song)
    then raise exception 'Geçersiz rol'; end if;
  if exists(select 1 from public.room_members where room_id = p_room and role_id = p_role)
    then raise exception 'Rol zaten atanmış'; end if;
  update public.room_invites set revoked_at = now() where room_id = p_room
    and role_id = p_role and accepted_at is null and revoked_at is null;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.room_invites(room_id, song_id, role_id, email, token_hash)
    values(p_room, v_song, p_role, null, encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return v_token;
end $$;

create function public.invite_link_valid(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_token) = 64 and p_token ~ '^[0-9a-f]{64}$'
    and exists(select 1 from public.room_invites where email is null
      and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and expires_at > now() and accepted_at is null and revoked_at is null), false)
$$;

create function public.accept_room_invite_link(p_token text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_invite public.room_invites; v_room uuid;
begin
  if auth.uid() is null or length(trim(p_name)) not between 1 and 80
    or not public.invite_link_valid(p_token) then raise exception 'Giriş, ad ve geçerli davet gerekli'; end if;
  -- Match invitation creation's lock order: room first, then invitation.
  select room_id into v_room from public.room_invites
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and email is null;
  perform 1 from public.rooms where id = v_room for update;
  select * into v_invite from public.room_invites
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and email is null for update;
  if v_invite.id is null or v_invite.expires_at <= now()
    or v_invite.accepted_at is not null or v_invite.revoked_at is not null
    then raise exception 'Davet geçersiz veya kullanılmış'; end if;
  if exists(select 1 from public.room_members where room_id = v_invite.room_id and role_id = v_invite.role_id)
    then raise exception 'Rol zaten atanmış'; end if;
  insert into public.room_members(room_id, song_id, user_id, role_id, display_name)
    values(v_invite.room_id, v_invite.song_id, auth.uid(), v_invite.role_id, trim(p_name))
    on conflict (room_id, user_id) do update set role_id = excluded.role_id, display_name = excluded.display_name
    where public.room_members.role_id is null;
  if not found then raise exception 'Bu odada zaten bir rolün var'; end if;
  update public.room_invites set accepted_at = now() where id = v_invite.id;
  return v_invite.room_id;
end $$;

revoke all on function public.create_room_invite_link(uuid,uuid),
  public.invite_link_valid(text), public.accept_room_invite_link(text,text) from public, anon, authenticated;
grant execute on function public.create_room_invite_link(uuid,uuid),
  public.accept_room_invite_link(text,text) to authenticated;
grant execute on function public.invite_link_valid(text) to anon, authenticated;

-- The email-bound invitation RPCs remain in the schema for migration history,
-- but the application no longer exposes or permits that login route.
revoke execute on function public.create_room_invite(uuid,uuid,text),
  public.accept_room_invite(text,text) from authenticated;
revoke execute on function public.invite_matches(text,text) from anon, authenticated;

commit;
