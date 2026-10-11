begin;

-- Keep object paths after their owning rows are gone so a failed Storage call can be retried.
create table public.studio_media_cleanup (
  object_path text primary key check (length(object_path) between 1 and 300),
  queued_at timestamptz not null default now()
);
alter table public.studio_media_cleanup enable row level security;
revoke all on public.studio_media_cleanup from public, anon, authenticated;
grant select, delete on public.studio_media_cleanup to service_role;

create function public.delete_studio_room(p_room uuid, p_expected_name text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_files integer;
begin
  if not public.is_admin() then raise exception 'Yetkisiz işlem'; end if;
  select name into v_name from public.rooms where id = p_room for update;
  if v_name is null then raise exception 'Oda bulunamadı'; end if;
  if v_name is distinct from p_expected_name then raise exception 'Oda adı eşleşmiyor'; end if;
  if exists (select 1 from public.render_jobs where room_id = p_room and status in ('waiting', 'processing')) then
    raise exception 'Video işi sürerken oda silinemez';
  end if;
  insert into public.studio_media_cleanup(object_path)
    select object_path from public.media_assets where room_id = p_room
    on conflict (object_path) do nothing;
  get diagnostics v_files = row_count;
  -- Delete dependent rows explicitly before removing their media assets.
  delete from public.render_jobs where room_id = p_room;
  delete from public.room_recordings where room_id = p_room;
  delete from public.media_assets where room_id = p_room;
  delete from public.rooms where id = p_room;
  return v_files;
end $$;
revoke all on function public.delete_studio_room(uuid,text) from public, anon, authenticated;
grant execute on function public.delete_studio_room(uuid,text) to authenticated;

commit;
