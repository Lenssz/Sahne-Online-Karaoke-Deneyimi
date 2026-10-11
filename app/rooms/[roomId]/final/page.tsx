import { FinalView } from '@/components/final-view';
import { PrivateMedia } from '@/components/private-media';
import { getRoom } from '@/lib/studio';
import type { RenderJob } from '@/lib/types';
export default async function FinalPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const { viewer, song, roles, assets } = await getRoom(roomId);
  const result = await viewer.db.from('render_jobs')
    .select('id,status,error_message,result_asset_id,created_at,updated_at')
    .eq('room_id', roomId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const renderJob = (result.data ?? null) as RenderJob | null;
  return <>
    <FinalView roomId={roomId} song={song} roles={roles}
      instrumentalReady={assets.some(a => a.kind === 'instrumental' && !!a.approved_at)}
      clipReady={assets.some(a => a.kind === 'clip')} isAdmin={viewer.isAdmin}
      renderJob={renderJob} renderSetupReady={!result.error} />
    <PrivateMedia assets={assets.filter(a => a.kind === 'final' && a.id !== renderJob?.result_asset_id)} />
  </>;
}
