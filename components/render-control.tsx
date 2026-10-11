'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clapperboard } from 'lucide-react';
import type { RenderJob } from '@/lib/types';

export function RenderControl({ roomId, initialJob, isAdmin, allRecorded, sourcesReady, setupReady }: {
  roomId: string;
  initialJob: RenderJob | null;
  isAdmin: boolean;
  allRecorded: boolean;
  sourcesReady: boolean;
  setupReady: boolean;
}) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!job || (job.status !== 'waiting' && job.status !== 'processing')) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/rooms/${roomId}/render`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (data.job) {
          setJob(data.job);
          if (data.job.status === 'ready') router.refresh();
        }
      } catch { /* retry on next poll */ }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [job, roomId, router]);

  async function createVideo() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/rooms/${roomId}/render`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Render işi oluşturulamadı.');
      setJob({ id: data.job_id, status: 'waiting', error_message: null, result_asset_id: null, created_at: '', updated_at: '' });
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Render işi oluşturulamadı.'); }
    finally { setBusy(false); }
  }

  return <div className="mt-6 border-t border-white/10 pt-5">
    {isAdmin && allRecorded && sourcesReady && setupReady && <div className="rounded-[18px] border border-[#ffb7a4]/25 bg-[#ffad9c]/[0.07] p-4"><p className="mb-3 text-[13px] font-semibold text-[#f5e3e8]">{job?.status === 'ready' ? 'Final hazır. İstersen yeni bir sürüm oluşturabilirsin.' : 'Tüm kayıtlar hazır. Şimdi final videoyu oluşturabilirsin.'}</p><button type="button" className="final-button w-full sm:w-auto" onClick={createVideo} disabled={busy || job?.status === 'waiting' || job?.status === 'processing'}><Clapperboard size={18} /> {busy ? 'İş oluşturuluyor…' : job?.status === 'ready' ? 'Videoyu yeniden oluştur' : 'Videoyu oluştur'}</button></div>}
    {!setupReady && isAdmin && <p role="alert" className="mt-3 text-[13px] text-[#ffb5ac]">Önce 202609270003_room_render_jobs.sql veritabanı güncellemesini uygula.</p>}
    {setupReady && !sourcesReady && <p className="mt-3 text-[13px] text-[#d2cbdc]">Normal klip ve onaylı vokalsiz altyapı gerekli.</p>}
    {setupReady && !allRecorded && <p className="mt-3 text-[13px] text-[#d2cbdc]">Tüm şarkıcıların söz satırları tamamlandığında yönetici video oluşturabilecek.</p>}
    {job?.status === 'waiting' && <p role="status" className="mt-4 rounded-xl border border-[#bda5ef]/25 bg-[#9a78e8]/10 p-3 text-[13px] text-[#e1d0ff]">Render işi sırada. Windows yardımcı programı açık olduğunda başlayacak.</p>}
    {job?.status === 'processing' && <p role="status" className="mt-4 rounded-xl border border-[#bda5ef]/25 bg-[#9a78e8]/10 p-3 text-[13px] text-[#e1d0ff]">Video bilgisayarda oluşturuluyor. Sayfa durumu otomatik yeniler.</p>}
    {job?.status === 'ready' && <p role="status" className="mt-4 rounded-xl border border-[#87d4aa]/25 bg-[#87d4aa]/10 p-3 text-[13px] text-[#b8f0d0]">Final video hazır. Yalnızca oda üyeleri izleyebilir.</p>}
    {job?.status === 'error' && <p role="alert" className="mt-4 rounded-xl border border-[#ff928b]/30 bg-[#ff928b]/10 p-3 text-[13px] leading-6 text-[#ffc3b8]">Render başarısız: {job.error_message ?? 'Bilinmeyen hata.'} Mikrofon kayıtları korundu; yönetici yeniden deneyebilir.</p>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-[#ff928b]/30 bg-[#ff928b]/10 p-3 text-[13px] text-[#ffc3b8]">{error}</p>}
  </div>;
}
