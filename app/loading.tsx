export default function Loading() {
  return <div role="status" aria-live="polite" aria-label="Sayfa açılıyor" className="space-y-6">
    <div className="space-y-3"><div className="loading-skeleton h-3 w-36 rounded-full" /><div className="loading-skeleton h-10 w-64 max-w-full rounded-xl" /><p className="text-sm text-[#cbc4da]">Stüdyo açılıyor…</p></div>
    <div className="loading-skeleton h-56 rounded-[24px]" />
    <div className="grid gap-4 sm:grid-cols-3"><div className="loading-skeleton h-28 rounded-[20px]" /><div className="loading-skeleton h-28 rounded-[20px]" /><div className="loading-skeleton h-28 rounded-[20px]" /></div>
  </div>;
}
