'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AudioLines, Check, RefreshCw } from 'lucide-react';
import type { Asset, VocalJob } from '@/lib/types';
import { formatMegabytes, FREE_STORAGE_BYTES } from '@/lib/media-limits';
import { fieldClass } from '@/lib/styles';

const labels = { waiting: 'Bekliyor', processing: 'İşleniyor', ready: 'Hazır', error: 'Hata' } as const;
const colors = { waiting: 'text-[#f3cd8d]', processing: 'text-[#bfa9ff]', ready: 'text-[#9ed9be]', error: 'text-[#ffaaa4]' } as const;

export function VocalJobPanel({ songId, clips, instrumentals, job, usedBytes }: { songId: string; clips: Asset[]; instrumentals: Asset[]; job: VocalJob | null; usedBytes: number | null }) {
  const router = useRouter();
  const [sourceId, setSourceId] = useState(clips[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [previewVersion, setPreviewVersion] = useState(0);
  const effectiveSourceId = clips.some(clip => clip.id === sourceId) ? sourceId : (clips[0]?.id ?? '');
  useEffect(() => {
    if (job?.status !== 'waiting' && job?.status !== 'processing') return;
    const timer = window.setInterval(() => router.refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [job?.status, router]);

  async function enqueue() {
    if (!effectiveSourceId) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/songs/${songId}/vocal-job`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_asset_id: effectiveSourceId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'İş oluşturulamadı.');
      setMessage('Vokal ayırma işi sıraya alındı. Yerel yardımcı program kurulunca işlenecek.');
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'İş oluşturulamadı.'); }
    finally { setBusy(false); }
  }

  async function approve(assetId: string) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/songs/${songId}/instrumental-approval`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asset_id: assetId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Altyapı onaylanamadı.');
      setMessage('Altyapı onaylandı. Oda üyeleri artık bu dosyayı dinleyebilir.');
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Altyapı onaylanamadı.'); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <section className="surface rounded-[24px] p-5"><div className="flex items-center gap-3"><AudioLines className="text-[#c6aeff]" /><h2 className="font-bold">Vokali ayır</h2></div>
      <p className="mt-3 text-xs leading-6 text-[#a6a0b7]">Düğme yalnızca iş oluşturur. Yerel yardımcı program bağlanana kadar ses işlenmez.</p>
      {clips.length > 1 && <label className="mt-4 block text-xs">Kaynak klip<select className={fieldClass} value={effectiveSourceId} onChange={event => setSourceId(event.target.value)}>{clips.map(clip => <option key={clip.id} value={clip.id}>{clip.label}</option>)}</select></label>}
      {!clips.length && <p className="mt-4 text-xs text-[#ffaaa4]">Önce şarkı klibini yükle.</p>}
      <button type="button" disabled={busy || !effectiveSourceId || job?.status === 'waiting' || job?.status === 'processing'} onClick={enqueue} className="primary-button mt-4">{job?.status === 'ready' || job?.status === 'error' ? 'Yeniden sıraya al' : 'Vokali ayır'}</button>
      <div className="surface-soft mt-5 rounded-xl p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold">İş durumu</span><span className={`text-xs font-bold ${job ? colors[job.status] : 'text-[#8e8aa0]'}`}>{job ? labels[job.status] : 'Henüz iş yok'}</span></div>{job?.status === 'error' && <p className="mt-3 text-xs text-[#ffaaa4]">{job.error_message || 'İş tamamlanamadı.'}</p>}{job?.status === 'ready' && <p className="mt-3 text-xs text-[#9ed9be]">Sonuç yüklendi. Aşağıda dinleyip onaylayabilirsin.</p>}{job?.status === 'waiting' && <p className="mt-3 text-xs text-[#aaa0b9]">İş yerel yardımcı programın almasını bekliyor.</p>}{job?.status === 'processing' && <p className="mt-3 text-xs text-[#aaa0b9]">Yerel yardımcı program dosyayı işliyor.</p>}</div>
      <button type="button" onClick={() => router.refresh()} className="mt-3 inline-flex items-center gap-2 text-xs text-[#bdabec]"><RefreshCw size={13} /> Durumu yenile</button>
      {usedBytes !== null && <p className="mt-4 text-[10px] text-[#9292a6]">Özel depolama: {formatMegabytes(usedBytes)} / {formatMegabytes(FREE_STORAGE_BYTES)}</p>}
      {message && <p role="status" className="mt-4 text-xs leading-6 text-[#d7c3ff]">{message}</p>}
    </section>
    <section className="surface rounded-[24px] p-5"><h2 className="font-bold">Altyapıyı dinle ve onayla</h2><p className="mt-2 text-xs leading-6 text-[#aaa0b9]">Yerel işlem sonucu veya elle yüklediğin altyapı burada görünür. Seçtiğin tek altyapı oda üyelerine açılır.</p>
      <div className="mt-4 space-y-4">{instrumentals.map(asset => <div key={asset.id} className="surface-soft rounded-2xl p-4"><div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-xs font-semibold">{asset.label}</span>{asset.approved_at && <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-[#9ed9be]"><Check size={13} /> Onaylı</span>}</div><audio key={`${asset.id}-${previewVersion}`} controls preload="none" className="mt-3 w-full" src={`/api/media/${asset.id}?v=${previewVersion}`} /><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="secondary-button" onClick={() => setPreviewVersion(value => value + 1)}>Dinlemeyi yenile</button>{!asset.approved_at && <button type="button" disabled={busy} onClick={() => approve(asset.id)} className="primary-button">Bu altyapıyı onayla</button>}</div></div>)}{!instrumentals.length && <p className="rounded-2xl border border-dashed border-[#715d8f]/35 p-4 text-xs text-[#9892aa]">Henüz altyapı yok. Yerel işlemin sonucunu bekle veya aşağıdan dosya yükle.</p>}</div>
    </section>
  </div>;
}
