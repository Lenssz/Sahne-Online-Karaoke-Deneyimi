import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { workerAuthorized, workerClient } from '@/lib/local-worker';
import { readUploadForm } from '@/lib/upload-body';
import { FREE_STORAGE_BYTES, MAX_MEDIA_FILE_BYTES, MAX_UPLOAD_BODY_BYTES } from '@/lib/media-limits';

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!workerAuthorized(request)) return NextResponse.json({ error: 'Yetkisiz işlem.' }, { status: 401, headers });
  const db = workerClient();
  if (!db) return NextResponse.json({ error: 'Yerel yardımcı bağlantısı yapılandırılmadı.' }, { status: 503, headers });
  const { jobId } = await params;
  const leaseId = request.headers.get('x-worker-lease');
  if (!z.uuid().safeParse(jobId).success || !z.uuid().safeParse(leaseId).success) return NextResponse.json({ error: 'Geçersiz iş veya işlem anahtarı.' }, { status: 400, headers });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_UPLOAD_BODY_BYTES) return NextResponse.json({ error: 'En fazla 50 MB yüklenebilir.' }, { status: 413, headers });
  let form: FormData;
  try { form = await readUploadForm(request); }
  catch { return NextResponse.json({ error: 'Geçersiz veya büyük dosya.' }, { status: 400, headers }); }
  const file = form.get('file');
  if (!(file instanceof File) || !file.size || file.size > MAX_MEDIA_FILE_BYTES || !['audio/mpeg','audio/wav','audio/x-wav','audio/webm','audio/ogg'].includes(file.type))
    return NextResponse.json({ error: 'MP3, WAV, WebM veya OGG ses dosyası gerekli (en fazla 50 MB).' }, { status: 400, headers });
  const job = await db.from('vocal_jobs').select('id,song_id,status').eq('id', jobId).eq('lease_id', leaseId!).maybeSingle();
  if (job.error || !job.data || job.data.status !== 'processing') return NextResponse.json({ error: 'İş işleniyor durumunda değil.' }, { status: 409, headers });
  const usage = await db.rpc('studio_storage_usage');
  if (usage.error) return NextResponse.json({ error: 'Depolama kotası okunamadı.' }, { status: 503, headers });
  if (Number(usage.data) + file.size > FREE_STORAGE_BYTES) return NextResponse.json({ error: 'Ücretsiz depolama kotası dolu.' }, { status: 413, headers });
  const path = `${job.data.song_id}/${randomUUID()}`;
  const asset = await db.from('media_assets').insert({ song_id: job.data.song_id, kind: 'instrumental', object_path: path, label: 'Vokal ayırma sonucu' }).select('id').single();
  if (asset.error) return NextResponse.json({ error: 'Sonuç kaydı oluşturulamadı.' }, { status: 503, headers });
  const uploaded = await db.storage.from('studio-private').upload(path, file, { contentType: file.type, upsert: false });
  if (uploaded.error) {
    await db.storage.from('studio-private').remove([path]);
    await db.from('media_assets').delete().eq('id', asset.data.id);
    return NextResponse.json({ error: 'Sonuç yüklenemedi.' }, { status: 503, headers });
  }
  const complete = await db.from('vocal_jobs').update({ status: 'ready', result_asset_id: asset.data.id, error_message: null, lease_id: null, updated_at: new Date().toISOString() }).eq('id', jobId).eq('lease_id', leaseId!).eq('status', 'processing').is('result_asset_id', null).select('id').maybeSingle();
  if (complete.error || !complete.data) {
    await db.storage.from('studio-private').remove([path]);
    await db.from('media_assets').delete().eq('id', asset.data.id);
    return NextResponse.json({ error: 'İş durumu değişti; sonuç kaydedilemedi.' }, { status: 409, headers });
  }
  return NextResponse.json({ asset_id: asset.data.id }, { status: 201, headers });
}
