"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioLines,
  Clapperboard,
  Disc3,
  Headphones,
  Home,
  LockKeyhole,
  Mic2,
  Music2,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth-actions";

export function AppShell({ children, user }: { children: ReactNode; user: { email: string | null; isAdmin: boolean } | null }) {
  const pathname = usePathname();
  const roomId = pathname.match(/^\/rooms\/([^/]+)/)?.[1];
  const navigation = user ? [
    { href: "/", label: "Genel bakış", icon: Home },
    ...(user.isAdmin ? [{ href: "/admin/songs", label: "Şarkı yönetimi", icon: Music2 }] : []),
    ...(roomId ? [
      { href: `/rooms/${roomId}`, label: "Özel oda", icon: UsersRound },
      { href: `/rooms/${roomId}/record`, label: "Kayıt stüdyosu", icon: Mic2 },
      { href: `/rooms/${roomId}/final`, label: "Final video", icon: Clapperboard },
    ] : []),
  ] : [{ href: "/login", label: "Giriş yap", icon: Home }];
  const current = navigation.find((item) => item.href === pathname) ?? navigation[0];

  return (
    <div className="app-frame min-h-screen lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="sidebar hidden border-r border-white/[0.10] px-5 py-7 lg:flex lg:flex-col">
        <Link href="/" className="mb-12 flex items-center gap-3 px-2" aria-label="Sahne ana sayfa">
          <span className="brand-mark flex size-11 items-center justify-center rounded-2xl"><AudioLines size={23} strokeWidth={2.5} /></span>
          <span className="text-[23px] font-bold tracking-[-0.07em] text-white">sahne<span className="text-[#ff9e97]">.</span></span>
        </Link>

        <p className="px-3 text-[11px] font-bold tracking-[0.20em] text-[#aaa2be]">ÇALIŞMA ALANI</p>
        <nav className="mt-4 space-y-1" aria-label="Ana menü">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined}
                className={`nav-link flex items-center gap-3 rounded-[14px] px-3 py-3.5 text-[14px] font-semibold transition-colors ${active ? "nav-link-active" : href.endsWith('/final') ? "text-[#ffc2b4] hover:bg-[#ffad9c]/10 hover:text-white" : "text-[#b4b3c5] hover:bg-white/[0.08] hover:text-white"}`}>
                <Icon size={18} strokeWidth={active ? 2.3 : 1.9} />
                {label}
                {active && <span className="ml-auto size-1.5 rounded-full bg-[#bd9bff]" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-5">
          {user?.isAdmin && <form action={signOut}><button className="secondary-button w-full">Çıkış yap</button></form>}
          <div className="sidebar-private rounded-[20px] p-4">
            <span className="mb-3 flex size-8 items-center justify-center rounded-[10px] bg-[#a88afa]/15 text-[#c4b1ff]"><LockKeyhole size={16} /></span>
            <p className="text-[13px] font-semibold text-white">Sadece sizin ekip</p>
            <p className="mt-1.5 text-[11px] leading-[1.55] text-[#8b8a9f]">Şarkılar ve odalar yalnızca davet ettiğin arkadaşların için.</p>
          </div>
          <div className="flex items-center gap-3 border-t border-white/[0.07] px-2 pt-5">
            <span className="flex size-9 items-center justify-center rounded-full bg-[#34304d] text-[12px] font-bold text-[#e1d5ff]">A</span>
            <span className="min-w-0"><span className="block text-[12px] font-semibold text-white">{user ? (user.isAdmin ? "Yönetici" : "Oda üyesi") : "Misafir"}</span><span className="block text-[10px] text-[#85869b]">{user?.isAdmin ? user.email : user ? 'Özel davet oturumu' : 'Davetli giriş'}</span></span>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="border-b border-white/[0.07] px-5 py-3.5 lg:hidden">
          <div className="flex items-center justify-between gap-3"><Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-[-0.07em] text-white"><span className="brand-mark flex size-8 items-center justify-center rounded-[11px]"><AudioLines size={18} /></span>sahne<span className="text-[#ff9e97]">.</span></Link>
          {user?.isAdmin && <form action={signOut}><button className="secondary-button min-h-9 px-3 text-xs">Çıkış</button></form>}</div>
          <nav className="mobile-nav mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Mobil menü">
            {navigation.map(({ href, label }) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined} className={`shrink-0 rounded-full border px-4 py-2.5 text-[13px] font-semibold transition-colors ${pathname === href ? "border-[#b896fa]/50 bg-[#58417d] text-white" : "border-white/10 bg-white/[0.06] text-[#dad4e9] hover:border-[#ad92e8]/45 hover:text-white"}`}>{label}</Link>)}
          </nav>
        </div>

        <header className="hidden h-[76px] items-center justify-between border-b border-white/[0.10] px-7 lg:flex xl:px-11">
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.16em]"><span className="text-[#77798b]">STÜDYO</span><span className="text-[#4e4f62]">/</span><span className="text-[#c0aecf]">{current.label.toLocaleUpperCase("tr-TR")}</span></div>
          <div className="flex items-center gap-5"><div className="flex items-center gap-2 rounded-full border border-[#4b3d67] bg-[#241e36] px-3 py-2 text-[11px] font-semibold text-[#c7b7e9]"><LockKeyhole size={12} /> Özel alan</div><div className="flex items-center gap-2 text-[#8d8da2]"><Headphones size={17} /><Disc3 size={17} /></div></div>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-[1440px] px-5 pb-16 pt-7 sm:px-7 lg:px-10 lg:pt-9 xl:px-11"><div key={pathname} className="page-content">{children}</div></main>
      </div>
    </div>
  );
}
