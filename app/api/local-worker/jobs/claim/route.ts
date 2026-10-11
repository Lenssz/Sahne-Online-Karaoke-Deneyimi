import { NextResponse } from 'next/server';
import { workerAuthorized, workerClient } from '@/lib/local-worker';

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!workerAuthorized(request)) return NextResponse.json({ error: 'Yetkisiz işlem.' }, { status: 401, headers });
  const db = workerClient();
  if (!db) return NextResponse.json({ error: 'Yerel yardımcı bağlantısı yapılandırılmadı.' }, { status: 503, headers });
  const claimed = await db.rpc('claim_vocal_job');
  if (claimed.error) return NextResponse.json({ error: 'İş sırası okunamadı.' }, { status: 503, headers });
  const job = claimed.data?.[0] as { job_id: string; source_path: string; lease_id: string } | undefined;
  if (!job) return new Response(null, { status: 204, headers });
  const signed = await db.storage.from('studio-private').createSignedUrl(job.source_path, 300);
  if (signed.error) {
    await db.from('vocal_jobs').update({ status: 'error', error_message: 'Klip okunamadı.', lease_id: null, updated_at: new Date().toISOString() }).eq('id', job.job_id).eq('lease_id', job.lease_id).eq('status', 'processing');
    return NextResponse.json({ error: 'Klip bağlantısı oluşturulamadı.' }, { status: 503, headers });
  }
  return NextResponse.json({ job_id: job.job_id, lease_id: job.lease_id, source_url: signed.data.signedUrl, source_url_expires_in: 300, result_endpoint: `/api/local-worker/jobs/${job.job_id}/result`, error_endpoint: `/api/local-worker/jobs/${job.job_id}/fail`, heartbeat_endpoint: `/api/local-worker/jobs/${job.job_id}/heartbeat` }, { headers });
}
