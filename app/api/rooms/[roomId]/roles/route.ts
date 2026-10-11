import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { drainStorageCleanup } from '@/lib/storage-cleanup';
import { isTrustedRequest } from '@/lib/request-origin';

const headers = { 'Cache-Control': 'private, no-store' };
const idSchema = z.uuid();

async function context(params: Promise<{ roomId: string }>) {
  const viewer = await getViewer();
  const { roomId } = await params;
  if (!viewer || !idSchema.safeParse(roomId).success) return null;
  return { viewer, roomId };
}

export async function POST(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  if (!isTrustedRequest(request)) return NextResponse.json({ error: 'Site adresi doğrulanamadı. Yayın adresini kontrol et.' }, { status: 403, headers });
  const state = await context(params);
  if (!state) return NextResponse.json({ error: 'Oda veya oturum doğrulanamadı. Yeniden giriş yap.' }, { status: 403, headers });
  const parsed = z.object({ roleId: idSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Geçersiz rol.' }, { status: 400, headers });
  const result = await state.viewer.db.rpc('claim_room_role', { p_room: state.roomId, p_role: parsed.data.roleId });
  if (result.error) return NextResponse.json({ error: result.error.message.includes('başka birinde') ? 'Bu rol az önce başkası tarafından alındı.' :
    result.error.message.includes('Video işi') ? 'Video işi bitene kadar rol alınamaz.' : 'Rol alınamadı. Odayı yenile veya yeni SQL güncellemesini kontrol et.' }, { status: 409, headers });
  revalidatePath(`/rooms/${state.roomId}`);
  revalidatePath(`/rooms/${state.roomId}/record`);
  return NextResponse.json({ ok: true }, { headers });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  if (!isTrustedRequest(request)) return NextResponse.json({ error: 'Site adresi doğrulanamadı. Yayın adresini kontrol et.' }, { status: 403, headers });
  const state = await context(params);
  if (!state?.viewer.isAdmin) return NextResponse.json({ error: 'Yalnızca yönetici rol sahibini çıkarabilir.' }, { status: 403, headers });
  const parsed = z.object({ roleId: idSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Geçersiz rol.' }, { status: 400, headers });
  const result = await state.viewer.db.rpc('remove_room_role', { p_room: state.roomId, p_role: parsed.data.roleId });
  if (result.error) return NextResponse.json({ error: result.error.message.includes('Video işi') ? 'Video işi bitene kadar rol değiştirilemez.' : 'Rol bırakılamadı. Odayı yenile veya SQL güncellemesini kontrol et.' }, { status: 409, headers });
  const cleanup = await drainStorageCleanup();
  revalidatePath(`/rooms/${state.roomId}`);
  revalidatePath(`/rooms/${state.roomId}/record`);
  revalidatePath(`/rooms/${state.roomId}/final`);
  return NextResponse.json({ ok: true, cleanupPending: cleanup.pending }, { headers });
}
