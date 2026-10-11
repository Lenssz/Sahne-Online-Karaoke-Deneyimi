'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient, isConfigured } from '@/lib/supabase/server';
import type { ActionState } from '@/lib/types';

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

export async function signInAdmin(_: ActionState, form: FormData): Promise<ActionState> {
  if (!isConfigured()) return { error: 'Supabase bağlantısı henüz kurulmadı.' };
  const parsed = z.object({ email: z.email().max(254), password: z.string().min(1).max(256) }).safeParse({
    email: String(form.get('email') ?? '').trim().toLowerCase(),
    password: form.get('password'),
  });
  if (!parsed.success) return { error: 'Yönetici hesabını ve şifreni kontrol et.' };
  const db = await createClient();
  const signed = await db.auth.signInWithPassword(parsed.data);
  if (signed.error) return { error: 'Giriş yapılamadı. Yönetici hesabını ve şifreni kontrol et.' };
  const admin = await db.rpc('is_admin');
  if (admin.error || admin.data !== true) {
    await db.auth.signOut();
    return { error: 'Bu hesap yönetici olarak tanımlı değil.' };
  }
  redirect('/');
}

export async function joinInvite(_: ActionState, form: FormData): Promise<ActionState> {
  if (!isConfigured()) return { error: 'Supabase bağlantısı henüz kurulmadı.' };
  const token = tokenSchema.safeParse(form.get('invite'));
  const name = z.string().trim().min(1).max(80).safeParse(form.get('name'));
  if (!token.success || !name.success) return { error: 'Davet bağlantısını ve adını kontrol et.' };
  const db = await createClient();
  const valid = await db.rpc('invite_link_valid', { p_token: token.data });
  if (valid.error) return { error: 'Davet sistemi hazır değil. Yönetici son SQL güncellemesini uygulamalı.' };
  if (!valid.data) return { error: 'Bu davet geçersiz, kullanılmış veya süresi dolmuş. Yöneticiden yeni bağlantı iste.' };
  const current = await db.auth.getUser();
  let createdAnonymousSession = false;
  if (!current.data.user) {
    const signed = await db.auth.signInAnonymously();
    if (signed.error) return { error: 'Misafir girişi açılamadı. Supabase Authentication ayarlarında Anonymous Sign-Ins seçeneğini etkinleştir.' };
    createdAnonymousSession = true;
  }
  const accepted = await db.rpc('accept_room_invite_link', { p_token: token.data, p_name: name.data });
  if (accepted.error) {
    if (createdAnonymousSession) await db.auth.signOut();
    return { error: 'Davet kabul edilemedi. Bağlantı kullanılmış veya süresi dolmuş olabilir.' };
  }
  redirect(`/rooms/${accepted.data}`);
}

export async function signOut() {
  const db = await createClient();
  await db.auth.signOut();
  redirect('/login');
}
