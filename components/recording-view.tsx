'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Headphones, Mic2, Play, RotateCcw, Save, Volume2 } from 'lucide-react';
import type { SingerRole } from '@/lib/demo';
import type { Asset, Lyric, RoomRecording } from '@/lib/types';
import { timeLabel } from '@/lib/types';
import { RoleAvatar } from '@/components/studio-ui';

type Props = {
  roomId: string;
  song: { title: string; artist: string; duration: string; roomName: string; duration_seconds: number };
  roles: SingerRole[];
  myRole: SingerRole;
  lyrics: Lyric[];
  recordings: RoomRecording[];
  recordingSetupReady: boolean;
  clip?: Asset;
};
type Draft = { blob: Blob; url: string; start: number; duration: number };
type Phase = 'idle' | 'loading' | 'preview' | 'recording' | 'testing' | 'uploading';
type MicMode = 'natural' | 'clean';
type MicDevice = { deviceId: string; label: string };
const micModeLabels: Record<MicMode, string> = { natural: 'Doğal ses', clean: 'Gürültülü ortam' };
function mimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type)) ?? null;
}
function errorText(error: unknown) {
  if (error instanceof DOMException && error.name === 'NotAllowedError') return 'Mikrofon izni reddedildi. Tarayıcı adres çubuğundan izin ver.';
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'Mikrofon bulunamadı. Windows mikrofon ayarlarını kontrol et.';
  return error instanceof Error ? error.message : 'İşlem tamamlanamadı.';
}
async function loadAt(media: HTMLMediaElement, assetId: string, start: number) {
  media.src = '/api/media/' + assetId + '?v=' + Date.now();
  media.load();
  if (media.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise<void>((resolve, reject) => {
      media.addEventListener('loadedmetadata', () => resolve(), { once: true });
      media.addEventListener('error', () => reject(new Error('Özel medya açılamadı.')), { once: true });
    });
  }
  if (start > 0) {
    media.currentTime = start;
    await new Promise<void>((resolve) => {
      if (Math.abs(media.currentTime - start) < 0.08 && !media.seeking) { resolve(); return; }
      media.addEventListener('seeked', () => resolve(), { once: true });
    });
  }
}

