import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { isTrustedRequest } from '@/lib/request-origin';

const schema = z.object({
  title: z.string().trim().min(1).max(160),
  artist: z.string().trim().min(1).max(160),
  duration_seconds: z.number().int().min(1).max(7200),
  roles: z.array(z.object({ name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).min(1).max(24),
  lyrics: z.array(z.object({ role_position: z.number().int().min(1).max(24), start_ms: z.number().int().min(0), end_ms: z.number().int().positive(), text: z.string().trim().min(1).max(1000) })).max(500),
}).superRefine((data, context) => {
  for (const [index, line] of data.lyrics.entries()) {
    if (line.role_position > data.roles.length || line.end_ms <= line.start_ms || line.end_ms > data.duration_seconds * 1000) {
      context.addIssue({ code: 'custom', path: ['lyrics', index], message: 'Söz zamanı veya rolü geçersiz.' });
    }
  }
});

async function readSmallJson(request: Request) {
  const limit = 128 * 1024;
  if (!request.body || Number(request.headers.get('content-length') ?? 0) > limit) throw new Error('too large');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('too large'); }
      text += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(text + decoder.decode());
}

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!isTrustedRequest(request))
    return NextResponse.json({ error: 'Geçersiz kaynak.' }, { status: 403, headers });
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: 'Yetkisiz işlem.' }, { status: 403, headers });
  let body: unknown;
  try { body = await readSmallJson(request); }
  catch { return NextResponse.json({ error: 'Şarkı bilgileri okunamadı.' }, { status: 400, headers }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Şarkı, roller ve söz zamanlarını kontrol et.' }, { status: 400, headers });
  const { title, artist, duration_seconds, roles, lyrics } = parsed.data;
  const result = await viewer.db.rpc('create_studio_song_v2', {
    p_title: title, p_artist: artist, p_duration: duration_seconds, p_roles: roles, p_lyrics: lyrics,
  });
  if (result.error) return NextResponse.json({ error: 'Şarkı kaydedilemedi. Son veritabanı güncellemesini ve söz zamanlarını kontrol et.' }, { status: 400, headers });
  revalidatePath('/admin/songs');
  return NextResponse.json({ id: result.data }, { status: 201, headers });
}
