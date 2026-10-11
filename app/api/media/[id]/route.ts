import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  if (!viewer) return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401, headers });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404, headers });
  // Both metadata and Storage SELECT are checked against this user's RLS policies.
  const asset = await viewer.db.from('media_assets').select('object_path,kind').eq('id', id).maybeSingle();
  if (asset.error || !asset.data) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404, headers });
  const download = new URL(request.url).searchParams.has('download');
  if (download && asset.data.kind !== 'final') return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404, headers });
  const signed = await viewer.db.storage.from('studio-private').createSignedUrl(
    asset.data.object_path,
    300,
    download ? { download: `sahne-final-${id}.mp4` } : undefined,
  );
  if (signed.error) return NextResponse.json({ error: 'Dosya açılamadı.' }, { status: 404, headers });
  return new NextResponse(null, { status: 307, headers: { ...headers, Location: signed.data.signedUrl } });
}
