'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UsersRound } from 'lucide-react';

type LiveMember = { user_id: string; display_name: string };
type Update = { revision: string; members: LiveMember[] };

export function RoomLiveUpdates({ roomId, initialRevision, initialMembers }: {
  roomId: string; initialRevision: string; initialMembers: LiveMember[];
}) {
  const router = useRouter();
  const revisionRef = useRef(initialRevision);
  const membersRef = useRef(initialMembers);
  const [connected, setConnected] = useState(true);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    revisionRef.current = initialRevision;
    membersRef.current = initialMembers;
  }, [initialRevision, initialMembers]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let messageTimer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let failures = 0;

    const schedule = () => {
      if (!stopped && !document.hidden) {
        timer = setTimeout(check, Math.min(30000, 3000 * 2 ** failures));
      }
    };

    async function check() {
      if (stopped || document.hidden || controller) return;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      try {
        const response = await fetch(`/api/rooms/${roomId}/updates`, {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        if (stopped) return;
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          stopped = true;
          router.replace(response.status === 401 ? '/login' : '/');
          router.refresh();
          return;
        }
        if (!response.ok) throw new Error('Updates unavailable');
        const update = await response.json() as Update;
        if (stopped) return;
        failures = 0;
        setConnected(true);
        if (update.revision !== revisionRef.current) {
          const previousIds = new Set(membersRef.current.map(member => member.user_id));
          const joined = update.members.filter(member => !previousIds.has(member.user_id));
          if (joined.length) {
            setAnnouncement(`${joined.map(member => member.display_name).join(', ')} odaya katıldı.`);
            if (messageTimer) clearTimeout(messageTimer);
            messageTimer = setTimeout(() => setAnnouncement(''), 7000);
          }
          revisionRef.current = update.revision;
          membersRef.current = update.members;
          // Merge server changes; keep the scroll position, forms and media elements.
          router.refresh();
        }
      } catch {
        if (!stopped && !document.hidden) {
          failures = Math.min(failures + 1, 4);
          setConnected(false);
        }
      } finally {
        clearTimeout(timeout);
        controller = undefined;
        schedule();
      }
    }

    const resume = () => {
      if (timer) clearTimeout(timer);
      if (document.hidden) { controller?.abort(); return; }
      failures = 0;
      void check();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (messageTimer) clearTimeout(messageTimer);
      controller?.abort();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
    };
  }, [roomId, router]);

  return <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#171623] px-4 py-3 text-xs">
    <span className="inline-flex items-center gap-2 text-[#d2c7e8]"><UsersRound size={15} /> {initialMembers.length} kişi odada</span>
    <span className="inline-flex items-center gap-2 text-[#b8b2c9]"><span className={`size-2 rounded-full ${connected ? 'bg-[#a6e4c9]' : 'bg-[#f3d18d]'}`} />{connected ? 'Oda otomatik güncelleniyor' : 'Bağlantı bekleniyor; tekrar deneniyor'}</span>
    <p role="status" aria-live="polite" aria-atomic="true" className={announcement ? 'w-full pt-1 text-[#a6e4c9]' : 'sr-only'}>{announcement}</p>
  </div>;
}
