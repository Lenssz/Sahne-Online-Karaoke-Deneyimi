'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="surface mx-auto max-w-lg rounded-[24px] p-7"><h1 className="text-xl font-bold">Stüdyoya şu an ulaşılamıyor</h1><p className="mt-3 text-sm text-[#9292a6]">Bağlantıyı yeniden dene. Sorun sürerse yönetici Supabase bağlantısını ve veritabanı kurulumunu kontrol etmeli.</p><button className="primary-button mt-5" onClick={reset}>Yeniden dene</button></div>;
}
