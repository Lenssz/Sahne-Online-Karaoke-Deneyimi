import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient, isConfigured } from './supabase/server';

export const getViewer = cache(async () => {
  if (!isConfigured()) return null;
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  const admin = await db.rpc('is_admin');
  if (admin.error) throw new Error('Veritabanı erişim kuralları yüklenemedi. Kurulumu kontrol edin.');
  return { db, user, isAdmin: admin.data === true };
});
export async function requireUser() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  return viewer;
}
export async function requireAdmin() {
  const viewer = await requireUser();
  if (!viewer.isAdmin) notFound();
  return viewer;
}
