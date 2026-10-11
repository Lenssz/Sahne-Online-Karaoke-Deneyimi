import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { FREE_STORAGE_BYTES, MAX_MEDIA_FILE_BYTES, MAX_UPLOAD_BODY_BYTES } from '@/lib/media-limits';
import { createServiceClient } from '@/lib/supabase/service';
import { timeLabel } from '@/lib/types';
import { readUploadForm } from '@/lib/upload-body';
import { isTrustedRequest } from '@/lib/request-origin';

const privateHeaders = { 'Cache-Control': 'private, no-store' };
const uploadFields = z.object({
  lyric_id: z.uuid(),
  capture_start_ms: z.string().regex(/^\d{1,8}$/).transform(Number),
  duration_ms: z.string().regex(/^\d{1,8}$/).transform(Number),
});
const audioTypes: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
};

function sameOrigin(request: Request) {
  return isTrustedRequest(request);
}

async function readSmallJson(request: Request) {
  if (!request.body || Number(request.headers.get('content-length') ?? 0) > 2048) throw new Error('body');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); throw new Error('body'); }
      text += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(text + decoder.decode());
}

export async function POST(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Geçersiz kaynak.' }, { status: 403, headers: privateHeaders });
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401, headers: privateHeaders });
  const { roomId } = await params;
  if (!z.uuid().safeParse(roomId).success) return NextResponse.json({ error: 'Oda bulunamadı.' }, { status: 404, headers: privateHeaders });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_UPLOAD_BODY_BYTES)
    return NextResponse.json({ error: 'Kayıt 50 MB sınırını aşıyor.' }, { status: 413, headers: privateHeaders });

  let form: FormData;
  try { form = await readUploadForm(request); }
  catch { return NextResponse.json({ error: 'Kayıt okunamadı veya 50 MB sınırını aşıyor.' }, { status: 400, headers: privateHeaders }); }
  const fields = uploadFields.safeParse({
    lyric_id: form.get('lyric_id'),
    capture_start_ms: form.get('capture_start_ms'),
    duration_ms: form.get('duration_ms'),
  });
  const file = form.get('file');
  const mime = file instanceof File ? file.type.split(';')[0].toLowerCase() : '';
  if (!fields.success || !(file instanceof File) || file.size < 100 || file.size > MAX_MEDIA_FILE_BYTES || !audioTypes[mime])
    return NextResponse.json({ error: 'Mikrofon kaydı geçersiz. WebM, OGG veya M4A ses dosyası gerekli.' }, { status: 400, headers: privateHeaders });

  const memberResult = await viewer.db.from('room_members').select('user_id')
    .eq('room_id', roomId).eq('user_id', viewer.user.id).maybeSingle();
  if (memberResult.error || !memberResult.data)
    return NextResponse.json({ error: 'Bu odanın üyesi değilsin.' }, { status: 403, headers: privateHeaders });
  const lineResult = await viewer.db.from('lyrics').select('id,role_id,start_ms,end_ms')
    .eq('id', fields.data.lyric_id).maybeSingle();
  const line = lineResult.data;
  if (lineResult.error || !line)
    return NextResponse.json({ error: 'Söz satırı bulunamadı.' }, { status: 404, headers: privateHeaders });
  const claim = await viewer.db.from('room_role_claims').select('role_id').eq('room_id', roomId)
    .eq('role_id', line.role_id).eq('user_id', viewer.user.id).maybeSingle();
  if (claim.error || !claim.data)
    return NextResponse.json({ error: 'Bu rolü önce oda sayfasından almalısın.' }, { status: 403, headers: privateHeaders });
  if (fields.data.capture_start_ms < Math.max(0, line.start_ms - 5000)
    || fields.data.capture_start_ms > line.start_ms + 500
    || fields.data.duration_ms < 200)
    return NextResponse.json({ error: 'Kayıt zamanı söz satırıyla eşleşmiyor.' }, { status: 400, headers: privateHeaders });

  const earlier = await viewer.db.from('lyrics').select('id').eq('role_id', line.role_id).lt('start_ms', line.start_ms);
  if (earlier.error) return NextResponse.json({ error: 'Kayıt sırası okunamadı.' }, { status: 503, headers: privateHeaders });
  if (earlier.data.length) {
    const saved = await viewer.db.from('room_recordings').select('lyric_id').eq('room_id', roomId)
      .in('lyric_id', earlier.data.map(item => item.id));
    if (saved.error) return NextResponse.json({ error: 'Kayıt veritabanı güncellemesini uygula.' }, { status: 503, headers: privateHeaders });
    const savedIds = new Set(saved.data.map(item => item.lyric_id));
    if (earlier.data.some(item => !savedIds.has(item.id)))
      return NextResponse.json({ error: 'Önce önceki söz satırını kaydet.' }, { status: 409, headers: privateHeaders });
  }

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: 'Özel dosya bağlantısı yapılandırılmadı.' }, { status: 503, headers: privateHeaders });
  const usage = await service.rpc('studio_storage_usage');
  if (usage.error) return NextResponse.json({ error: 'Depolama kotası okunamadı.' }, { status: 503, headers: privateHeaders });
  if (Number(usage.data) + file.size > FREE_STORAGE_BYTES)
    return NextResponse.json({ error: 'Özel depolama kotasında yeterli yer yok.' }, { status: 413, headers: privateHeaders });

  const path = `${roomId}/recordings/${line.role_id}/${fields.data.lyric_id}/${randomUUID()}.${audioTypes[mime]}`;
  const upload = await service.storage.from('studio-private').upload(path, file, { contentType: mime, upsert: false });
  if (upload.error) return NextResponse.json({ error: 'Kayıt özel depolamaya yüklenemedi.' }, { status: 503, headers: privateHeaders });
  const asset = await service.from('media_assets').insert({ room_id: roomId, kind: 'recording', object_path: path, label: `Ses kaydı · ${timeLabel(line.start_ms)}` }).select('id').single();
  if (asset.error) {
    await service.storage.from('studio-private').remove([path]);
    return NextResponse.json({ error: 'Kayıt bilgisi kaydedilemedi.' }, { status: 503, headers: privateHeaders });
  }
  const completed = await service.rpc('finalize_room_recording', {
    p_room: roomId, p_lyric: line.id, p_user: viewer.user.id, p_asset: asset.data.id,
    p_capture_start_ms: fields.data.capture_start_ms, p_duration_ms: fields.data.duration_ms,
  });
  if (completed.error) {
    await service.from('media_assets').delete().eq('id', asset.data.id);
    await service.storage.from('studio-private').remove([path]);
    const error = completed.error.message.includes('Video oluşturulurken kayıt değiştirilemez')
      ? 'Video oluşturulurken yeniden kayıt yapılamaz. İş bitince tekrar dene.'
      : 'Kayıt sırası veya rol değişti. Sayfayı yenileyip tekrar dene.';
    return NextResponse.json({ error }, { status: 409, headers: privateHeaders });
  }
  const oldAssetId = completed.data as string | null;
  if (oldAssetId && oldAssetId !== asset.data.id) {
    const old = await service.from('media_assets').select('object_path').eq('id', oldAssetId).maybeSingle();
    if (old.data?.object_path) {
      const removed = await service.storage.from('studio-private').remove([old.data.object_path]);
      if (!removed.error) await service.from('media_assets').delete().eq('id', oldAssetId);
    }
  }
  revalidatePath(`/rooms/${roomId}`);
  revalidatePath(`/rooms/${roomId}/record`);
  revalidatePath(`/rooms/${roomId}/final`);
  return NextResponse.json({ recording: {
    lyric_id: line.id, role_id: line.role_id, asset_id: asset.data.id,
    capture_start_ms: fields.data.capture_start_ms, duration_ms: fields.data.duration_ms, offset_ms: 0,
  } }, { status: 201, headers: privateHeaders });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Geçersiz kaynak.' }, { status: 403, headers: privateHeaders });
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401, headers: privateHeaders });
  const { roomId } = await params;
  if (!z.uuid().safeParse(roomId).success) return NextResponse.json({ error: 'Oda bulunamadı.' }, { status: 404, headers: privateHeaders });
  let body: unknown;
  try { body = await readSmallJson(request); }
  catch { return NextResponse.json({ error: 'Geçersiz zaman düzeltmesi.' }, { status: 400, headers: privateHeaders }); }
  const parsed = z.object({ lyric_id: z.uuid(), offset_ms: z.number().int().min(-500).max(500) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Zaman düzeltmesi ±500 ms içinde olmalı.' }, { status: 400, headers: privateHeaders });
  const result = await viewer.db.rpc('set_room_recording_offset', {
    p_room: roomId, p_lyric: parsed.data.lyric_id, p_offset_ms: parsed.data.offset_ms,
  });
  if (result.error) {
    const error = result.error.message.includes('Video oluşturulurken kayıt değiştirilemez')
      ? 'Video oluşturulurken zaman düzeltilemez. İş bitince tekrar dene.'
      : 'Yalnızca kendi kaydının zamanını düzeltebilirsin.';
    return NextResponse.json({ error }, { status: 403, headers: privateHeaders });
  }
  revalidatePath(`/rooms/${roomId}/record`);
  return NextResponse.json({ offset_ms: parsed.data.offset_ms }, { headers: privateHeaders });
}
