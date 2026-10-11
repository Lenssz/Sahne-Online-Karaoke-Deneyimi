import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { workerAuthorized, workerClient } from '@/lib/local-worker';
import { FREE_STORAGE_BYTES, MAX_MEDIA_FILE_BYTES, MAX_UPLOAD_BODY_BYTES } from '@/lib/media-limits';
import { readUploadForm } from '@/lib/upload-body';

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!workerAuthorized(request)) return NextResponse.json({ error: 'Yetkisiz işlem.' }, { status: 401, headers });
  const db = workerClient();
  if (!db) return NextResponse.json({ error: 'Yardımcı bağlantısı eksik.' }, { status: 503, headers });
  const { jobId } = await params;
  const lease = request.headers.get('x-worker-lease');
  if (!z.uuid().safeParse(jobId).success || !z.uuid().safeParse(lease).success)
    return NextResponse.json({ error: 'Geçersiz iş.' }, { status: 400, headers });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_UPLOAD_BODY_BYTES)
    return NextResponse.json({ error: 'Final video 50 MB sınırını aşıyor.' }, { status: 413, headers });
  let form: FormData;
  try { form = await readUploadForm(request); }
  catch { return NextResponse.json({ error: 'Final video okunamadı veya çok büyük.' }, { status: 400, headers }); }
  const file = form.get('file');
  if (!(file instanceof File) || file.type !== 'video/mp4' || file.size < 1024 || file.size > MAX_MEDIA_FILE_BYTES)
    return NextResponse.json({ error: '50 MB altında bir MP4 gerekli.' }, { status: 400, headers });
  const job = await db.from('render_jobs').select('id,room_id,status')
    .eq('id', jobId).eq('lease_id', lease!).maybeSingle();
  if (job.error || !job.data || job.data.status !== 'processing')
    return NextResponse.json({ error: 'Render işi artık işlenmiyor.' }, { status: 409, headers });
  const usage = await db.rpc('studio_storage_usage');
  if (usage.error) return NextResponse.json({ error: 'Depolama kotası okunamadı.' }, { status: 503, headers });
  if (Number(usage.data) + file.size > FREE_STORAGE_BYTES)
    return NextResponse.json({ error: 'Özel depolama kotası dolu.' }, { status: 413, headers });
  const path = `${job.data.room_id}/final/${randomUUID()}.mp4`;
  const asset = await db.from('media_assets').insert({
    room_id: job.data.room_id, kind: 'final', object_path: path, label: 'Final video',
  }).select('id').single();
  if (asset.error) return NextResponse.json({ error: 'Final video kaydı oluşturulamadı.' }, { status: 503, headers });
  const uploaded = await db.storage.from('studio-private').upload(path, file, { contentType: 'video/mp4', upsert: false });
  if (uploaded.error) {
    await db.storage.from('studio-private').remove([path]);
    await db.from('media_assets').delete().eq('id', asset.data.id);
    return NextResponse.json({ error: 'Final video yüklenemedi.' }, { status: 503, headers });
  }
  const complete = await db.from('render_jobs').update({
    status: 'ready', result_asset_id: asset.data.id, error_message: null,
    lease_id: null, updated_at: new Date().toISOString(),
  }).eq('id', jobId).eq('lease_id', lease!).eq('status', 'processing')
    .is('result_asset_id', null).select('id').maybeSingle();
  if (complete.error || !complete.data) {
    await db.storage.from('studio-private').remove([path]);
    await db.from('media_assets').delete().eq('id', asset.data.id);
    return NextResponse.json({ error: 'İş durumu değişti. Sonuç kaydedilemedi.' }, { status: 409, headers });
  }
  revalidatePath(`/rooms/${job.data.room_id}/final`);
  return NextResponse.json({ asset_id: asset.data.id }, { status: 201, headers });
}
