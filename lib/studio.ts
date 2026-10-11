import 'server-only';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from './auth';
import type { Asset, DbRole, Lyric, Member, RoleClaim, Room, RoomRecording, Song } from './types';
import { timeLabel } from './types';
import type { SingerRole } from './demo';

export async function getRoom(id: string, authenticatedViewer?: Awaited<ReturnType<typeof requireUser>>) {
  const viewer = authenticatedViewer ?? await requireUser();
  if (!z.uuid().safeParse(id).success) notFound();
  const { db } = viewer;
  const result = await db.from('rooms').select('id,name,song_id,created_by').eq('id', id).maybeSingle();
  if (result.error) throw new Error('Oda yüklenemedi.');
  if (!result.data) notFound();
  const room = result.data as Room;
  const [songResult, rolesResult, membersResult, claimsResult, assetsResult, recordingsResult] = await Promise.all([
    db.from('songs').select('id,title,artist,duration_seconds').eq('id', room.song_id).single(),
    db.from('song_roles').select('*').eq('song_id', room.song_id).order('position'),
    db.from('room_members').select('room_id,user_id,display_name').eq('room_id', id),
    db.from('room_role_claims').select('room_id,role_id,user_id').eq('room_id', id),
    db.from('media_assets').select('id,label,kind,approved_at,created_at').or(`song_id.eq.${room.song_id},room_id.eq.${id}`).order('created_at', { ascending: false }),
    db.from('room_recordings').select('lyric_id,role_id,asset_id,capture_start_ms,duration_ms,offset_ms').eq('room_id', id),
  ]);
  if (songResult.error || !songResult.data) throw new Error('Şarkı bilgileri yüklenemedi.');
  const sourceSong = songResult.data as Song;
  if (rolesResult.error) throw new Error('Şarkıcı rolleri yüklenemedi.');
  if (membersResult.error) throw new Error('Oda üyeleri yüklenemedi.');
  if (claimsResult.error) throw new Error('Rol sahipleri yüklenemedi. 202609270007_room_role_claims.sql güncellemesini kontrol et.');
  if (assetsResult.error) throw new Error('Özel medya listesi yüklenemedi.');
  const dbRoles = rolesResult.data as DbRole[];
  const members = membersResult.data as Member[];
  const claims = claimsResult.data as RoleClaim[];
  const lyricsResult = dbRoles.length ? await db.from('lyrics').select('*').in('role_id', dbRoles.map(r => r.id)).order('start_ms') : { data: [], error: null };
  if (lyricsResult.error) throw new Error('Sözler yüklenemedi.');
  const allLyrics = lyricsResult.data as Lyric[];
  const recordings = (recordingsResult.data ?? []) as RoomRecording[];
  const roles: SingerRole[] = dbRoles.map(r => {
    const claim = claims.find(c => c.role_id === r.id);
    const member = members.find(m => m.user_id === claim?.user_id);
    const lines = allLyrics.filter(l => l.role_id === r.id);
    const saved = lines.filter(l => recordings.some(t => t.lyric_id === l.id)).length;
    return { id: r.position, roleId: r.id, name: r.name, member: member?.display_name ?? 'Rol boş', initials: (member?.display_name ?? r.name).slice(0, 1).toLocaleUpperCase('tr'), color: r.color, status: member && lines.length && saved === lines.length ? 'complete' : saved ? 'recording' : 'waiting', part: member ? `${saved}/${lines.length} satır kaydedildi` : 'Rol boş' };
  });
  const myRoles = roles.filter(r => claims.some(c => c.role_id === r.roleId && c.user_id === viewer.user.id));
  return { viewer, room, song: { ...sourceSong, duration: timeLabel(sourceSong.duration_seconds * 1000), roomName: room.name }, roles, members, claims, myRoles, lyrics: allLyrics, recordings, recordingSetupReady: !recordingsResult.error, assets: assetsResult.data as Asset[] };
}
