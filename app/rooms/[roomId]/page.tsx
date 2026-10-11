import { RoomView } from '@/components/room-view';
import { ActionForm } from '@/components/action-form';
import { PrivateMedia } from '@/components/private-media';
import { getRoom } from '@/lib/studio';
import { inviteRoom, revokeInvite } from '@/app/admin/actions';
import { DeleteControl } from '@/components/delete-control';
import { RoomRoleManagement } from '@/components/room-role-management';
import { RoomLiveUpdates } from '@/components/room-live-updates';
import { roomRevision } from '@/lib/room-revision';

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const state = await getRoom(roomId);
  const { viewer, room, song, roles, assets, members, claims, recordings } = state;
  const invites = viewer.isAdmin ? await viewer.db.from('room_invites').select('id,expires_at').eq('room_id', roomId).is('role_id', null).is('email', null).is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString()) : null;
  const render = await viewer.db.from('render_jobs').select('id,status,error_message,result_asset_id').eq('room_id', roomId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (invites?.error) throw new Error('Davetler yüklenemedi.');
  return <><RoomLiveUpdates roomId={roomId} initialRevision={roomRevision(state, render.data, invites?.data ?? [])} initialMembers={members} /><RoomView roomId={roomId} song={song} roles={roles} isAdmin={viewer.isAdmin} renderStatus={render.data?.status ?? null} /><PrivateMedia assets={assets.filter(a => a.kind === 'clip' || (a.kind === 'instrumental' && a.approved_at))} />
    <RoomRoleManagement roomId={roomId} roles={roles} members={members} claims={claims} recordings={recordings} viewerId={viewer.user.id} isAdmin={viewer.isAdmin} creatorId={room.created_by} renderBusy={render.data?.status === 'waiting' || render.data?.status === 'processing'} />
    {viewer.isAdmin && <section className="surface mt-7 rounded-[24px] p-6"><h2 className="mb-2 text-lg font-bold">Odaya arkadaş davet et</h2><p className="mb-5 text-sm text-[#b8b4c8]">Her arkadaş için tek kullanımlık oda bağlantısı oluştur. Katılan kişi boş rollerden istediğini alabilir; bir kişi birden fazla rol söyleyebilir.</p><ActionForm action={inviteRoom} submit="Oda daveti oluştur" className="surface-soft max-w-xl rounded-2xl p-4"><input type="hidden" name="room_id" value={roomId} /></ActionForm>
      {!!invites?.data?.length && <h3 className="my-5 text-sm font-bold">Bekleyen davetler</h3>}{invites?.data?.map(i => <ActionForm key={i.id} action={revokeInvite} submit="Daveti iptal et" className="mb-3 rounded-xl border border-white/10 p-4"><input type="hidden" name="id" value={i.id} /><p className="text-xs">Oda daveti · {new Date(i.expires_at).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })} tarihine kadar</p></ActionForm>)}
    </section>}
    {viewer.isAdmin && <DeleteControl kind="room" id={roomId} name={room.name} summary={`${assets.filter(a => a.kind === 'recording').length} mikrofon kaydı ve ${assets.filter(a => a.kind === 'final').length} final video kalıcı olarak silinecek. Şarkı ve altyapı korunacak.`} blocked={render.data?.status === 'waiting' || render.data?.status === 'processing' ? 'Devam eden video işi bitene kadar oda silinemez.' : undefined} />}
  </>;
}
