'use client';
import { useState } from 'react';
import type { Asset } from '@/lib/types';
export function PrivateMedia({ assets }: { assets: Asset[] }) {
  const [selected, setSelected] = useState<Asset | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);
  if (!assets.length) return null;
  return <section className="surface my-5 rounded-[22px] p-5"><h2 className="text-sm font-bold">Özel medya</h2><div className="my-3 flex flex-wrap gap-2">{assets.map(a => <button className="secondary-button" key={a.id} onClick={() => { setSelected(a); setError(false); setAttempt(n => n + 1); }}>{a.label}</button>)}</div>
    {selected && (selected.kind === 'clip' || selected.kind === 'final' ? <video key={`${selected.id}-${attempt}`} className="w-full rounded-xl" controls preload="none" src={`/api/media/${selected.id}?v=${attempt}`} onError={() => setError(true)} /> : <audio key={`${selected.id}-${attempt}`} className="w-full" controls preload="none" src={`/api/media/${selected.id}?v=${attempt}`} onError={() => setError(true)} />)}
    {error && <p role="alert" className="mt-3 text-xs text-[#ffaaa4]">Medya açılamadı veya bağlantının süresi doldu. Yenilemek için dosyayı tekrar seç.</p>}
    <p className="mt-3 text-xs text-[#9292a6]">İzleme bağlantıları 5 dakika geçerlidir. Yenilemek için dosyayı tekrar seç.</p>
  </section>;
}
