import 'server-only';
import { createHash } from 'node:crypto';
import type { getRoom } from '@/lib/studio';

type RoomState = Awaited<ReturnType<typeof getRoom>>;
export type RoomRenderState = {
  id: string; status: string; error_message: string | null; result_asset_id: string | null;
} | null;

// Query order must not cause an update when the room itself has not changed.
const rows = (items: unknown[]) => items.map(item => JSON.stringify(item)).sort();

export function roomRevision(state: RoomState, render: RoomRenderState,
  invites: { id: string; expires_at: string }[] = []) {
  return createHash('sha256').update(JSON.stringify({
    room: state.room, song: state.song,
    members: rows(state.members), claims: rows(state.claims), roles: rows(state.roles),
    recordings: rows(state.recordings), lyrics: rows(state.lyrics), assets: rows(state.assets),
    recordingSetupReady: state.recordingSetupReady,
    render, invites: rows(invites),
  })).digest('hex');
}
