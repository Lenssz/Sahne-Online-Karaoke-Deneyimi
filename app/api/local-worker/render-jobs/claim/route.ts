import { NextResponse } from 'next/server';
import { workerAuthorized, workerClient } from '@/lib/local-worker';

const headers = { 'Cache-Control': 'private, no-store' };
type Claimed = {
  job_id: string; lease_id: string; clip_path: string; instrumental_path: string;
  snapshot: { path: string; capture_start_ms: number; duration_ms: number; offset_ms: number }[];
  duration_seconds: number;
};

export async function POST(request: Request) {
  if (!workerAuthorized(request)) return NextResponse.json({ error: 'Yetkisiz işlem.' }, { status: 401, headers });
  const db = workerClient();
  if (!db) return NextResponse.json({ error: 'Yardımcı bağlantısı yapılandırılmadı.' }, { status: 503, headers });
  const claimed = await db.rpc('claim_render_job');
  if (claimed.error) return NextResponse.json({ error: 'Render sırası okunamadı. SQL güncellemesini kontrol et.' }, { status: 503, headers });
  const job = claimed.data?.[0] as Claimed | undefined;
  if (!job) return new Response(null, { status: 204, headers });
  try {
    if (!Array.isArray(job.snapshot) || !job.snapshot.length || job.snapshot.length > 500)
      throw new Error('Kayıt listesi geçersiz.');
    const paths = [job.clip_path, job.instrumental_path, ...job.snapshot.map(item => item.path)];
    const signed = new Map<string, string>();
    for (let first = 0; first < paths.length; first += 50) {
      const result = await db.storage.from('studio-private').createSignedUrls(paths.slice(first, first + 50), 1800);
      if (result.error || !result.data) throw new Error('Kaynak dosya bağlantısı oluşturulamadı.');
      for (const item of result.data) {
        if (item.error || !item.path || !item.signedUrl) throw new Error('Kaynak dosya bulunamadı.');
        signed.set(item.path, item.signedUrl);
      }
    }
    const urlFor = (path: string) => {
      const url = signed.get(path);
      if (!url) throw new Error('Kaynak dosya bulunamadı.');
      return url;
    };
    return NextResponse.json({
      kind: 'render', job_id: job.job_id, lease_id: job.lease_id,
      clip_url: urlFor(job.clip_path), instrumental_url: urlFor(job.instrumental_path),
      recordings: job.snapshot.map(item => ({
        url: urlFor(item.path), capture_start_ms: item.capture_start_ms,
        duration_ms: item.duration_ms, offset_ms: item.offset_ms,
      })),
      duration_seconds: job.duration_seconds,
    }, { headers });
  } catch {
    await db.from('render_jobs').update({
      status: 'error', error_message: 'Kaynak klip, altyapı veya kayıt indirilemedi.',
      lease_id: null, updated_at: new Date().toISOString(),
    }).eq('id', job.job_id).eq('lease_id', job.lease_id).eq('status', 'processing');
    return NextResponse.json({ error: 'Render kaynakları açılamadı.' }, { status: 503, headers });
  }
}
