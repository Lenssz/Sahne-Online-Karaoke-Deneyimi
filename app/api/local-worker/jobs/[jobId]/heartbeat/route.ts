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
  if (!z.uuid().safeParse(jobId).success || !z.uuid().safeParse(leaseId).success)
    return NextResponse.json({ error: 'Geçersiz iş veya işlem anahtarı.' }, { status: 400, headers });
  const result = await db.from('vocal_jobs').update({ updated_at: new Date().toISOString() })
    .eq('id', jobId).eq('lease_id', leaseId!).eq('status', 'processing').select('id').maybeSingle();
  if (result.error) return NextResponse.json({ error: 'İş durumu güncellenemedi.', code: result.error.code }, { status: 503, headers });
  if (!result.data) return NextResponse.json({ error: 'İş artık bu yardımcıya ait değil.' }, { status: 409, headers });
  return NextResponse.json({ status: 'processing' }, { headers });
}
