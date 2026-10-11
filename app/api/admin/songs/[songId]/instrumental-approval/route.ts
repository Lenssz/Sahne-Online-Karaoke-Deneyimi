import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { isTrustedRequest } from '@/lib/request-origin';

export async function POST(request: Request, { params }: { params: Promise<{ songId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!isTrustedRequest(request))
    return NextResponse.json({ error: 'Geçersiz kaynak.' }, { status: 403, headers });
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: 'Yetkisiz işlem.' }, { status: 403, headers });
  const { songId } = await params;
  if (!z.uuid().safeParse(songId).success) return NextResponse.json({ error: 'Geçersiz şarkı.' }, { status: 400, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400, headers }); }
  const parsed = z.object({ asset_id: z.uuid() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Geçersiz altyapı.' }, { status: 400, headers });
  const result = await viewer.db.rpc('approve_song_instrumental', { p_song: songId, p_asset: parsed.data.asset_id });
  if (result.error) return NextResponse.json({ error: 'Altyapı onaylanamadı. Dosyayı ve veritabanı kurulumunu kontrol et.' }, { status: 400, headers });
  revalidatePath(`/admin/songs/${songId}`);
  revalidatePath('/', 'layout');
  return NextResponse.json({ approved: true }, { headers });
}