export function RecordingView({ roomId, song, roles, myRole, lyrics, recordings, recordingSetupReady, clip }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(recordings);
  const [selectedId, setSelectedId] = useState(lyrics.find(line => !recordings.some(item => item.lyric_id === line.id))?.id ?? lyrics[0]?.id);
  const [clipVolume, setClipVolume] = useState(45);
  const [clipStarted, setClipStarted] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [micSwitching, setMicSwitching] = useState(false);
  const [micMode, setMicMode] = useState<MicMode>('natural');
  const [micDevice, setMicDevice] = useState('default');
  const [micDevices, setMicDevices] = useState<MicDevice[]>([]);
  const [micSettings, setMicSettings] = useState<MediaTrackSettings | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [testSamples, setTestSamples] = useState<Partial<Record<MicMode, string>>>({});
  const [headphones, setHeadphones] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [offset, setOffset] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const micRef = useRef<MediaStream | null>(null);
  const meterContextRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const testRecorderRef = useRef<MediaRecorder | null>(null);
  const testTimerRef = useRef<number | null>(null);
  const testSamplesRef = useRef<Partial<Record<MicMode, string>>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const draftUrlRef = useRef<string | null>(null);
  const startRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const captureFailedRef = useRef(false);
  const selected = lyrics.find(line => line.id === selectedId);
  const take = saved.find(item => item.lyric_id === selectedId);
  const next = lyrics.find(line => !saved.some(item => item.lyric_id === line.id));
  const inOrder = !!selected && (next?.id === selected.id || !!take);

  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) return;
    const refresh = () => { void media.enumerateDevices().then(devices => {
      setMicDevices(devices.filter(device => device.kind === 'audioinput' && device.deviceId && device.deviceId !== 'default')
        .map(device => ({ deviceId: device.deviceId, label: device.label || 'Mikrofon' })));
    }).catch(() => {}); };
    media.addEventListener?.('devicechange', refresh);
    refresh();
    return () => media.removeEventListener?.('devicechange', refresh);
  }, []);

  useEffect(() => () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    if (testTimerRef.current) window.clearTimeout(testTimerRef.current);
    if (testRecorderRef.current?.state === 'recording') {
      testRecorderRef.current.onstop = null;
      testRecorderRef.current.stop();
    }
    if (meterFrameRef.current) window.cancelAnimationFrame(meterFrameRef.current);
    if (meterContextRef.current) void meterContextRef.current.close();
    micRef.current?.getTracks().forEach(track => track.stop());
    Object.values(testSamplesRef.current).forEach(url => { if (url) URL.revokeObjectURL(url); });
    if (draftUrlRef.current) URL.revokeObjectURL(draftUrlRef.current);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    videoRef.current?.pause();
  }, []);

  function stopMeter() {
    if (meterFrameRef.current) window.cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
    if (meterContextRef.current) void meterContextRef.current.close();
    meterContextRef.current = null;
    setMicLevel(0);
  }

  async function startMeter(stream: MediaStream) {
    stopMeter();
    try {
      const context = new AudioContext();
      meterContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      void context.resume().catch(() => {
        if (meterContextRef.current !== context) return;
        stopMeter();
        setNotice('Mikrofon çalışıyor, ancak bu tarayıcı canlı ses göstergesini açamadı.');
      });
      const samples = new Uint8Array(analyser.fftSize);
      let lastUpdate = 0;
      const update = (now: number) => {
        if (now - lastUpdate >= 100) {
          analyser.getByteTimeDomainData(samples);
          let peak = 0;
          for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128) / 128);
          const decibels = 20 * Math.log10(Math.max(peak, 0.0001));
          setMicLevel(Math.round(Math.min(100, Math.max(0, (decibels + 60) / 60 * 100))));
          lastUpdate = now;
        }
        meterFrameRef.current = window.requestAnimationFrame(update);
      };
      meterFrameRef.current = window.requestAnimationFrame(update);
    } catch {
      stopMeter();
      setNotice('Mikrofon çalışıyor, ancak bu tarayıcı canlı ses göstergesini açamadı.');
    }
  }

  function clearTestSamples() {
    Object.values(testSamplesRef.current).forEach(url => { if (url) URL.revokeObjectURL(url); });
    testSamplesRef.current = {};
    setTestSamples({});
  }

  function discardDraft() {
    if (draftUrlRef.current) URL.revokeObjectURL(draftUrlRef.current);
    draftUrlRef.current = null;
    setDraft(null);
  }
  function selectLine(id: string) {
    if (phase !== 'idle') return;
    videoRef.current?.pause(); discardDraft();
    setSelectedId(id);
    setClipStarted(false);
    setOffset(saved.find(item => item.lyric_id === id)?.offset_ms ?? 0);
    setError(''); setNotice('');
  }
  async function enableMic(nextDevice = micDevice, nextMode = micMode) {
    setError(''); setMicSwitching(true);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Mikrofon için HTTPS veya aynı bilgisayarda localhost gerekli.');
      if (!mimeType()) throw new Error('Tarayıcı ses kaydını desteklemiyor. Güncel Chrome veya Edge kullan.');
      const clean = nextMode === 'clean';
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        ...(nextDevice !== 'default' ? { deviceId: { exact: nextDevice } } : {}),
        echoCancellation: clean, noiseSuppression: clean, autoGainControl: clean,
      }, video: false });
      stopMeter();
      micRef.current?.getTracks().forEach(track => track.stop());
      micRef.current = stream;
      stream.getAudioTracks()[0].onended = () => {
        if (micRef.current !== stream) return;
        stopMeter(); setMicReady(false); setMicDevice('default');
        setError('Mikrofon bağlantısı kesildi. Mikrofonu yeniden aç.');
      };
      setMicDevice(nextDevice); setMicMode(nextMode);
      setMicSettings(stream.getAudioTracks()[0].getSettings());
      setMicReady(true); setNotice(`${micModeLabels[nextMode]} hazır. Kısa bir test yapıp sesini dinle.`);
      await startMeter(stream);
      void navigator.mediaDevices.enumerateDevices().then(devices => setMicDevices(
        devices.filter(device => device.kind === 'audioinput' && device.deviceId && device.deviceId !== 'default')
          .map(device => ({ deviceId: device.deviceId, label: device.label || 'Mikrofon' })),
      )).catch(() => {});
    } catch (cause) { setError(errorText(cause)); }
    finally { setMicSwitching(false); }
  }
  function testMic() {
    if (!micRef.current || !mimeType()) return;
    setPhase('testing'); setError(''); setNotice('');
    try {
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(micRef.current, { mimeType: mimeType()! });
      testRecorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        testRecorderRef.current = null;
        if (testTimerRef.current) window.clearTimeout(testTimerRef.current);
        testTimerRef.current = null;
        if (!chunks.length) { setPhase('idle'); setError('Test kaydı boş geldi. Mikrofonu kontrol et.'); return; }
        const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType.split(';')[0] }));
        if (testSamplesRef.current[micMode]) URL.revokeObjectURL(testSamplesRef.current[micMode]);
        testSamplesRef.current = { ...testSamplesRef.current, [micMode]: url };
        setTestSamples({ ...testSamplesRef.current });
        setPhase('idle'); setNotice('Test kaydını dinle. Diğer modu da deneyip karşılaştırabilirsin.');
      };
      recorder.start();
      testTimerRef.current = window.setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 2500);
    } catch (cause) { setPhase('idle'); setError(errorText(cause)); }
  }
  async function previewClip() {
    if (!selected || !clip || !videoRef.current || phase !== 'idle') return;
    setError(''); setNotice('');
    const video = videoRef.current;
    setPhase('preview');
    try {
      await loadAt(video, clip.id, Math.max(0, selected.start_ms / 1000 - 2));
      video.volume = clipVolume / 100;
      await video.play();
      setClipStarted(true);
    } catch (cause) { setPhase('idle'); setError('Klip açılamadı: ' + errorText(cause)); }
  }
  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    videoRef.current?.pause();
  }
  async function beginRecording() {
    const video = videoRef.current, stream = micRef.current, mime = mimeType();
    if (!selected || !clip || !video || !stream || !mime || !inOrder || phase !== 'idle' || micSwitching) return;
    if (!headphones) { setError('Kulaklığını taktığını onayla.'); return; }
    setError(''); setNotice(''); discardDraft(); video.pause(); setPhase('loading');
    const start = Math.max(0, selected.start_ms / 1000 - 2);
    captureFailedRef.current = false;
    try {
      await loadAt(video, clip.id, start);
      video.volume = clipVolume / 100;
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { captureFailedRef.current = true; setError('Mikrofon kaydı kesildi. Tekrar dene.'); stopRecording(); };
      recorder.onstop = () => {
        video.pause();
        if (timerRef.current) window.clearTimeout(timerRef.current);
        const blob = new Blob(chunks, { type: mime.split(';')[0] });
        const duration = Math.round(Math.max(0, video.currentTime - startRef.current) * 1000);
        setPhase('idle');
        if (captureFailedRef.current) return;
        if (blob.size < 100 || duration < 200) { setError('Kayıt boş veya çok kısa. Yeniden dene.'); return; }
        const url = URL.createObjectURL(blob);
        draftUrlRef.current = url;
        setDraft({ blob, url, start: Math.round(startRef.current * 1000), duration });
        setNotice('Mikrofon kaydını dinle, sonra özel odaya kaydet.');
      };
      await video.play();
      setClipStarted(true);
      startRef.current = video.currentTime;
      recorder.start(250);
      setPhase('recording');
      timerRef.current = window.setTimeout(stopRecording, Math.max(1000, selected.end_ms - startRef.current * 1000 + 1500));
    } catch (cause) {
      captureFailedRef.current = true;
      stopRecording(); setPhase('idle'); setError('Klip çalınamadı: ' + errorText(cause));
    }
  }
  async function saveDraft() {
    if (!selected || !draft || phase !== 'idle') return;
    setError(''); setNotice(''); setPhase('uploading');
    try {
      const type = draft.blob.type;
      const ext = type === 'audio/mp4' ? 'm4a' : type === 'audio/ogg' ? 'ogg' : 'webm';
      const form = new FormData();
      form.set('lyric_id', selected.id);
      form.set('capture_start_ms', String(draft.start));
      form.set('duration_ms', String(draft.duration));
      form.set('file', new File([draft.blob], 'kayit.' + ext, { type }));
      const response = await fetch('/api/rooms/' + roomId + '/recordings', { method: 'POST', body: form, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Kayıt yüklenemedi.');
      const item = body.recording as RoomRecording;
      const updated = [...saved.filter(value => value.lyric_id !== item.lyric_id), item];
      setSaved(updated); discardDraft(); setOffset(0);
      const nextLine = lyrics.find(line => !updated.some(value => value.lyric_id === line.id));
      if (nextLine) setSelectedId(nextLine.id);
      setNotice(nextLine ? 'Kayıt saklandı. Sıradaki satıra geçildi.' : 'Rolünün tüm satırları kaydedildi!');
      router.refresh();
    } catch (cause) { setError(errorText(cause)); }
    finally { setPhase('idle'); }
  }
  async function saveOffset() {
    if (!selected || !take) return;
    setError('');
    try {
      const response = await fetch('/api/rooms/' + roomId + '/recordings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lyric_id: selected.id, offset_ms: offset }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Zaman kayması kaydedilemedi.');
      setSaved(items => items.map(item => item.lyric_id === selected.id ? { ...item, offset_ms: offset } : item));
      setNotice('Zaman kayması kaydedildi.');
    } catch (cause) { setError(errorText(cause)); }
  }

  return <>
    {!recordingSetupReady && <p role="alert" className="mb-4 rounded-xl border border-[#ff9999]/30 bg-[#ff9999]/10 p-4 text-sm text-[#ffb5b5]">Yönetici önce 202609270002_room_recordings.sql veritabanı güncellemesini uygulamalı.</p>}
    {!clip && <p role="alert" className="mb-4 rounded-xl border border-[#ff9999]/30 bg-[#ff9999]/10 p-4 text-sm text-[#ffb5b5]">Normal klip bulunamadı. Kayıt için yönetici klibi yüklemeli.</p>}
    <div className="mb-5 grid gap-3 md:grid-cols-3">
      <div data-reveal className="surface-soft rounded-2xl p-4"><Headphones size={19} className="text-[#c5a9ff]" /><p className="mt-2 text-sm font-bold">Kulaklığını tak</p><p className="mt-1 text-xs text-[#a3a0b4]">Müzik mikrofona sızmasın.</p></div>
      <div data-reveal className="surface-soft rounded-2xl p-4"><Play size={19} className="text-[#ffaaa3]" /><p className="mt-2 text-sm font-bold">Önce normal klibi izle</p><p className="mt-1 text-xs text-[#a3a0b4]">Kendi saniyelerin orijinal sesle açılır.</p></div>
      <div data-reveal className="surface-soft rounded-2xl p-4"><Mic2 size={19} className="text-[#b6dec7]" /><p className="mt-2 text-sm font-bold">Şarkıcıyla birlikte söyle</p><p className="mt-1 text-xs text-[#a3a0b4]">Klip çalar; yalnız mikrofon dosyaya yazılır.</p></div>
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(310px,.7fr)]">
      <div className="space-y-5">
        <section data-reveal className="surface rounded-[24px] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">{song.title} · {myRole.name}</p><h2 className="mt-2 text-xl font-bold">{phase === 'recording' ? 'Orijinal kliple kayıt' : 'Orijinal klip'}</h2></div><span className="text-xs text-[#aaa7bc]">{selected ? timeLabel(selected.start_ms) + '–' + timeLabel(selected.end_ms) : song.duration}</span></div>
          <div className="relative mt-4 aspect-video overflow-hidden rounded-[18px] bg-[#111019]">
            {clip && <video ref={videoRef} aria-hidden={!clipStarted} className="h-full w-full object-contain" playsInline preload="none" onTimeUpdate={() => { const video = videoRef.current; if (!video || !selected) return; if (video.currentTime >= selected.end_ms / 1000 + 1) { if (recorderRef.current?.state === 'recording') stopRecording(); else { video.pause(); setPhase('idle'); } } }} onEnded={() => { if (recorderRef.current?.state === 'recording') stopRecording(); else setPhase('idle'); }} onError={() => { if (recorderRef.current?.state === 'recording') { captureFailedRef.current = true; setError('Klip oynatımı kesildi; bu kayıt kullanılmadı. Yeniden dene.'); stopRecording(); } }} onWaiting={() => { if (recorderRef.current?.state === 'recording') { captureFailedRef.current = true; setError('Klip durakladı; senkron bozulmaması için kaydı yeniden başlat.'); stopRecording(); } }} />}
            {clip && !clipStarted && <button type="button" disabled={!selected || phase !== 'idle'} onClick={previewClip} className="absolute inset-0 flex w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_center,#39284d,#161521_75%)] px-5 text-center text-white transition-colors hover:bg-[#30243d]"><span className="flex size-16 items-center justify-center rounded-full border border-[#d8c0ff]/50 bg-[#a98af0]/25 shadow-[0_0_35px_rgba(177,138,240,.25)]"><Play size={25} fill="currentColor" className="ml-1" /></span><span className="text-base font-bold">{phase === 'preview' || phase === 'loading' ? 'Klip hazırlanıyor…' : 'Kendi bölümünü oynat'}</span><span className="text-xs text-[#dbcee9]">Orijinal klibi sesli izle, sonra kayda başla.</span></button>}
            {phase === 'recording' && <span className="pointer-events-none absolute left-3 top-3 rounded-full border border-[#ff9eaa]/50 bg-[#27131d]/90 px-3 py-1 text-xs font-bold text-[#ffb9c0]">● KAYIT</span>}
            {!clip && <div className="absolute inset-0 flex items-center justify-center text-sm text-[#aaa4ba]">Normal klip bulunamadı.</div>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="secondary-button" disabled={!clip || !selected || phase !== 'idle'} onClick={previewClip}><Play size={15} /> Bölümümü normal klipte izle</button>{phase === 'preview' && <button type="button" className="secondary-button" onClick={() => { videoRef.current?.pause(); setPhase('idle'); }}>Durdur</button>}</div>
          <label className="mt-4 flex items-center gap-3 text-xs text-[#c7c2d5]" htmlFor="clip-volume"><Volume2 size={16} /> Klip sesi <input id="clip-volume" className="min-w-0 flex-1 accent-[#aa8eea]" type="range" min="0" max="100" step="5" value={clipVolume} onChange={event => { const value = Number(event.target.value); setClipVolume(value); if (videoRef.current) videoRef.current.volume = value / 100; }} /><span className="w-9 text-right">%{clipVolume}</span></label>
          <p className="mt-3 text-xs text-[#9b98ab]">Önizleme ve kayıtta orijinal klip sesini kulaklıktan duyarsın. Ses ayarı yalnızca dinlediğin klibi etkiler; kayda sadece mikrofon girer. Final videoda bu klibin sesi kullanılmaz.</p>
        </section>
        <section data-reveal className="surface rounded-[24px] p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Sana ait söz satırları</h2><span className="text-xs text-[#cbb6f1]">{saved.length}/{lyrics.length} kaydedildi</span></div><div className="mt-4 space-y-2">{lyrics.map((line, index) => { const done = saved.some(value => value.lyric_id === line.id); return <button type="button" key={line.id} disabled={phase !== 'idle'} onClick={() => selectLine(line.id)} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${selectedId === line.id ? 'border-[#ae91e8] bg-[#ae91e8]/15' : 'border-white/10 bg-[#12121d] hover:border-white/25'}`}><span className="shrink-0 text-xs font-bold text-[#b59bda]">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><p className="text-sm text-white">{line.text}</p><p className="mt-1 text-xs text-[#9693a6]">{timeLabel(line.start_ms)}–{timeLabel(line.end_ms)} · {done ? 'Kaydedildi; tekrar söyleyebilirsin' : line.id === next?.id ? 'Sıradaki kayıt' : 'Önceki satırı kaydet'}</p></div>{done && <Check size={16} className="shrink-0 text-[#9cdbba]" />}</button>; })}</div>{!lyrics.length && <p className="mt-4 text-sm text-[#aaa4b8]">Yönetici henüz bu role zamanlı söz eklemedi.</p>}</section>
      </div>
      <aside className="space-y-5"><section className="surface rounded-[24px] p-5"><div className="flex items-center gap-3"><RoleAvatar role={myRole} size="large" /><div><p className="eyebrow">SENİN ROLÜN</p><p className="mt-1 font-bold">{myRole.name}</p></div></div>
        <div className="mt-5"><label htmlFor="mic-device" className="text-xs font-bold text-[#d9d0e6]">Mikrofon</label><select id="mic-device" className="mt-2 w-full rounded-xl border border-white/20 bg-[#11121d] px-3 py-2.5 text-sm text-white" value={micDevice} disabled={phase !== 'idle' || micSwitching} onChange={event => { const device = event.target.value; clearTestSamples(); if (micReady) void enableMic(device, micMode); else setMicDevice(device); }}><option value="default">Varsayılan mikrofon</option>{micDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Mikrofon ${index + 1}`}</option>)}</select></div>
        <div className="mt-4"><p className="text-xs font-bold text-[#d9d0e6]">Ses modu</p><div className="mt-2 grid grid-cols-2 gap-2">{(['natural', 'clean'] as const).map(mode => <button type="button" key={mode} aria-pressed={micMode === mode} disabled={phase !== 'idle' || micSwitching} onClick={() => { if (micReady) void enableMic(micDevice, mode); else setMicMode(mode); }} className={`rounded-xl border p-3 text-left transition-colors ${micMode === mode ? 'border-[#b99bf5] bg-[#aa8eea]/20 text-white' : 'border-white/15 bg-[#11121d] text-[#c4bfd1] hover:border-white/35'}`}><span className="block text-xs font-bold">{micModeLabels[mode]}</span><span className="mt-1 block text-[10px] leading-4 text-[#aba4bc]">{mode === 'natural' ? 'Filtreler kapalı; şarkı için önce bunu dene.' : 'Yankı ve ortam gürültüsünü azaltır.'}</span></button>)}</div><p className="mt-2 text-[11px] leading-4 text-[#a9a3b8]">Seçtiğin mod yalnızca bundan sonraki kayıtlara uygulanır; eski kayıtları değiştirmez.</p></div>
        <button type="button" className="secondary-button mt-4 w-full" disabled={phase !== 'idle' || micSwitching} onClick={() => void enableMic()}><Mic2 size={16} /> {micReady ? 'Mikrofonu yeniden aç' : 'Mikrofon izni ver'}</button>
        {micReady && <div className="mt-4 rounded-xl border border-white/10 bg-[#11121d] p-3"><div className="flex items-center justify-between gap-2 text-xs"><span className="font-bold">Canlı ses seviyesi</span><span className={micLevel > 92 ? 'text-[#ffaaa4]' : micLevel > 0 && micLevel < 38 ? 'text-[#f3d18d]' : 'text-[#a9dfc2]'}>{micLevel > 92 ? 'Çok yüksek' : micLevel > 0 && micLevel < 38 ? 'Düşük' : micLevel ? 'İyi' : 'Konuşarak kontrol et'}</span></div><div role="meter" aria-label="Mikrofon ses seviyesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={micLevel} className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#3b3649]"><div className={`h-full rounded-full transition-[width] duration-100 ${micLevel > 92 ? 'bg-[#ff8f9b]' : micLevel > 0 && micLevel < 38 ? 'bg-[#f3d18d]' : 'bg-[#a98ded]'}`} style={{ width: `${micLevel}%` }} /></div><p className="mt-2 text-[11px] leading-4 text-[#a9a3b8]">Normal sesinle konuş veya söyle. Düşükse mikrofonu yaklaştır; kırmızıya çıkıyorsa Windows giriş düzeyini azalt.</p>{micSettings && <p className="mt-2 text-[10px] text-[#8f8a9f]">Tarayıcı ayarı: yankı {micSettings.echoCancellation === undefined ? '?' : micSettings.echoCancellation ? 'açık' : 'kapalı'} · gürültü {micSettings.noiseSuppression === undefined ? '?' : micSettings.noiseSuppression ? 'açık' : 'kapalı'} · otomatik ses {micSettings.autoGainControl === undefined ? '?' : micSettings.autoGainControl ? 'açık' : 'kapalı'}</p>}</div>}
        <button type="button" className="secondary-button mt-3 w-full" disabled={!micReady || phase !== 'idle' || micSwitching} onClick={testMic}><Volume2 size={16} /> Bu modda 2,5 saniye test et</button>
        {Object.entries(testSamples).length > 0 && <div className="mt-3 space-y-2">{(['natural', 'clean'] as const).map(mode => testSamples[mode] && <div key={mode} className="rounded-xl border border-white/10 bg-[#11121d] p-3"><p className="text-xs font-bold">{micModeLabels[mode]} · test kaydı</p><audio className="mt-2 w-full" controls src={testSamples[mode]} /></div>)}</div>}
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-[#11121d] p-3 text-xs leading-5 text-[#c2bdcc]"><input type="checkbox" className="mt-1 accent-[#aa88ef]" checked={headphones} onChange={event => setHeadphones(event.target.checked)} /><span>Kulaklığımı taktım; klip sesi mikrofona gitmeyecek.</span></label>
        <button type="button" className="primary-button mt-4 w-full" disabled={!recordingSetupReady || !clip || !micReady || !headphones || !inOrder || phase !== 'idle' || micSwitching} onClick={beginRecording}><Mic2 size={16} /> {take ? 'Yeniden kaydet' : 'Kaydı başlat'}</button>
        {!micReady && <p className="mt-3 text-xs leading-5 text-[#c4b9d5]">Kayda başlamak için önce mikrofon izni ver.</p>}
        {micReady && !headphones && <p className="mt-3 text-xs leading-5 text-[#c4b9d5]">Kulaklığını takıp yukarıdaki kutuyu işaretle.</p>}
        {phase === 'recording' && <button type="button" className="secondary-button mt-2 w-full" onClick={stopRecording}>Kaydı bitir</button>}
        {!inOrder && selected && <p className="mt-3 text-xs text-[#ffb7ab]">Önce önceki söz satırını kaydet.</p>}
        {draft && <div className="mt-5 rounded-xl border border-[#aa90e6]/25 p-3"><p className="text-xs font-bold">Yeni mikrofon kaydın</p><audio className="mt-2 w-full" controls src={draft.url} /><div className="mt-3 flex gap-2"><button type="button" className="primary-button flex-1" onClick={saveDraft} disabled={phase !== 'idle'}><Save size={15} /> Özel odaya kaydet</button><button type="button" className="secondary-button" onClick={() => { discardDraft(); setNotice('Taslak silindi. Yeniden kaydedebilirsin.'); }} disabled={phase !== 'idle'}><RotateCcw size={15} /></button></div></div>}
        {phase === 'uploading' && <p className="mt-3 text-xs text-[#c2aafa]">Kayıt özel depolamaya yükleniyor…</p>}{error && <p role="alert" className="mt-4 text-xs leading-5 text-[#ffaaa4]">{error}</p>}{notice && <p role="status" className="mt-4 text-xs leading-5 text-[#a9dfc2]">{notice}</p>}
      </section>
      {take && selected && <section className="surface rounded-[24px] p-5"><h3 className="font-bold">Kaydedilen ses</h3><p className="mt-1 text-xs text-[#aaa5b8]">Yalnızca mikrofon sesi. Yeniden kayıt, bunu değiştirir.</p><audio className="mt-3 w-full" key={take.asset_id} controls src={`/api/media/${take.asset_id}`} /><label className="mt-4 block text-xs font-bold" htmlFor="offset">Küçük zaman kayması: {offset > 0 ? '+' : ''}{offset} ms</label><input id="offset" className="mt-3 w-full accent-[#aa8eea]" type="range" min="-500" max="500" step="25" value={offset} onChange={event => setOffset(Number(event.target.value))} /><p className="text-xs text-[#aaa5b8]">Eksi daha erken, artı daha geç. En fazla yarım saniye.</p><button type="button" className="secondary-button mt-3 w-full" disabled={offset === take.offset_ms} onClick={saveOffset}>Zamanı kaydet</button></section>}
      <section className="surface-soft rounded-[21px] p-5"><h3 className="text-sm font-bold">Odadaki ilerleme</h3><div className="mt-4 space-y-2">{roles.map(role => <div key={role.roleId} className="flex items-center justify-between gap-2 text-xs"><span style={{ color: role.color }}>{role.name}</span><span className="text-[#aaa6b8]">{role.roleId === myRole.roleId ? saved.length === lyrics.length && lyrics.length ? 'Tamamlandı' : `${saved.length}/${lyrics.length}` : role.part}</span></div>)}</div></section>
      </aside>
    </div>
  </>;
}
