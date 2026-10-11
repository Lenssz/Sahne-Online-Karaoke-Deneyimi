import Link from 'next/link';
import { StorageCleanupControl } from '@/components/storage-cleanup-control';
import { ArrowRight, LockKeyhole, Plus } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { PageIntro, SectionLabel, SongArt } from '@/components/studio-ui';
import { timeLabel, type Song } from '@/lib/types';

export default async function SongsPage({ searchParams }: { searchParams: Promise<{ cleanup?: string }> }) {
  const query = await searchParams;
  const { db } = await requireAdmin();
  const result = await db.from('songs').select('id,title,artist,duration_seconds,song_roles(id)').order('created_at', { ascending: false });
  if (result.error) throw new Error('Şarkılar yüklenemedi.');
  const songs = result.data as (Song & { song_roles: { id: string }[] })[];
  return <><PageIntro eyebrow="YÖNETİCİ ALANI" title="Şarkı yönetimi" description="Klibi hazırla, rolleri ve zamanlı sözleri düzenle, arkadaşlarını özel odana davet et." action={<Link href="/admin/songs/new" className="primary-button"><Plus size={15} /> Yeni şarkı ekle</Link>} />
    <div className="mb-7 flex items-center gap-3 rounded-[17px] border border-[#6d578f]/25 bg-[#241d32] px-4 py-3.5"><span className="flex size-9 items-center justify-center rounded-xl bg-[#a184e8]/15 text-[#beadf1]"><LockKeyhole size={16} /></span><div><p className="text-[12px] font-semibold text-[#eae1f7]">Şarkıları yalnızca yönetici ekler</p><p className="mt-0.5 text-[10px] text-[#a69cb6]">Kitaplık ve medya yalnızca yetkili kişilere açıktır.</p></div></div>
    <SectionLabel title="Şarkı kitaplığın" hrefLabel={`${songs.length} şarkı`} /><div className="grid gap-4 xl:grid-cols-2">{songs.map(song => <div data-reveal key={song.id} className="surface interactive-card flex flex-col gap-5 rounded-[23px] p-5 sm:flex-row"><SongArt variant="card" title={song.title} artist={song.artist} /><div className="min-w-0 flex-1 py-1"><span className="text-[10px] text-[#85869a]">{timeLabel(song.duration_seconds * 1000)} · {song.song_roles.length} rol</span><h2 className="mt-4 text-[23px] font-bold tracking-[-0.05em]">{song.title}</h2><p className="mt-1 text-xs text-[#9495a8]">{song.artist}</p><Link href={`/admin/songs/${song.id}`} className="primary-button mt-5">Şarkıyı düzenle <ArrowRight size={14} /></Link></div></div>)}{!songs.length && <div data-reveal className="surface rounded-[23px] p-7"><Plus className="text-[#bca1f6]" /><h2 className="mt-4 font-bold">İlk şarkın için yer hazır</h2><p className="mt-2 text-xs text-[#9292a6]">Şarkıyı, şarkıcıları, söz zamanlarını ve klibi ekleyebilirsin.</p><Link href="/admin/songs/new" className="primary-button mt-5">Şarkı ekle <ArrowRight size={14} /></Link></div>}</div><StorageCleanupControl initialPending={query.cleanup === 'pending'} />
  </>;
}
