import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { isTrustedRequest } from '@/lib/request-origin';

const headers = { 'Cache-Control': 'private, no-store' };
type Context = { params: Promise<{ roomId: string }> };

export async function GET(_: Request, { params }: Context) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401, headers });
  const { roomId } = await params;
  if (!z.uuid().safeParse(roomId).success) return NextResponse.json({ error: 'Oda bulunamadı.' }, { status: 404, headers });
  const room = await viewer.db.from('rooms').select('id').eq('id', roomId).maybeSingle();
  if (room.error || !room.data) return NextResponse.json({ error: 'Oda bulunamadı.' }, { status: 404, headers });
  const result = await viewer.db.from('render_jobs').select('id,status,error_message,result_asset_id,created_at,updated_at')
    .eq('room_id', roomId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (result.error) return NextResponse.json({ error: 'Render veritabanı güncellemesini uygula.' }, { status: 503, headers });
  return NextResponse.json({ job: result.data }, { headers });
}

export async function POST(request: Request, { params }: Context) {
  if (!isTrustedRequest(request))
    return NextResponse.json({ error: 'Geçersiz kaynak.' }, { status: 403, headers });
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: 'Yalnızca yönetici video oluşturabilir.' }, { status: 403, headers });
  const { roomId } = await params;
  if (!z.uuid().safeParse(roomId).success) return NextResponse.json({ error: 'Oda bulunamadı.' }, { status: 404, headers });
  const room = await viewer.db.from('rooms').select('id').eq('id', roomId).maybeSingle();
  if (room.error || !room.data) return NextResponse.json({ error: 'Bu odaya erişimin yok.' }, { status: 404, headers });
  const result = await viewer.db.rpc('enqueue_render_job', { p_room: roomId });
  if (result.error) {
    const known = ['Tüm şarkıcı rolleri alınmalı', 'Her rol için söz satırı gerekli',
      'Önce tüm söz satırları kaydedilmeli', 'Bir mikrofon kaydı depolamada bulunamadı',
      'Klip ve onaylı altyapı gerekli'];
    const reason = known.find(item => result.error!.message.includes(item));
    return NextResponse.json({ error: reason ?? 'Render işi oluşturulamadı. Veritabanı güncellemesini kontrol et.' }, { status: 409, headers });
  }
  revalidatePath(`/rooms/${roomId}/final`);
  return NextResponse.json({ job_id: result.data, status: 'waiting' }, { status: 201, headers });
}
