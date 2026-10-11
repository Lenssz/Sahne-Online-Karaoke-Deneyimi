'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SingerRole } from '@/lib/demo';
import type { Member, RoleClaim, RoomRecording } from '@/lib/types';

export function RoomRoleManagement({ roomId, roles, members, claims, recordings, viewerId, isAdmin, creatorId, renderBusy }: {
  roomId: string; roles: SingerRole[]; members: Member[]; claims: RoleClaim[];
  recordings: RoomRecording[]; viewerId: string; isAdmin: boolean; creatorId: string; renderBusy: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'role' | 'member'; id: string } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function change(kind: 'claim' | 'role' | 'member', id: string) {
    setPending(id); setError(''); setNotice('');
    try {
      const url = `/api/rooms/${roomId}/${kind === 'member' ? 'members' : 'roles'}`;
      const response = await fetch(url, { method: kind === 'claim' ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'member' ? { userId: id } : { roleId: id }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? 'İşlem yapılamadı.'); return; }
      setConfirm(null);
      if (body.cleanupPending) setNotice('Üyelik güncellendi. Dosyalar temizlik sırasında; yönetici depolama temizliğini yeniden deneyebilir.');
      router.refresh();
    } catch { setError('Bağlantı kurulamadı. Yeniden dene.'); }
    finally { setPending(''); }
  }
  const selected = confirm?.kind === 'role' ? roles.find(role => role.roleId === confirm.id) : members.find(member => member.user_id === confirm?.id);
  const affectedRoles = confirm?.kind === 'member' ? claims.filter(claim => claim.user_id === confirm.id).map(claim => claim.role_id) : confirm ? [confirm.id] : [];
  const affectedRecordings = recordings.filter(recording => affectedRoles.includes(recording.role_id)).length;
  return <section className="surface mt-7 rounded-[24px] p-6">
    <h2 className="text-lg font-bold">Şarkıcı rollerini paylaşın</h2>
    <p className="mt-2 text-sm leading-6 text-[#b8b4c8]">Bir kişi birden fazla rol alabilir. Örneğin üç kişi altı rolü paylaşabilir; final için bütün sözler kaydedilir.</p>
    {renderBusy && <p className="mt-3 text-sm text-[#ffbfab]">Video işi sürerken roller ve üyeler değiştirilemez.</p>}
    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{roles.map(role => {
      const claim = claims.find(item => item.role_id === role.roleId);
      const mine = claim?.user_id === viewerId;
      const count = recordings.filter(item => item.role_id === role.roleId).length;
      return <div key={role.roleId} className="surface-soft rounded-2xl p-4" style={{ borderColor: `${role.color}44` }}>
        <div className="flex items-start justify-between gap-3"><div><p className="font-bold" style={{ color: role.color }}>{role.name}</p><p className="mt-1 text-xs text-[#aaa7ba]">{claim ? mine ? 'Bu rol sende' : `${role.member} söylüyor` : 'Henüz alınmadı'}</p></div><span className="text-xs text-[#aaa7ba]">{count} kayıt</span></div>
        {!claim && role.roleId && <button type="button" disabled={Boolean(pending) || renderBusy} onClick={() => change('claim', role.roleId!)} className="primary-button mt-4 disabled:opacity-50">{pending === role.roleId ? 'Alınıyor…' : 'Bu rolü al'}</button>}
        {claim && isAdmin && role.roleId && <button type="button" disabled={Boolean(pending) || renderBusy} onClick={() => setConfirm({ kind: 'role', id: role.roleId! })} className="secondary-button mt-4 disabled:opacity-50">Rolden çıkar</button>}
      </div>;
    })}</div>
    <div className="mt-7 border-t border-white/10 pt-6"><h3 className="font-bold">Oda üyeleri</h3><p className="mt-1 text-xs text-[#aaa7ba]">{isAdmin ? 'Üyeyi çıkarmak onun bütün rollerini boşaltır.' : 'Odaya katılan arkadaşların ve seçtikleri roller burada görünür.'}</p><div className="mt-4 grid gap-3 md:grid-cols-2">{members.map(member => {
      const memberRoles = claims.filter(claim => claim.user_id === member.user_id);
      return <div key={member.user_id} className="surface-soft flex flex-wrap items-center justify-between gap-3 rounded-xl p-4"><div><p className="font-semibold">{member.display_name}{member.user_id === creatorId ? ' · Kurucu' : ''}</p><p className="mt-1 text-xs text-[#aaa7ba]">{memberRoles.length ? memberRoles.map(claim => roles.find(role => role.roleId === claim.role_id)?.name).join(', ') : 'Henüz rol almadı'}</p></div>{isAdmin && member.user_id !== creatorId && <button type="button" disabled={Boolean(pending) || renderBusy} onClick={() => setConfirm({ kind: 'member', id: member.user_id })} className="secondary-button disabled:opacity-50">Odadan çıkar</button>}</div>;
    })}</div></div>
    {confirm && selected && <div role="dialog" aria-modal="true" aria-label="Çıkarma onayı" className="mt-6 rounded-2xl border border-[#ff9b95]/35 bg-[#30232e] p-5"><p className="font-bold text-[#ffd0c9]">{confirm.kind === 'role' ? `${(selected as SingerRole).name} rolü boşaltılsın mı?` : `${(selected as Member).display_name} odadan çıkarılsın mı?`}</p><p className="mt-2 text-sm leading-6 text-[#ead8df]">{affectedRecordings} mikrofon kaydı silinecek; varsa eski final video geçersizleşip silinecek. Diğer kişilerin kayıtları kalacak. Bu işlem geri alınamaz.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={Boolean(pending)} onClick={() => change(confirm.kind, confirm.id)} className="rounded-xl bg-[#bd626b] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{pending ? 'İşleniyor…' : 'Evet, çıkar'}</button><button type="button" disabled={Boolean(pending)} onClick={() => setConfirm(null)} className="secondary-button">Vazgeç</button></div></div>}
    {error && <p role="alert" className="mt-4 text-sm text-[#ffaaa4]">{error}</p>}
    {notice && <p role="status" className="mt-4 text-sm text-[#a6e4c9]">{notice}</p>}
  </section>;
}
