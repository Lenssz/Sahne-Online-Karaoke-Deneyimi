import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { drainStorageCleanup } from '@/lib/storage-cleanup';

export async function DELETE(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: 'Yalnızca yönetici oda silebilir.' }, { status: 403, headers });
  const { roomId } = await params;
  if (!z.uuid().safeParse(roomId).success) return NextResponse.json({ error: 'Geçersiz oda.' }, { status: 400, headers });
  const input = await request.json().catch(() => null);
  const parsed = z.object({ name: z.string().min(1).max(120) }).safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: 'Oda adını yazarak onayla.' }, { status: 400, headers });
  const deleted = await viewer.db.rpc('delete_studio_room', { p_room: roomId, p_expected_name: parsed.data.name });
  if (deleted.error) {
    const message = deleted.error.message;
    const error = message.includes('Video işi sürerken') ? 'Video işi sürerken oda silinemez.'
      : message.includes('adı eşleşmiyor') ? 'Yazdığın oda adı eşleşmiyor.'
      : message.includes('bulunamadı') ? 'Oda bulunamadı.' : 'Oda silinemedi. SQL güncellemesini ve bağlantıyı kontrol et.';
    return NextResponse.json({ error }, { status: 409, headers });
  }
  const cleanup = await drainStorageCleanup();
  revalidatePath('/');
  revalidatePath(`/rooms/${roomId}`);
  return NextResponse.json({ deleted: true, cleanupPending: cleanup.pending }, { headers });
}
