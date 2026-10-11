begin;

create function public.set_studio_role_count(p_song uuid, p_count integer, p_expected_removed_lines integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_current integer;
  v_removed_lines integer;
  v_position integer;
  v_colors text[] := array['#ad96ff','#ff928b','#8ad7c8','#ffc48a','#83b9ff','#e7a4d6'];
begin
  if not public.is_admin() then raise exception 'Yetkisiz işlem'; end if;
  if p_count is null or p_count < 1 or p_count > 24 then raise exception 'Rol sayısı 1–24 olmalı'; end if;
  perform 1 from public.songs where id = p_song for update;
  if not found then raise exception 'Şarkı bulunamadı'; end if;
  if exists (select 1 from public.rooms where song_id = p_song) then
    raise exception 'Bağlı oda varken rol sayısı değiştirilemez';
  end if;
  perform 1 from public.song_roles where song_id = p_song order by position for update;
  select count(*) into v_current from public.song_roles where song_id = p_song;
  if p_count = v_current then return; end if;
  if p_count > v_current then
    for v_position in v_current + 1..p_count loop
      insert into public.song_roles(song_id, name, color, position)
        values (p_song, v_position::text || '. rol', v_colors[((v_position - 1) % 6) + 1], v_position);
    end loop;
  else
    select count(*) into v_removed_lines from public.lyrics l
      join public.song_roles r on r.id = l.role_id
      where r.song_id = p_song and r.position > p_count;
    if p_expected_removed_lines is distinct from v_removed_lines then
      raise exception 'Silinecek söz sayısı değişti. Sayfayı yenile';
    end if;
    delete from public.song_roles where song_id = p_song and position > p_count;
  end if;
end $$;
revoke all on function public.set_studio_role_count(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.set_studio_role_count(uuid,integer,integer) to authenticated;

commit;
