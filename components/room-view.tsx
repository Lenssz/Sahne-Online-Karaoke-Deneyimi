import Link from "next/link";
import { ArrowRight, Clapperboard, Headphones, LockKeyhole, Mic2, Radio, UsersRound } from "lucide-react";
import type { SingerRole } from "@/lib/demo";
import { PageIntro, PreviewNotice, RoleAvatar, SectionLabel, SongArt, StatusPill } from "@/components/studio-ui";

export function RoomView({ roomId, song, roles, isAdmin, renderStatus }: { roomId: string; song: { title: string; artist: string; duration: string; roomName: string; duration_seconds: number }; roles: SingerRole[]; isAdmin: boolean; renderStatus: string | null }) {
  const completedCount = roles.filter(role => role.status === 'complete').length;
  const allRecorded = roles.length > 0 && completedCount === roles.length;
  const finalReady = renderStatus === 'ready';
  const finalLabel = finalReady ? 'Final videoyu izle' : allRecorded && isAdmin ? 'Finale geç ve oluştur' : 'Final video ekranına git';
  return (
    <>
      <PageIntro eyebrow="ÖZEL ODA · ÖZEL ALAN" title={song.roomName} description="Herkes kendi bölümünü kaydeder; tamamlanan sesler tek bir klipte birleşir."
        action={<div className="flex flex-wrap gap-3"><Link href={`/rooms/${roomId}/record`} className={allRecorded ? 'secondary-button' : 'primary-button'}><Mic2 size={17} /> {allRecorded ? 'Kayıt stüdyosu' : 'Kayda geç'} {!allRecorded && <ArrowRight size={16} />}</Link><Link href={`/rooms/${roomId}/final`} className={allRecorded ? 'final-button' : 'secondary-button'}><Clapperboard size={18} /> {finalLabel} {allRecorded && <ArrowRight size={17} />}</Link></div>} />

      <div className="mb-7 grid gap-4 lg:grid-cols-[1.55fr_.8fr]">
        <div data-reveal className="surface relative overflow-hidden rounded-[23px] px-5 py-5 sm:px-6">
          <div className="absolute -right-12 -top-14 size-48 rounded-full bg-[#9a6be2]/10 blur-2xl" />
          <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center"><SongArt title={song.title} artist={song.artist} variant="small" /><div className="flex-1"><span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.13em] text-[#bca1f1]"><LockKeyhole size={11} /> ARKADAŞ GRUBU ODASI</span><h2 className="mt-1 text-[22px] font-bold tracking-[-0.04em]">{song.title}</h2><p className="mt-1 text-[11px] text-[#9291a5]">{song.artist} · {song.duration} · {roles.length} şarkıcı rolü</p></div><span className="rounded-full bg-[#8fd7b8]/10 px-3 py-1.5 text-[10px] font-bold text-[#a6e4c9]">Oda açık</span></div>
          <div className="relative mt-6 flex items-center justify-between text-[13px] font-semibold"><span className="text-[#d0cbdc]">Kayıt ilerlemesi</span><span className="text-[#e0cfff]">{completedCount} / {roles.length} rol tamamlandı</span></div>
          <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-[#39344e]"><div className="record-progress h-full rounded-full bg-gradient-to-r from-[#9675eb] via-[#bb88dc] to-[#ef99a6]" style={{ width: `${roles.length ? completedCount / roles.length * 100 : 0}%` }} /></div>
          <p className="relative mt-3 text-[13px] text-[#c4bed0]">Kaydedilen bölümler aşağıdaki rol kartlarında görünür.</p>
        </div>

        <div data-reveal className="surface flex flex-col justify-between rounded-[23px] p-5 sm:p-6">
          <div><span className="flex size-10 items-center justify-center rounded-[13px] bg-[#b498fb]/12 text-[#c1aaff]"><UsersRound size={20} /></span><h3 className="mt-3 text-[16px] font-bold">Davetli arkadaşlar</h3><p className="mt-1.5 text-[13px] leading-[1.6] text-[#b4b1c5]">Arkadaşların odaya katılıp boş rolleri seçer. Bir kişi birkaç rol söyleyebilir.</p></div>

          <p className="mt-3 text-[12px] text-[#a7a1ba]">Yönetici aşağıdaki oda daveti alanından arkadaşlarını ekleyebilir.</p>
        </div>
      </div>

      <SectionLabel title="Şarkıcı rolleri" hrefLabel={`${roles.length} rol`} />
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {roles.map((role) => (
          <div data-reveal key={role.id} className="surface interactive-card group rounded-[20px] p-4" style={{ borderColor: `${role.color}30` }}>
            <div className="flex items-start justify-between gap-3"><RoleAvatar role={role} size="large" /><StatusPill status={role.status} /></div>
            <div className="mt-5"><p className="text-[17px] font-bold text-white">{role.name}</p><p className="mt-1 text-[12px] text-[#b7b3c6]">{role.member}</p></div>
            <div className="mt-4 flex items-center justify-between border-t border-white/[0.10] pt-3"><span className="text-[12px] text-[#aaa8bd]">{role.part}</span><span className="text-[11px] font-bold" style={{ color: role.color }}>ROL {String(role.id).padStart(2, "0")}</span></div>
          </div>
        ))}
      </div>

      <div className="mt-7 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div data-reveal className="surface-soft flex items-center gap-4 rounded-[20px] p-5"><span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[#b396f9]/10 text-[#c4adfc]"><Headphones size={20} /></span><div><p className="text-sm font-bold text-white">Kulaklığını hazırla</p><p className="mt-1 text-xs leading-[1.6] text-[#b7b1c7]">Kayıtta orijinal klibi kulaklıktan dinle; klip sesi mikrofona karışmasın.</p></div></div>
        <div data-reveal className="surface-soft flex items-center gap-4 rounded-[20px] p-5"><span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[#ff9c91]/10 text-[#ffaaa3]"><Radio size={20} /></span><div><p className="text-sm font-bold text-white">Herkes kendi zamanında</p><p className="mt-1 text-xs leading-[1.6] text-[#b7b1c7]">Canlı görüşme gerekmez; her şarkıcı kendi bölümünü ayrı kaydeder.</p></div></div>
      </div>

      <div data-reveal className="final-callout mt-8 flex flex-col gap-5 rounded-[24px] p-6 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-[#ffb29f]/15 text-[#ffd0c2]"><Clapperboard size={23} /></span><div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#ffc3b5]">SIRADAKİ ADIM · FİNAL VİDEO</p><h2 className="mt-1 text-[20px] font-bold text-white">{finalReady ? 'Klibiniz izlemeye hazır' : allRecorded ? 'Kayıtlar tamam, final zamanı' : 'Final klibiniz burada hazırlanacak'}</h2><p className="mt-2 max-w-[550px] text-[13px] leading-6 text-[#e0d2e0]">{finalReady ? 'Odadaki arkadaşlarınla birlikte oluşturduğunuz videoyu aç.' : allRecorded ? isAdmin ? 'Final ekranına geçip tüm sesleri kliple birleştir.' : 'Yönetici videoyu oluşturduğunda burada izleyebilirsin.' : `${roles.length - completedCount} rol daha tamamlandığında yönetici final videoyu oluşturabilir.`}</p></div></div>
        <Link href={`/rooms/${roomId}/final`} className={`${allRecorded ? 'final-button' : 'secondary-button'} w-full shrink-0 sm:w-auto`}><Clapperboard size={18} /> {finalLabel} <ArrowRight size={17} /></Link>
      </div>
      <div className="mt-5"><PreviewNotice>Oda yalnızca üyelerine açıktır. Aldığın rollerin sözlerini sırayla kaydedebilirsin.</PreviewNotice></div>
    </>
  );
}
