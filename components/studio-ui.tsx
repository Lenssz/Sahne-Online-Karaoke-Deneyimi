import type { ReactNode } from "react";
import { ArrowUpRight, Check, Clock3, Radio, Sparkles } from "lucide-react";
import type { RoleStatus, SingerRole } from "@/lib/demo";

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow mb-3">{eyebrow}</p><h1 className="page-title">{title}</h1>{description && <p className="mt-3 max-w-[700px] text-[14px] leading-7 text-[#c0bfd0]">{description}</p>}</div>{action}</div>;
}

export function StatusPill({ status }: { status: RoleStatus }) {
  const map = {
    complete: { label: "Tamamlandı", icon: Check, cls: "status-complete" },
    recording: { label: "Kayıtta", icon: Radio, cls: "status-recording" },
    waiting: { label: "Bekliyor", icon: Clock3, cls: "status-waiting" },
  };
  const item = map[status];
  const Icon = item.icon;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${item.cls}`}><Icon size={13} />{item.label}</span>;
}

export function RoleAvatar({ role, size = "normal" }: { role: SingerRole; size?: "normal" | "large" }) {
  return <span className={`flex shrink-0 items-center justify-center rounded-[15px] font-bold text-[#171422] ${size === "large" ? "size-12 text-sm" : "size-10 text-xs"}`} style={{ backgroundColor: role.color }} aria-hidden="true">{role.initials}</span>;
}

export function SongArt({ variant = "card", title = "Sahne", artist = "Özel stüdyo" }: { variant?: "card" | "large" | "small"; title?: string; artist?: string }) {
  return <div className={`song-art song-art-${variant} relative flex shrink-0 items-center justify-center overflow-hidden`} aria-label={`${title} için soyut kapak görseli`} role="img"><div className="song-art-disc" /><div className="song-art-shine" /><div className="song-art-words absolute bottom-5 left-5 z-10"><span className="block text-[9px] font-bold tracking-[0.34em] text-white/65">{artist.toLocaleUpperCase("tr-TR")}</span><span className="mt-1 block text-[27px] font-black leading-none tracking-[-0.08em] text-white">{title.toLocaleUpperCase("tr-TR")}</span></div></div>;
}

const wave = [19, 35, 23, 42, 28, 18, 50, 35, 26, 47, 63, 36, 23, 55, 39, 70, 48, 31, 57, 43, 27, 62, 41, 22, 36, 58, 31, 44, 20, 39, 57, 27, 46, 35, 24, 52, 31, 17];

export function Waveform({ className = "", active = false }: { className?: string; active?: boolean }) {
  return <div className={`flex h-16 items-center gap-[3px] overflow-hidden ${className}`} aria-hidden="true">{wave.map((height, index) => <span key={index} className={`min-w-[3px] flex-1 rounded-full ${active && index < 16 ? "bg-[#b69bff]" : "bg-[#615979]"}`} style={{ height: `${height}%` }} />)}</div>;
}

export function PreviewNotice({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-2 rounded-[14px] border border-[#9277c9]/45 bg-[#3b2d53]/65 px-4 py-3.5 text-[12px] leading-[1.6] text-[#e4d8f9]"><Sparkles size={16} className="mt-[1px] shrink-0 text-[#d8bcff]" /><span>{children}</span></div>;
}

export function SectionLabel({ title, hrefLabel }: { title: string; hrefLabel?: string }) {
  return <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-[19px] font-bold tracking-[-0.025em] text-white">{title}</h2>{hrefLabel && <span className="flex items-center gap-1 text-[12px] font-semibold text-[#ceb5ff]">{hrefLabel}<ArrowUpRight size={14} /></span>}</div>;
}
