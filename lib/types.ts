export type Song = { id: string; title: string; artist: string; duration_seconds: number; lyric_video_youtube_id?: string | null; lyric_video_offset_ms?: number };
export type DbRole = { id: string; song_id: string; name: string; color: string; position: number };
export type Lyric = { id: string; role_id: string; start_ms: number; end_ms: number; text: string };
export type Member = { room_id: string; user_id: string; display_name: string };
export type RoleClaim = { room_id: string; role_id: string; user_id: string };
export type Asset = { id: string; label: string; kind: string; approved_at?: string | null; created_at?: string };
export type RoomRecording = { lyric_id: string; role_id: string; asset_id: string; capture_start_ms: number; duration_ms: number; offset_ms: number };
export type RenderJob = { id: string; status: 'waiting' | 'processing' | 'ready' | 'error'; error_message: string | null; result_asset_id: string | null; created_at: string; updated_at: string };
export type VocalJob = { id: string; status: 'waiting' | 'processing' | 'ready' | 'error'; error_message: string | null; result_asset_id: string | null; created_at: string };
export type Room = { id: string; name: string; song_id: string; created_by: string };
export type ActionState = { error?: string; success?: string; url?: string; sent?: boolean };
export function timeLabel(ms: number) { return `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}`; }
