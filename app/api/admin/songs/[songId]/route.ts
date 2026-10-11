import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { drainStorageCleanup } from '@/lib/storage-cleanup';

export async function DELETE(request: Request, { params }: { params: Promise<{ songId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: 'Yalnızca yönetici şarkı silebilir.' }, { status: 403, headers });
  const { songId } = await params;
  if (!z.uuid().safeParse(songId).success) return NextResponse.json({ error: 'Geçersiz şarkı.' }, { status: 400, headers });
  const input = await request.json().catch(() => null);
  const parsed = z.object({ name: z.string().min(1).max(160) }).safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: 'Şarkı adını yazarak onayla.' }, { status: 400, headers });
  const deleted = await viewer.db.rpc('delete_studio_song', { p_song: songId, p_expected_title: parsed.data.name });
  if (deleted.error) {
    const message = deleted.error.message;
    const error = message.includes('Önce bu şarkının odalarını sil') ? 'Önce bu şarkının odalarını sil.'
      : message.includes('Vokal işi sürerken') ? 'Vokal işi sürerken şarkı silinemez.'
      : message.includes('adı eşleşmiyor') ? 'Yazdığın şarkı adı eşleşmiyor.'
      : message.includes('bulunamadı') ? 'Şarkı bulunamadı.' : 'Şarkı silinemedi. SQL güncellemesini ve bağlantıyı kontrol et.';
    return NextResponse.json({ error }, { status: 409, headers });
  }
  const cleanup = await drainStorageCleanup();
  revalidatePath('/');
  revalidatePath('/admin/songs');
  revalidatePath(`/admin/songs/${songId}`);
  return NextResponse.json({ deleted: true, cleanupPending: cleanup.pending }, { headers });
}
