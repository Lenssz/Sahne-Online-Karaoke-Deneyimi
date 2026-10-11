import Link from 'next/link';
export default function NotFound() {
  return <div className="surface mx-auto max-w-lg rounded-[24px] p-7"><h1 className="text-xl font-bold">Bu sayfa kullanılamıyor</h1><p className="mt-3 text-sm text-[#9292a6]">Oda bulunamadı veya bu odaya katılmamışsın.</p><Link href="/" className="primary-button mt-5">Odalarıma dön</Link></div>;
}
