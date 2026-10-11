'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type RoleSummary = { name: string; position: number; lines: number };

export function RoleCountControl({ songId, roles, blocked }: { songId: string; roles: RoleSummary[]; blocked: boolean }) {
  const router = useRouter();
  const [count, setCount] = useState(roles.length);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const removed = roles.filter(role => role.position > count);
  const removedLines = removed.reduce((total, role) => total + role.lines, 0);
  async function save() {
    setPending(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/songs/${songId}/role-count`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count, expectedRemovedLines: removedLines }) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error ?? 'Rol sayısı değiştirilemedi.'); return; }
      setConfirmed(false);
      setMessage('Rol sayısı güncellendi.');
      router.refresh();
    } catch { setMessage('Bağlantı kurulamadı.'); }
    finally { setPending(false); }
  }
  if (blocked) return <section className="surface-soft mb-5 flex flex-wrap items-center justify-between gap-2 rounded-[20px] px-5 py-4"><div><h2 className="text-sm font-bold">{roles.length} şarkıcı rolü</h2><p className="mt-1 text-xs leading-5 text-[#c4bed0]">Bu şarkının odası olduğu için rol sayısı şu anda değiştirilemez.</p></div><span className="rounded-full border border-[#bd9bff]/25 bg-[#bd9bff]/10 px-3 py-1.5 text-xs font-semibold text-[#d9c7ff]">Oda açık</span></section>;
  return <section className="surface mb-5 rounded-[24px] p-5">
    <h2 className="font-bold">Şarkıcı rolü sayısı</h2>
    <p className="mt-2 text-xs text-[#a5a3b5]">{blocked ? 'Bu şarkıda oda bulunduğu için önce odaları silmelisin.' : '1 ile 24 arasında rol seçebilirsin. Var olan rollerin adları ve sözleri korunur.'}</p>
    <label className="mt-4 block max-w-[220px] text-xs">Rol sayısı<input type="number" min={1} max={24} value={count} disabled={blocked || pending} onChange={event => { setCount(Number(event.target.value)); setConfirmed(false); }} className="mt-2 block w-full rounded-xl border border-white/15 bg-[#10101b] px-3 py-3 text-sm text-white" /></label>
    {removed.length > 0 && <div className="mt-4 rounded-xl border border-[#ff928b]/30 p-4 text-xs text-[#ffb1aa]"><p>{removed.length} rol ve {removedLines} söz satırı silinecek:</p><p className="mt-2">{removed.map(role => `${role.position}. ${role.name} (${role.lines} satır)`).join(', ')}</p><label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Bu rol ve sözleri silmeyi onaylıyorum.</label></div>}
    <button type="button" onClick={save} disabled={blocked || pending || !Number.isInteger(count) || count < 1 || count > 24 || count === roles.length || (removed.length > 0 && !confirmed)} className="primary-button mt-4 disabled:opacity-50">{pending ? 'Kaydediliyor…' : 'Rol sayısını kaydet'}</button>
    {message && <p role="status" className="mt-3 text-xs text-[#c9b8ff]">{message}</p>}
  </section>;
}
