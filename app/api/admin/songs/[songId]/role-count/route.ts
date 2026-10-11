import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';

export async function PATCH(request: Request, { params }: { params: Promise<{ songId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: 'Yalnızca yönetici rol sayısını değiştirebilir.' }, { status: 403, headers });
  const { songId } = await params;
  if (!z.uuid().safeParse(songId).success) return NextResponse.json({ error: 'Geçersiz şarkı.' }, { status: 400, headers });
  const input = await request.json().catch(() => null);
  const parsed = z.object({ count: z.number().int().min(1).max(24), expectedRemovedLines: z.number().int().min(0) }).safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: 'Rol sayısı 1–24 arasında olmalı.' }, { status: 400, headers });
  const result = await viewer.db.rpc('set_studio_role_count', {
    p_song: songId, p_count: parsed.data.count, p_expected_removed_lines: parsed.data.expectedRemovedLines,
  });
  if (result.error) {
    const message = result.error.message;
    const error = message.includes('Bağlı oda') ? 'Bağlı odalar silinmeden rol sayısı değiştirilemez.'
      : message.includes('söz sayısı değişti') ? 'Silinecek söz sayısı değişti. Sayfayı yenileyip tekrar onayla.'
      : 'Rol sayısı değiştirilemedi. SQL güncellemesini kontrol et.';
    return NextResponse.json({ error }, { status: 409, headers });
  }
  revalidatePath('/admin/songs');
  revalidatePath(`/admin/songs/${songId}`);
  return NextResponse.json({ count: parsed.data.count }, { headers });
}
