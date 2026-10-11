'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireAdmin } from '@/lib/auth';
import { isTrustedOrigin } from '@/lib/request-origin';
import type { ActionState } from '@/lib/types';

const uuid = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const fields = (form: FormData) => Object.fromEntries(form.entries());
const failed = { error: 'Kaydedilemedi. Alanları, rol atamasını ve zaman aralıklarını kontrol et.' };

export async function createSong(_: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireAdmin();
  const parsed = z.object({ title: text(160), artist: text(160), duration: z.coerce.number().int().min(1).max(7200) }).safeParse(fields(form));
  if (!parsed.success) return failed;
  const { title, artist, duration } = parsed.data;
  const result = await db.rpc('create_studio_song', { p_title: title, p_artist: artist, p_duration: duration });
  if (result.error) return failed;
  revalidatePath('/admin/songs');
  redirect(`/admin/songs/${result.data}`);
}
export async function saveRole(_: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireAdmin();
  const parsed = z.object({ id: uuid, name: text(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).safeParse(fields(form));
  if (!parsed.success) return failed;
  const { id, ...values } = parsed.data;
  const result = await db.from('song_roles').update(values).eq('id', id).select('id').single();
  if (result.error) return failed;
  revalidatePath('/', 'layout');
  return { success: 'Rol kaydedildi.' };
}
export async function saveLyric(_: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireAdmin();
  const parsed = z.object({ role_id: uuid, start_ms: z.coerce.number().int().min(0).max(7200000), end_ms: z.coerce.number().int().min(1).max(7200000), text: text(1000) }).refine(v => v.end_ms > v.start_ms).safeParse(fields(form));
  if (!parsed.success) return failed;
  const result = await db.from('lyrics').upsert(parsed.data, { onConflict: 'role_id,start_ms' });
  if (result.error) return failed;
  revalidatePath('/', 'layout');
  return { success: 'Söz satırı kaydedildi.' };
}
export async function deleteLyric(_: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireAdmin();
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) return failed;
  const result = await db.from('lyrics').delete().eq('id', id.data);
  if (result.error) return failed;
  revalidatePath('/', 'layout');
  return { success: 'Satır silindi.' };
}
export async function createRoom(_: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireAdmin();
  const parsed = z.object({ song_id: uuid, name: text(120) }).safeParse(fields(form));
  if (!parsed.success) return failed;
  const result = await db.rpc('create_studio_room', { p_song: parsed.data.song_id, p_name: parsed.data.name });
  if (result.error) return failed;
  revalidatePath('/');
  redirect(`/rooms/${result.data}`);
}
export async function inviteRoom(_: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireAdmin();
  const parsed = z.object({ room_id: uuid }).safeParse(fields(form));
  if (!parsed.success) return failed;
  const requestHeaders = await headers();
  if (!isTrustedOrigin(requestHeaders)) {
    return { error: 'Davet bağlantısı oluşturulmadı: APP_URL hâlâ farklı bir adresi gösteriyor. .env.local dosyasında APP_URL değerini bu sitenin HTTPS adresi yapıp sunucuyu yeniden başlat.' };
  }
  // Use the verified browser origin so a local test never points to an old tunnel.
  const siteOrigin = requestHeaders.get('origin')!;
  const result = await db.rpc('create_room_invite_link', { p_room: parsed.data.room_id });
  if (result.error || !z.string().regex(/^[a-f0-9]{64}$/).safeParse(result.data).success)
    return { error: 'Davet oluşturulamadı. Yeni SQL güncellemesini kontrol et.' };
  revalidatePath(`/rooms/${parsed.data.room_id}`);
  return { success: 'Tek kullanımlık oda daveti hazır. Arkadaşın katıldıktan sonra rol seçebilir.', url: `${siteOrigin}/invite#token=${result.data}` };
}
export async function revokeInvite(_: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireAdmin();
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) return failed;
  const result = await db.rpc('revoke_room_invite', { p_id: id.data });
  if (result.error) return failed;
  revalidatePath('/', 'layout');
  return { success: 'Davet iptal edildi.' };
}
