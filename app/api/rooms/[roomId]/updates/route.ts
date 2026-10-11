import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { getRoom } from '@/lib/studio';
import { roomRevision } from '@/lib/room-revision';

export async function GET(_: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401, headers });
  const { roomId } = await params;
  if (!z.uuid().safeParse(roomId).success) return NextResponse.json({ error: 'Oda bulunamadı.' }, { status: 404, headers });
  // getRoom checks the room and every related table using the viewer's RLS policies.
  // A removed member receives 404 rather than any room data.
  const state = await getRoom(roomId, viewer);
  const [render, invites] = await Promise.all([
    viewer.db.from('render_jobs').select('id,status,error_message,result_asset_id')
      .eq('room_id', roomId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    viewer.isAdmin ? viewer.db.from('room_invites').select('id,expires_at').eq('room_id', roomId)
      .is('role_id', null).is('email', null).is('accepted_at', null).is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()) : Promise.resolve(null),
  ]);
  if (render.error || invites?.error) return NextResponse.json({ error: 'Oda güncellenemedi.' }, { status: 503, headers });
  return NextResponse.json({
    revision: roomRevision(state, render.data, invites?.data ?? []),
    members: state.members.map(member => ({ user_id: member.user_id, display_name: member.display_name })),
  }, { headers });
}
