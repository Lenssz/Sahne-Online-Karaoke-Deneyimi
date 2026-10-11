'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DeleteControl({ kind, id, name, summary, blocked }: {
  kind: 'room' | 'song'; id: string; name: string; summary: string; blocked?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const label = kind === 'room' ? 'Odayı sil' : 'Şarkıyı sil';
  async function remove() {
    setPending(true);
    setError('');
    try {
      const url = kind === 'room' ? `/api/admin/rooms/${id}` : `/api/admin/songs/${id}`;
      const response = await fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: typed }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? 'Silinemedi.'); return; }
      const destination = kind === 'room' ? '/' : '/admin/songs';
      router.replace(body.cleanupPending ? `${destination}?cleanup=pending` : destination);
      router.refresh();
    } catch { setError('Bağlantı kurulamadı. Yeniden dene.'); }
    finally { setPending(false); }
  }
  return <section className="surface mt-7 rounded-[24px] border border-[#ff928b]/30 p-6">
    <h2 className="font-bold text-[#ffb1aa]">{kind === 'room' ? 'Odayı kaldır' : 'Şarkıyı kaldır'}</h2>
    <p className="mt-2 text-xs leading-6 text-[#a5a3b5]">{summary}</p>
    {blocked && <p className="mt-3 text-xs text-[#ffb1aa]">{blocked}</p>}
    {!open ? <button type="button" disabled={Boolean(blocked)} onClick={() => setOpen(true)} className="secondary-button mt-4 disabled:opacity-50">{label}</button> :
      <div className="mt-4 space-y-3">
        <label className="block text-xs text-[#eee5f6]">Onaylamak için <strong>{name}</strong> adını aynen yaz.
          <input value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" className="mt-2 block w-full rounded-xl border border-white/15 bg-[#10101b] px-3 py-3 text-sm text-white" />
        </label>
        <div className="flex flex-wrap gap-3"><button type="button" disabled={pending || typed !== name} onClick={remove} className="rounded-xl bg-[#c76769] px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{pending ? 'Siliniyor…' : 'Kalıcı olarak sil'}</button><button type="button" disabled={pending} onClick={() => { setOpen(false); setTyped(''); setError(''); }} className="secondary-button">Vazgeç</button></div>
        {error && <p role="alert" className="text-xs text-[#ffaaa4]">{error}</p>}
      </div>}
  </section>;
}
