import Link from 'next/link';
import { RecordingView } from '@/components/recording-view';
import { PageIntro, PreviewNotice } from '@/components/studio-ui';
import { getRoom } from '@/lib/studio';
export default async function RecordingPage({ params, searchParams }: { params: Promise<{ roomId: string }>; searchParams: Promise<{ role?: string }> }) {
  const { roomId } = await params;
  const { song, roles, myRoles, lyrics, recordings, recordingSetupReady, assets } = await getRoom(roomId);
  if (!myRoles.length) return <><PageIntro eyebrow="KAYIT STÜDYOSU" title="Henüz bir rolün yok" /><PreviewNotice>Oda sayfasına gidip boş şarkıcı rollerinden birini al. Birden fazla rol seçebilirsin.</PreviewNotice><Link href={`/rooms/${roomId}`} className="secondary-button mt-5">Odaya dön ve rol seç</Link></>;
  const selected = (await searchParams).role;
  const myRole = myRoles.find(role => role.roleId === selected) ?? myRoles[0];
  const clip = assets.find(a => a.kind === 'clip');
  return <><PageIntro eyebrow="KAYIT STÜDYOSU · ÖZEL ODA" title="Sıra sende, sahne hazır." description={`${myRole.name} rolünün sözlerini sırayla söyle.`} action={<Link href={`/rooms/${roomId}`} className="secondary-button">Odaya dön</Link>} /><div className="mb-5"><p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#d2bee9]">Söyleyeceğin rol</p><div className="flex flex-wrap gap-2">{myRoles.map(role => <Link key={role.roleId} href={`/rooms/${roomId}/record?role=${role.roleId}`} aria-current={role.roleId === myRole.roleId ? 'page' : undefined} className={role.roleId === myRole.roleId ? 'primary-button' : 'secondary-button'}>{role.name}</Link>)}</div></div><RecordingView key={myRole.roleId} roomId={roomId} song={song} roles={roles} myRole={myRole} lyrics={lyrics.filter(line => line.role_id === myRole.roleId)} recordings={recordings.filter(item => item.role_id === myRole.roleId)} recordingSetupReady={recordingSetupReady} clip={clip} /></>;
}
