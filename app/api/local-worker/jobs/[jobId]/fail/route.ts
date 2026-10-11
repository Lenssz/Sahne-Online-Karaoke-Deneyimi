import { NextResponse } from 'next/server';
import { z } from 'zod';
import { workerAuthorized, workerClient } from '@/lib/local-worker';

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!workerAuthorized(request)) return NextResponse.json({ error: 'Yetkisiz işlem.' }, { status: 401, headers });
  const db = workerClient();
  if (!db) return NextResponse.json({ error: 'Yerel yardımcı bağlantısı yapılandırılmadı.' }, { status: 503, headers });
  const { jobId } = await params;
  const leaseId = request.headers.get('x-worker-lease');
  if (!z.uuid().safeParse(jobId).success || !z.uuid().safeParse(leaseId).success) return NextResponse.json({ error: 'Geçersiz iş veya işlem anahtarı.' }, { status: 400, headers });
  if (Number(request.headers.get('content-length') ?? 0) > 1024) return NextResponse.json({ error: 'Açıklama çok uzun.' }, { status: 413, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Geçersiz açıklama.' }, { status: 400, headers }); }
  const parsed = z.object({ error: z.string().trim().min(1).max(300) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Geçersiz açıklama.' }, { status: 400, headers });
  const result = await db.from('vocal_jobs').update({ status: 'error', error_message: parsed.data.error, lease_id: null, updated_at: new Date().toISOString() }).eq('id', jobId).eq('lease_id', leaseId!).eq('status', 'processing').select('id').maybeSingle();
  if (result.error || !result.data) return NextResponse.json({ error: 'İş bulunamadı veya durumu değişti.' }, { status: 409, headers });
  return NextResponse.json({ status: 'error' }, { headers });
}
