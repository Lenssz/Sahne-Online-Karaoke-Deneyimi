import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { PageIntro, SectionLabel } from '@/components/studio-ui';
import { ActionForm } from '@/components/action-form';
import { MediaUpload } from '@/components/media-upload';
import { PrivateMedia } from '@/components/private-media';
import { VocalJobPanel } from '@/components/vocal-job-panel';
import { DeleteControl } from '@/components/delete-control';
import { RoleCountControl } from '@/components/role-count-control';
import { createRoom, saveRole, saveLyric, deleteLyric } from '@/app/admin/actions';
import { fieldClass } from '@/lib/styles';
import type { Asset, DbRole, Lyric, VocalJob } from '@/lib/types';
import { timeLabel } from '@/lib/types';

export default async function SongEditor({ params }: { params: Promise<{ songId: string }> }) {
  const { db } = await requireAdmin();
  const { songId } = await params;
  if (!z.uuid().safeParse(songId).success) notFound();
  const [song, roleResult, assetResult, jobResult, usageResult, roomCount, activeJob] = await Promise.all([
    db.from('songs').select('*').eq('id', songId).maybeSingle(),
    db.from('song_roles').select('*').eq('song_id', songId).order('position'),
    db.from('media_assets').select('*').eq('song_id', songId).order('created_at', { ascending: false }),
    db.from('vocal_jobs').select('id,status,error_message,result_asset_id,created_at').eq('song_id', songId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.rpc('studio_storage_usage'),
    db.from('rooms').select('id', { count: 'exact', head: true }).eq('song_id', songId),
    db.from('vocal_jobs').select('id').eq('song_id', songId).in('status', ['waiting', 'processing']).limit(1),
  ]);
  if (song.error || roleResult.error || assetResult.error || roomCount.error || activeJob.error) throw new Error('Şarkı yüklenemedi.');
  if (!song.data) notFound();
  const roles = roleResult.data as DbRole[];
  const lyricResult = roles.length ? await db.from('lyrics').select('*').in('role_id', roles.map(role => role.id)).order('start_ms') : { data: [], error: null };
  if (lyricResult.error) throw new Error('Sözler yüklenemedi.');
  const lyrics = lyricResult.data as Lyric[];
  const assets = assetResult.data.map(item => ({ id: item.id, label: item.label, kind: item.kind, approved_at: item.approved_at ?? null, created_at: item.created_at })) as Asset[];
  const clips = assets.filter(asset => asset.kind === 'clip');
  const instrumentals = assets.filter(asset => asset.kind === 'instrumental');
  const setupReady = !jobResult.error && !usageResult.error;
  return <><PageIntro eyebrow="YÖNETİCİ ALANI" title={song.data.title} description={`${song.data.artist} · ${timeLabel(song.data.duration_seconds * 1000)} · ${roles.length} rol · özel medya`} action={<Link href="/admin/songs" className="secondary-button">Kitaplığa dön</Link>} />
    <RoleCountControl songId={songId} roles={roles.map(role => ({ name: role.name, position: role.position, lines: lyrics.filter(line => line.role_id === role.id).length }))} blocked={(roomCount.count ?? 0) > 0} />
    <div className="grid gap-6 xl:grid-cols-[1.5fr_.8fr]"><section><SectionLabel title="Şarkıcı rolleri ve sözleri" /><div className="space-y-4">{roles.map(role => <div key={role.id} className="surface rounded-[24px] p-5" style={{ borderColor: `${role.color}40` }}>
      <ActionForm action={saveRole} submit="Rolü kaydet"><input type="hidden" name="id" value={role.id} /><div className="flex gap-4"><label className="block flex-1 text-xs">Rol {role.position}<input name="name" required maxLength={80} defaultValue={role.name} className={fieldClass} /></label><label className="block text-xs">Renk<input type="color" name="color" defaultValue={role.color} className="mt-2 block h-11 w-16" /></label></div></ActionForm>
      <div className="mt-5 space-y-2">{lyrics.filter(line => line.role_id === role.id).map(line => <details key={line.id} className="surface-soft rounded-xl p-3"><summary className="cursor-pointer text-xs leading-6">{timeLabel(line.start_ms)} – {timeLabel(line.end_ms)} · {line.text}</summary><ActionForm action={saveLyric} submit="Satırı güncelle" className="mt-4"><input type="hidden" name="role_id" value={role.id} /><input type="hidden" name="start_ms" value={line.start_ms} /><p className="text-xs text-[#9292a6]">Başlangıç: {line.start_ms} ms. Başlangıcı değiştirmek için satırı silip yenisini ekle.</p><label className="block text-xs">Bitiş (ms)<input type="number" required name="end_ms" min={line.start_ms + 1} max={song.data.duration_seconds * 1000} defaultValue={line.end_ms} className={fieldClass} /></label><label className="block text-xs">Söz<textarea required name="text" maxLength={1000} defaultValue={line.text} className={fieldClass} /></label></ActionForm><ActionForm action={deleteLyric} submit="Satırı sil" className="mt-3"><input type="hidden" name="id" value={line.id} /></ActionForm></details>)}</div>
      <details className="mt-5"><summary className="cursor-pointer text-xs font-bold text-[#c7b7e9]">+ Zamanlı söz satırı ekle</summary><ActionForm action={saveLyric} submit="Söz satırını kaydet" className="mt-4"><input type="hidden" name="role_id" value={role.id} /><div className="grid grid-cols-2 gap-3"><label className="text-xs">Başlangıç (ms)<input type="number" name="start_ms" required min={0} max={song.data.duration_seconds * 1000 - 1} className={fieldClass} placeholder="32000" /></label><label className="text-xs">Bitiş (ms)<input type="number" name="end_ms" required min={1} max={song.data.duration_seconds * 1000} className={fieldClass} placeholder="38000" /></label></div><label className="block text-xs">Söz<textarea required name="text" maxLength={1000} className={fieldClass} /></label><p className="text-xs text-[#9292a6]">1000 ms = 1 saniye. Aynı başlangıç zamanı mevcut satırı günceller.</p></ActionForm></details>
    </div>)}</div></section><aside className="space-y-5"><section className="surface rounded-[24px] p-5"><SectionLabel title="Özel oda oluştur" /><ActionForm action={createRoom} submit="Odayı oluştur"><input type="hidden" name="song_id" value={songId} /><label className="text-xs">Oda adı<input name="name" required maxLength={120} defaultValue="Bizim Sahne" className={fieldClass} /></label></ActionForm></section><section className="surface rounded-[24px] p-5"><SectionLabel title="Şarkı klibi" /><MediaUpload songId={songId} kind="clip" /></section><PrivateMedia assets={clips} />
      {setupReady ? <VocalJobPanel songId={songId} clips={clips} instrumentals={instrumentals} job={jobResult.data as VocalJob | null} usedBytes={Number(usageResult.data)} /> : <div className="surface rounded-[22px] p-5 text-xs leading-6 text-[#ffb4a9]">Vokal işleri için son veritabanı güncellemesini SQL Editor&apos;de uygula: <code>202609250003_song_studio_jobs.sql</code>.</div>}
      <section className="surface rounded-[24px] p-5"><SectionLabel title="Elle altyapı yükle" /><p className="mb-4 text-xs leading-6 text-[#aaa1b8]">Hazır vokalsiz parçan varsa yükle. Yükledikten sonra dinleyip yukarıdan onayla.</p><MediaUpload songId={songId} kind="instrumental" /></section></aside></div>
    <DeleteControl kind="song" id={songId} name={song.data.title} summary={`${assets.length} klip/altyapı dosyası, roller ve zamanlı sözler kalıcı olarak silinecek.`} blocked={(roomCount.count ?? 0) > 0 ? `Önce bu şarkıya bağlı ${roomCount.count} odayı sil.` : activeJob.data?.length ? 'Vokal ayırma işi bitene kadar şarkı silinemez.' : undefined} />
  </>;
}
