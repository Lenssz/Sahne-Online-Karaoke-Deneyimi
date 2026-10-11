begin;

create function public.delete_studio_song(p_song uuid, p_expected_title text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
  v_files integer;
begin
  if not public.is_admin() then raise exception 'Yetkisiz işlem'; end if;
  select title into v_title from public.songs where id = p_song for update;
  if v_title is null then raise exception 'Şarkı bulunamadı'; end if;
  if v_title is distinct from p_expected_title then raise exception 'Şarkı adı eşleşmiyor'; end if;
  if exists (select 1 from public.rooms where song_id = p_song) then
    raise exception 'Önce bu şarkının odalarını sil';
  end if;
  if exists (select 1 from public.vocal_jobs where song_id = p_song and status in ('waiting', 'processing')) then
    raise exception 'Vokal işi sürerken şarkı silinemez';
  end if;
  insert into public.studio_media_cleanup(object_path)
    select object_path from public.media_assets where song_id = p_song
    on conflict (object_path) do nothing;
  get diagnostics v_files = row_count;
  delete from public.vocal_jobs where song_id = p_song;
  delete from public.media_assets where song_id = p_song;
  delete from public.songs where id = p_song;
  return v_files;
end $$;
revoke all on function public.delete_studio_song(uuid,text) from public, anon, authenticated;
grant execute on function public.delete_studio_song(uuid,text) to authenticated;

commit;
