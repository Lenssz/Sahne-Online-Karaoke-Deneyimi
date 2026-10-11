import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Clapperboard,
  Clock3,
  Download,
  Film,
  LockKeyhole,
  Play,
  SlidersHorizontal,
  Volume2,
} from "lucide-react";
import type { SingerRole } from "@/lib/demo";
import type { RenderJob } from "@/lib/types";
import { RenderControl } from "@/components/render-control";
import { PageIntro, PreviewNotice, RoleAvatar, SectionLabel, SongArt, Waveform } from "@/components/studio-ui";

export function FinalView({ roomId, song, roles, instrumentalReady, clipReady, isAdmin, renderJob, renderSetupReady }: { roomId: string; song: { title: string; artist: string; duration: string; roomName: string; duration_seconds: number }; roles: SingerRole[]; instrumentalReady: boolean; clipReady: boolean; isAdmin: boolean; renderJob: RenderJob | null; renderSetupReady: boolean }) {
  const completedCount = roles.filter(role => role.status === 'complete').length;
  return (
    <>
      <PageIntro eyebrow="SON GÖSTERİM · ÖZEL ALAN" title="Final video" description={renderJob?.status === 'ready' ? 'Klibiniz hazır. Oynat düğmesine basarak birlikte oluşturduğunuz videoyu izle.' : 'Tüm kayıtlar tamamlandığında yönetici videoyu oluşturabilir; sonuç yalnızca oda üyelerine açılır.'}
        action={<Link href={`/rooms/${roomId}`} className="secondary-button"><ArrowLeft size={15} /> Odaya dön</Link>} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#ad94e3]/35 bg-[#2b2440] px-5 py-4"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-[12px] bg-[#b195ed]/20 text-[#d7c1ff]"><Clock3 size={19} /></span><div><p className="text-[14px] font-bold text-white">{completedCount === roles.length ? 'Ses kayıtları hazır' : 'Henüz tüm sesler hazır değil'}</p><p className="mt-0.5 text-[12px] text-[#d0c4dd]">{completedCount} / {roles.length} rol tamamlandı · {renderJob?.status === 'ready' ? 'video hazır' : 'final video bekleniyor'}</p></div></div><div className="h-2 w-32 overflow-hidden rounded-full bg-[#54475e]"><div className="h-full rounded-full bg-[#b397f1]" style={{ width: `${roles.length ? completedCount / roles.length * 100 : 0}%` }} /></div></div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.48fr)_minmax(285px,.78fr)]">
        <div className="min-w-0 space-y-6">
          <div data-reveal className="surface overflow-hidden rounded-[24px] p-3 sm:p-4">
            {renderJob?.status === 'ready' && renderJob.result_asset_id ? <video className="aspect-video w-full rounded-[20px] bg-black" controls controlsList="nodownload" preload="none" src={`/api/media/${renderJob.result_asset_id}`} /> : <div className="relative aspect-video min-h-[250px] overflow-hidden rounded-[20px] bg-[#24182d]"><div className="absolute inset-0"><SongArt title={song.title} artist={song.artist} variant="large" /></div><div className="absolute inset-0 bg-[#0e0d18]/55" /><div className="absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#16121d]/60 px-3 py-1.5 text-[10px] font-bold text-white/80 backdrop-blur-lg"><LockKeyhole size={12} /> ODANIZA ÖZEL</div><div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-5 text-center"><span className="flex size-16 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white/75 backdrop-blur-md"><Play size={24} fill="currentColor" className="ml-1" /></span><h2 className="mt-5 text-[21px] font-bold tracking-[-0.035em] text-white">Klibinizin ilk gösterimi burada</h2><p className="mt-2 max-w-[320px] text-[11px] leading-[1.6] text-white/70">{roles.length} ses tamamlandıktan sonra oluşturulacak video bu alanda izlenebilecek.</p></div><div className="absolute bottom-4 left-4 right-4 z-10 flex justify-between text-[10px] font-medium text-white/60"><span>{song.title} · {song.artist}</span><span>{song.duration}</span></div></div>}
            <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-1 pt-4"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-[10px] bg-[#b399fa]/15 text-[#d6c4ff]"><Film size={19} /></span><div><p className="text-[14px] font-bold">{song.title} — final klip</p><p className="mt-0.5 text-[12px] text-[#b3afc4]">720p MP4 · yalnızca oda üyeleri</p></div></div>{renderJob?.status === 'ready' && renderJob.result_asset_id ? <a className="primary-button" href={`/api/media/${renderJob.result_asset_id}?download=1`}><Download size={16} /> Videoyu indir</a> : <span className="rounded-full border border-white/10 bg-white/[0.075] px-3 py-1.5 text-[11px] font-bold text-[#e2d9ee]">HAZIRLANMADI</span>}</div>
          </div>

          <div data-reveal className="surface rounded-[24px] p-5 sm:p-6"><SectionLabel title="Finale giden yol" /><div className="grid gap-3 md:grid-cols-3">{[
            { icon: Check, title: "Altyapı", subtitle: "Vokalsiz müzik", done: instrumentalReady },
            { icon: Volume2, title: "Ses kayıtları", subtitle: `${completedCount} / ${roles.length} rol hazır`, done: completedCount === roles.length },
            { icon: Clapperboard, title: "Video oluşturma", subtitle: renderJob?.status === 'ready' ? 'Final hazır' : renderJob?.status === 'processing' ? 'Bilgisayarda işleniyor' : renderJob?.status === 'waiting' ? 'Sırada bekliyor' : 'Bilgisayarda yapılacak', done: renderJob?.status === 'ready' },
          ].map(({ icon: Icon, title, subtitle, done }, index) => <div key={title} className="surface-soft rounded-[16px] p-4"><div className="flex items-center justify-between"><span className={`flex size-9 items-center justify-center rounded-[10px] ${done ? "bg-[#8ccead]/18 text-[#b6f0cf]" : "bg-[#a892e2]/15 text-[#cbb3ff]"}`}><Icon size={18} /></span><span className="text-[11px] font-bold text-[#aaa4b8]">0{index + 1}</span></div><p className="mt-4 text-[14px] font-bold">{title}</p><p className="mt-1 text-[12px] text-[#bbb7cc]">{subtitle}</p></div>)}</div><RenderControl roomId={roomId} initialJob={renderJob} isAdmin={isAdmin} allRecorded={roles.length > 0 && completedCount === roles.length} sourcesReady={instrumentalReady && clipReady} setupReady={renderSetupReady} /></div>
        </div>

        <aside className="space-y-5">
          <div data-reveal className="surface rounded-[24px] p-5"><div className="flex items-center justify-between"><div><p className="eyebrow">SES MASASI</p><h2 className="mt-2 text-[17px] font-bold">{roles.length} ses, tek şarkı</h2></div><SlidersHorizontal size={18} className="text-[#a998cf]" /></div><p className="mt-2 text-[10px] leading-5 text-[#9292a6]">Her kişinin sesi altyapıyla burada birleştirilecek.</p><div className="mt-5 space-y-2.5">{roles.map((role) => <div key={role.id} className="rounded-[14px] border border-white/[0.055] bg-[#141520] px-3 py-2.5"><div className="flex items-center gap-2.5"><RoleAvatar role={role} /><div className="min-w-0 flex-1"><p className="text-[11px] font-bold text-white">{role.name}</p><p className="mt-0.5 text-[9px] text-[#8c8b9e]">{role.status === "complete" ? `${role.member} · kayıt hazır` : `${role.member} · kayıt bekleniyor`}</p></div><span className="size-1.5 rounded-full" style={{ backgroundColor: role.status === "complete" ? role.color : "#69697d" }} /></div><Waveform className={`mt-2 h-5 ${role.status !== "complete" ? "opacity-25" : "opacity-75"}`} active={role.status === "complete"} /></div>)}</div></div>
          <div data-reveal className="surface-soft rounded-[21px] p-5"><span className="flex size-9 items-center justify-center rounded-[11px] bg-[#a58aed]/12 text-[#c5aff7]"><LockKeyhole size={17} /></span><h3 className="mt-3 text-[13px] font-bold">Paylaşım odada kalır</h3><p className="mt-1.5 text-[10px] leading-[1.7] text-[#9191a5]">Final video hazır olunca davetli arkadaşların özel bağlantıdan izleyebilecek. Medya bağlantıları üyelik kontrolünden sonra 5 dakikalığına açılır.</p></div>
          <PreviewNotice>İş tamamlandığında özel video bağlantısı yalnızca oda üyelerine 5 dakikalığına verilir.</PreviewNotice>
        </aside>
      </div>
    </>
  );
}
