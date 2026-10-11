create function public.create_studio_song(p_title text, p_artist text, p_duration integer) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Yetkisiz işlem'; end if;
  insert into public.songs(title, artist, duration_seconds) values(trim(p_title), trim(p_artist), p_duration) returning id into v_id;
  insert into public.song_roles(song_id, name, color, position) values
    (v_id, 'Esin', '#ad96ff', 1), (v_id, 'Hilal', '#ff928b', 2), (v_id, '3. rol', '#8ad7c8', 3),
    (v_id, '4. rol', '#ffc48a', 4), (v_id, '5. rol', '#83b9ff', 5), (v_id, '6. rol', '#e7a4d6', 6);
  return v_id;
end $$;
revoke all on function public.create_studio_song(text,text,integer) from public, anon;
grant execute on function public.create_studio_song(text,text,integer) to authenticated;

create function public.create_studio_room(p_song uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Yetkisiz işlem'; end if;
  insert into public.rooms(song_id, name, created_by) values(p_song, trim(p_name), auth.uid()) returning id into v_id;
  return v_id;
end $$;
revoke insert on public.rooms from authenticated;
revoke all on function public.create_studio_room(uuid,text) from public, anon;
grant execute on function public.create_studio_room(uuid,text) to authenticated;
