import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Mic2, Music2, Sparkles, UsersRound } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { PageIntro, SectionLabel, SongArt, PreviewNotice } from '@/components/studio-ui';
import { StorageCleanupControl } from '@/components/storage-cleanup-control';
import type { Room, Song } from '@/lib/types';
import { timeLabel } from '@/lib/types';

export default async function Home({ searchParams }: { searchParams: Promise<{ cleanup?: string }> }) {
  const query = await searchParams;
  const { db, isAdmin } = await requireUser();
  const [roomResult, songResult, recordingCountResult] = await Promise.all([
    db.from('rooms').select('id,name,song_id').order('created_at', { ascending: false }),
    db.from('songs').select('id,title,artist,duration_seconds'),
    db.from('room_recordings').select('lyric_id', { count: 'exact', head: true }),
  ]);
  if (roomResult.error || songResult.error) throw new Error('Odalar yüklenemedi.');
  const rooms = roomResult.data as Room[];
  const songs = songResult.data as Song[];
  const firstRoom = rooms[0];
  return <>
    <PageIntro eyebrow="ARKADAŞLARINLA AYNI SAHNEDE" title="Merhaba, yeniden hoş geldin!" description="Şarkını seç, arkadaşlarınla kendi klibinizin seslerini birlikte oluşturun." />
    <section data-reveal className="hero-panel relative mb-7 grid min-h-[278px] overflow-hidden rounded-[28px] px-7 py-8 sm:px-9 lg:grid-cols-[1.3fr_.7fr] lg:items-center lg:px-10">
      <div className="relative z-10 max-w-[550px]"><span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-[#d1b6f7]/35 bg-white/[0.10] px-3 py-1.5 text-[11px] font-bold tracking-wide text-[#f0defe]"><Sparkles size={13} /> SİZE ÖZEL BİR STÜDYO</span><h2 className="text-[32px] font-bold leading-[1.15] tracking-[-0.055em] text-white sm:text-[40px]">Bir şarkı. Arkadaşların sesleri.<br /><span className="text-[#ffd0db]">Tek bir sahne.</span></h2><p className="mt-4 max-w-[460px] text-[14px] leading-[1.7] text-[#e3d5e8]">Herkes kendi bölümünü kaydetsin; sesleriniz final klipte buluşsun.</p><div className="mt-6 flex flex-wrap gap-3">{firstRoom ? <Link href={`/rooms/${firstRoom.id}`} className="primary-button">Odama git <ArrowRight size={16} /></Link> : isAdmin ? <Link href="/admin/songs/new" className="primary-button">İlk şarkını ekle <ArrowRight size={16} /></Link> : <span className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white">Odaya girmek için davet bağlantını aç.</span>}{isAdmin && <Link href="/admin/songs" className="secondary-button border-white/25 bg-white/10">Şarkıları yönet <ArrowUpRight size={15} /></Link>}</div></div><div className="pointer-events-none relative hidden h-[255px] items-center justify-center lg:flex"><div className="absolute size-[270px] rounded-full bg-[#c080e2]/10 blur-2xl" /><div className="hero-vinyl" /><div className="glass-bar absolute right-[-2%] top-4 flex items-center gap-2 rounded-[13px] px-3 py-2 text-[11px] font-semibold text-[#f7dfec]"><span className="size-1.5 rounded-full bg-[#ff9b90]" /> Yalnızca davetliler</div></div>
    </section>
    <div className="mb-9 grid gap-3 sm:grid-cols-3">{[{ icon: UsersRound, label: 'Katıldığın oda', value: rooms.length }, { icon: Music2, label: 'Erişebildiğin şarkı', value: songs.length }, { icon: Mic2, label: 'Kaydedilen bölüm', value: recordingCountResult.count ?? 0 }].map(({ icon: Icon, label, value }) => <div data-reveal key={label} className="surface flex items-center justify-between rounded-[20px] px-5 py-[18px]"><div><p className="text-[13px] font-medium text-[#bbb7c9]">{label}</p><strong className="mt-1 block text-[28px] font-bold text-white">{String(value).padStart(2, '0')}</strong></div><div className="flex size-11 items-center justify-center rounded-[13px] bg-[#a887f4]/15 text-[#d0b9ff]"><Icon size={21} /></div></div>)}</div>
    <SectionLabel title="Odalarım" />
    {!rooms.length && <div className="surface rounded-[24px] p-7"><h2 className="text-lg font-bold">Henüz bir odaya katılmadın</h2><p className="mt-2 text-sm text-[#c0bace]">{isAdmin ? 'Şarkı yönetiminden bir şarkı seçip özel odanı oluştur.' : 'Arkadaşının gönderdiği özel davet bağlantısını aç. Katıldıktan sonra oda burada görünecek.'}</p>{isAdmin && <Link href="/admin/songs" className="primary-button mt-5">Şarkıları aç <ArrowRight size={16} /></Link>}</div>}
    <div className="grid gap-5 xl:grid-cols-2">{rooms.map(room => { const song = songs.find(s => s.id === room.song_id); return <div data-reveal key={room.id} className="surface interactive-card flex flex-col gap-5 rounded-[24px] p-5 sm:flex-row"><SongArt variant="card" title={song?.title} artist={song?.artist} /><div className="flex-1 py-1"><span className="rounded-full bg-[#ad96ff]/15 px-2.5 py-1 text-[10px] font-bold text-[#c9b8ff]">ÖZEL ODA</span><h3 className="mt-4 text-[23px] font-bold tracking-[-0.05em]">{room.name}</h3><p className="mt-2 text-xs text-[#9292a6]">{song?.title} · {song?.artist} · {timeLabel((song?.duration_seconds ?? 0) * 1000)}</p><Link href={`/rooms/${room.id}`} className="primary-button mt-6">Odayı görüntüle <ArrowRight size={14} /></Link></div></div>; })}</div>
    {isAdmin && query.cleanup === 'pending' && <StorageCleanupControl initialPending />}
    <div className="mt-7"><PreviewNotice>Burada yalnızca katıldığın odalar görünür. Odaya girerek kendi bölümünü kaydedebilir veya final videoyu izleyebilirsin.</PreviewNotice></div>
  </>;
}
