import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { drainStorageCleanup } from '@/lib/storage-cleanup';
import { isTrustedRequest } from '@/lib/request-origin';

const headers = { 'Cache-Control': 'private, no-store' };
export async function DELETE(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: 'Yalnızca yönetici üye çıkarabilir.' }, { status: 403, headers });
  if (!isTrustedRequest(request))
    return NextResponse.json({ error: 'Geçersiz kaynak.' }, { status: 403, headers });
  const { roomId } = await params;
  const parsed = z.object({ userId: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(roomId).success || !parsed.success)
    return NextResponse.json({ error: 'Geçersiz oda veya üye.' }, { status: 400, headers });
  const result = await viewer.db.rpc('remove_room_member', { p_room: roomId, p_user: parsed.data.userId });
  if (result.error) return NextResponse.json({ error: result.error.message.includes('kurucusu') ? 'Oda kurucusu çıkarılamaz.' :
    result.error.message.includes('Video işi') ? 'Video işi bitene kadar üye çıkarılamaz.' : 'Üye çıkarılamadı. Odayı yenile veya SQL güncellemesini kontrol et.' }, { status: 409, headers });
  const cleanup = await drainStorageCleanup();
  revalidatePath(`/rooms/${roomId}`);
  revalidatePath(`/rooms/${roomId}/record`);
  revalidatePath(`/rooms/${roomId}/final`);
  return NextResponse.json({ ok: true, cleanupPending: cleanup.pending }, { headers });
}
