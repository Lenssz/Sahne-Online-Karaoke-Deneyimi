import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { isTrustedRequest } from '@/lib/request-origin';
import { readUploadForm } from '@/lib/upload-body';
import { FREE_STORAGE_BYTES, MAX_MEDIA_FILE_BYTES, MAX_UPLOAD_BODY_BYTES } from '@/lib/media-limits';

export async function POST(request: Request) {
  if (!isTrustedRequest(request)) return NextResponse.json({ error: 'Geçersiz kaynak.' }, { status: 403 });
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: 'Yetkisiz işlem.' }, { status: 403 });
  const headers = { 'Cache-Control': 'private, no-store' };
  if (Number(request.headers.get('content-length') ?? 0) > MAX_UPLOAD_BODY_BYTES) return NextResponse.json({ error: 'En fazla 50 MB yüklenebilir.' }, { status: 413, headers });
  let form: FormData;
  try { form = await readUploadForm(request); } catch { return NextResponse.json({ error: 'Geçersiz veya çok büyük yükleme (en fazla 50 MB).' }, { status: 400, headers }); }
  const data = z.object({ song_id: z.uuid(), kind: z.enum(['clip', 'instrumental']) }).safeParse(Object.fromEntries(form));
  const file = form.get('file');
  if (!data.success || !(file instanceof File) || !file.size || file.size > MAX_MEDIA_FILE_BYTES || file.name.length > 160) return NextResponse.json({ error: 'Dosya bilgilerini kontrol et (en fazla 50 MB).' }, { status: 400, headers });
  const allowed = data.data.kind === 'clip' ? ['video/mp4','video/webm'] : ['audio/mpeg','audio/wav','audio/x-wav','audio/webm','audio/ogg'];
  if (!allowed.includes(file.type)) return NextResponse.json({ error: 'Desteklenmeyen dosya türü.' }, { status: 400, headers });
  const usage = await viewer.db.rpc('studio_storage_usage');
  if (usage.error) return NextResponse.json({ error: 'Depolama kotası okunamadı. Son veritabanı güncellemesini uygula.' }, { status: 503, headers });
  if (Number(usage.data) + file.size > FREE_STORAGE_BYTES) return NextResponse.json({ error: 'Ücretsiz 1 GB depolama kotasında yeterli yer yok.' }, { status: 413, headers });
  const path = `${data.data.song_id}/${randomUUID()}`;
  const asset = await viewer.db.from('media_assets').insert({ ...data.data, object_path: path, label: file.name }).select('id').single();
  if (asset.error) return NextResponse.json({ error: 'Dosya kaydı oluşturulamadı.' }, { status: 400, headers });
  const upload = await viewer.db.storage.from('studio-private').upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) {
    await viewer.db.storage.from('studio-private').remove([path]);
    await viewer.db.from('media_assets').delete().eq('id', asset.data.id);
    return NextResponse.json({ error: 'Yükleme başarısız. Tekrar dene.' }, { status: 400, headers });
  }
  return NextResponse.json({ id: asset.data.id }, { status: 201, headers });
}
