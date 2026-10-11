'use client';
import { useState } from 'react';

export function StorageCleanupControl({ initialPending = false }: { initialPending?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialPending ? 'Kayıt silindi; bazı dosyalar depolamada sırada kaldı. Temizlemeyi yeniden dene.' : '');
  async function retry() {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/storage-cleanup', { method: 'POST' });
      const data = await response.json();
      setMessage(!response.ok ? data.error ?? 'Temizleme başlatılamadı.' : data.pending ? data.error ?? 'Bir kısım dosya sırada kaldı. Yeniden deneyebilirsin.' : 'Bekleyen dosyalar temizlendi.');
    } catch { setMessage('Bağlantı kurulamadı.'); }
    finally { setBusy(false); }
  }
  return <div className="surface mt-7 rounded-[20px] p-5"><h2 className="font-bold">Depolama temizliği</h2><p className="mt-2 text-xs text-[#9292a6]">Silinen oda veya şarkılardan depolamada dosya kaldıysa buradan yeniden temizle.</p><button type="button" onClick={retry} disabled={busy} className="secondary-button mt-4">{busy ? 'Temizleniyor…' : 'Bekleyen dosyaları temizle'}</button>{message && <p role="status" className="mt-3 text-xs text-[#c9b8ff]">{message}</p>}</div>;
}
