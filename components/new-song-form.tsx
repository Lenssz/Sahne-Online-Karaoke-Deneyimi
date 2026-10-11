'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Plus, Trash2, UploadCloud } from 'lucide-react';
import { fieldClass } from '@/lib/styles';
import { MAX_MEDIA_FILE_BYTES } from '@/lib/media-limits';

const colors = ['#ad96ff', '#ff928b', '#8ad7c8', '#ffc48a', '#83b9ff', '#e7a4d6'];
type RoleInput = { name: string; color: string };
type LineInput = { id: number; role_position: number; start: string; end: string; text: string };
const initialRoles: RoleInput[] = [
  { name: 'Esin', color: colors[0] }, { name: 'Hilal', color: colors[1] },
  ...Array.from({ length: 4 }, (_, index) => ({ name: `${index + 3}. rol`, color: colors[index + 2] })),
];

function parseTime(value: string) {
  const match = /^(\d{1,3}):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  return (Number(match[1]) * 60 + Number(match[2])) * 1000 + Number((match[3] ?? '').padEnd(3, '0'));
}

export function NewSongForm() {
  const router = useRouter();
  const [title, setTitle] = useState('Daha İyi');
  const [artist, setArtist] = useState('Manifest');
  const [duration, setDuration] = useState('');
  const [roles, setRoles] = useState<RoleInput[]>(initialRoles);
  const [lines, setLines] = useState<LineInput[]>([]);
  const [nextLineId, setNextLineId] = useState(1);
  const [clip, setClip] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [savedSongId, setSavedSongId] = useState<string | null>(null);

  function changeRoleCount(count: number) {
    if (count < 1 || count > 24 || savedSongId) return;
    setRoles(current => Array.from({ length: count }, (_, index) => current[index] ?? { name: `${index + 1}. rol`, color: colors[index % colors.length] }));
    setLines(current => current.filter(line => line.role_position <= count));
  }

  function addLine() {
    setLines(current => [...current, { id: nextLineId, role_position: 1, start: '', end: '', text: '' }]);
    setNextLineId(id => id + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clip) { setMessage('Şarkı klibini seç.'); return; }
    if (clip.size > MAX_MEDIA_FILE_BYTES) { setMessage('Klip en fazla 50 MB olabilir. Daha küçük bir MP4/WebM seç.'); return; }
    setBusy(true);
    setMessage('');
    try {
      let songId = savedSongId;
      if (!songId) {
        const seconds = Number(duration);
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 7200) throw new Error('Şarkı süresi 1–7200 saniye olmalı.');
        const parsedLyrics = lines.map((line, index) => {
          const start_ms = parseTime(line.start);
          const end_ms = parseTime(line.end);
          if (start_ms === null || end_ms === null || end_ms <= start_ms || end_ms > seconds * 1000) {
            throw new Error(`${index + 1}. söz satırının zamanını 00:32 biçiminde ve şarkı süresi içinde yaz.`);
          }
          return { role_position: line.role_position, start_ms, end_ms, text: line.text.trim() };
        });
        setMessage('Şarkı, roller ve sözler kaydediliyor…');
        const response = await fetch('/api/admin/songs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, artist, duration_seconds: seconds, roles, lyrics: parsedLyrics }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Şarkı kaydedilemedi.');
        songId = result.id as string;
        setSavedSongId(songId);
      }
      setMessage('Klip özel depolamaya yükleniyor…');
      const form = new FormData();
      form.set('song_id', songId);
      form.set('kind', 'clip');
      form.set('file', clip);
      const upload = await fetch('/api/media/upload', { method: 'POST', body: form });
      const uploaded = await upload.json();
      if (!upload.ok) throw new Error(`${uploaded.error ?? 'Klip yüklenemedi.'} Şarkı kaydedildi; klibi yeniden yükleyebilir veya düzenleme sayfasına geçebilirsin.`);
      router.push(`/admin/songs/${songId}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'İşlem tamamlanamadı.');
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1.45fr_.8fr]">
    <div className="min-w-0 space-y-6">
      <section data-reveal className="surface rounded-[24px] p-6"><p className="eyebrow">01 · ŞARKI VE KLİP</p><h2 className="mt-2 text-lg font-bold">Şarkı bilgileri</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs">Şarkı adı<input className={fieldClass} required maxLength={160} value={title} disabled={!!savedSongId} onChange={event => setTitle(event.target.value)} /></label><label className="text-xs">Sanatçı<input className={fieldClass} required maxLength={160} value={artist} disabled={!!savedSongId} onChange={event => setArtist(event.target.value)} /></label></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs">Süre (saniye)<input className={fieldClass} type="number" required min={1} max={7200} value={duration} disabled={!!savedSongId} onChange={event => setDuration(event.target.value)} placeholder="Örn. 198" /></label><label className="text-xs">Video dosyası (MP4 veya WebM)<input className={fieldClass} type="file" required accept="video/mp4,video/webm" onChange={event => setClip(event.target.files?.[0] ?? null)} /></label></div>
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#ab8bd5]/20 bg-[#251d32] p-4"><UploadCloud size={19} className="shrink-0 text-[#c5a8f7]" /><p className="text-xs leading-6 text-[#b9aecb]">Ücretsiz Supabase projesinde dosya başına en fazla <strong>50 MB</strong>, tüm özel dosyalar için toplam <strong>1 GB</strong> alan var. Yükleme öncesinde iki sınır da kontrol edilir.</p></div>
      </section>
      <section data-reveal className="surface rounded-[24px] p-6"><p className="eyebrow">02 · ŞARKICILAR</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-lg font-bold">Roller</h2><p className="mt-1 text-xs text-[#9894aa]">Her arkadaşın söyleyeceği rolü adlandır.</p></div><label className="text-xs">Rol sayısı<select className={fieldClass} value={roles.length} disabled={!!savedSongId} onChange={event => changeRoleCount(Number(event.target.value))}>{Array.from({ length: 24 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{roles.map((role, index) => <div key={index} className="surface-soft flex items-end gap-3 rounded-2xl p-3"><span className="mb-3 size-3 shrink-0 rounded-full" style={{ backgroundColor: role.color }} /><label className="flex-1 text-xs">{index + 1}. şarkıcı<input className={fieldClass} required maxLength={80} value={role.name} disabled={!!savedSongId} onChange={event => setRoles(current => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label><label className="text-[10px] text-[#aaa0bb]">Renk<input className="mt-2 block h-11 w-11" type="color" value={role.color} disabled={!!savedSongId} onChange={event => setRoles(current => current.map((item, i) => i === index ? { ...item, color: event.target.value } : item))} /></label></div>)}</div>
      </section>
      <section data-reveal className="surface rounded-[24px] p-6"><p className="eyebrow">03 · ZAMANLI SÖZLER</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Söz satırları</h2><p className="mt-1 text-xs text-[#9894aa]">Başlangıç ve bitişi dakika:saniye olarak yaz.</p></div><button type="button" disabled={!!savedSongId} onClick={addLine} className="secondary-button"><Plus size={14} /> Satır ekle</button></div>
        <div className="mt-5 space-y-3">{lines.map((line, index) => <div key={line.id} className="surface-soft rounded-2xl p-4"><div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"><label className="text-xs">Şarkıcı<select className={fieldClass} value={line.role_position} disabled={!!savedSongId} onChange={event => setLines(current => current.map(item => item.id === line.id ? { ...item, role_position: Number(event.target.value) } : item))}>{roles.map((role, roleIndex) => <option key={roleIndex} value={roleIndex + 1}>{role.name || `${roleIndex + 1}. rol`}</option>)}</select></label><label className="text-xs">Başlangıç<input className={fieldClass} value={line.start} disabled={!!savedSongId} required placeholder="00:32" onChange={event => setLines(current => current.map(item => item.id === line.id ? { ...item, start: event.target.value } : item))} /></label><label className="text-xs">Bitiş<input className={fieldClass} value={line.end} disabled={!!savedSongId} required placeholder="00:38" onChange={event => setLines(current => current.map(item => item.id === line.id ? { ...item, end: event.target.value } : item))} /></label><button type="button" disabled={!!savedSongId} aria-label={`${index + 1}. satırı sil`} onClick={() => setLines(current => current.filter(item => item.id !== line.id))} className="secondary-button self-end"><Trash2 size={15} /></button></div><label className="mt-3 block text-xs">Söz<textarea className={fieldClass} required maxLength={1000} value={line.text} disabled={!!savedSongId} onChange={event => setLines(current => current.map(item => item.id === line.id ? { ...item, text: event.target.value } : item))} placeholder="Bu aralıkta söylenecek söz" /></label></div>)}{!lines.length && <p className="rounded-2xl border border-dashed border-[#715d8f]/35 p-5 text-xs text-[#9992aa]">İstersen sözleri şimdi ekle; daha sonra düzenleme sayfasından da yazabilirsin.</p>}</div>
      </section>
    </div>
    <aside className="space-y-5"><div className="surface sticky top-6 rounded-[24px] p-6"><p className="eyebrow">KAYDET VE YÜKLE</p><h2 className="mt-3 text-lg font-bold">Şarkıyı hazırla</h2><p className="mt-2 text-xs leading-6 text-[#aaa1b8]">Şarkı, roller ve sözler birlikte kaydedilir. Ardından klip özel dosya alanına yüklenir.</p><button disabled={busy} className="primary-button mt-6 w-full">{busy ? 'İşleniyor…' : savedSongId ? 'Klibi yeniden yükle' : 'Şarkıyı ve klibi ekle'}</button>{message && <p role="status" className="mt-4 text-xs leading-6 text-[#ffb6aa]">{message}</p>}{savedSongId && <Link className="secondary-button mt-4 w-full" href={`/admin/songs/${savedSongId}`}>Kaydedilen şarkıyı aç</Link>}<p className="mt-4 text-xs leading-5 text-[#8e8aa0]">Vokal ayırma düğmesi klip yüklendikten sonra düzenleme ekranında açılır.</p></div></aside>
  </form>;
}
