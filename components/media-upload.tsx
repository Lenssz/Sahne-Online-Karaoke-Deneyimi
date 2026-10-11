'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { fieldClass } from '@/lib/styles';
import { MAX_MEDIA_FILE_BYTES } from '@/lib/media-limits';

export function MediaUpload({ songId, kind }: { songId: string; kind: 'clip' | 'instrumental' }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    if (file instanceof File && file.size > MAX_MEDIA_FILE_BYTES) { setMessage('En fazla 50 MB yükleyebilirsin.'); return; }
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/media/upload', { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) setMessage(result.error ?? 'Yükleme başarısız.');
      else { setMessage(kind === 'clip' ? 'Klip yüklendi.' : 'Altyapı yüklendi. Dinleyip onayla.'); form.reset(); router.refresh(); }
    } catch { setMessage('Bağlantı kesildi. Yeniden dene.'); } finally { setBusy(false); }
  }
  return <form onSubmit={upload} className="space-y-4"><input type="hidden" name="song_id" value={songId} /><input type="hidden" name="kind" value={kind} /><label className="block text-xs">{kind === 'clip' ? 'Video dosyası (MP4 / WebM)' : 'Vokalsiz ses dosyası (MP3 / WAV / WebM / OGG)'}<input type="file" name="file" required accept={kind === 'clip' ? 'video/mp4,video/webm' : 'audio/mpeg,audio/wav,audio/x-wav,audio/webm,audio/ogg'} className={fieldClass} /></label><button disabled={busy} className="primary-button">{busy ? 'Yükleniyor…' : kind === 'clip' ? 'Klibi yükle' : 'Altyapıyı yükle'}</button><p className="text-[10px] leading-5 text-[#9292a6]">Dosya başına 50 MB, tüm özel dosyalarda 1 GB sınırı uygulanır.</p>{message && <p role="status" className="text-sm text-[#c7b7e9]">{message}</p>}</form>;
}
