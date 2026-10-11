import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

/** Only call after checking the signed-in user is an administrator. */
export async function drainStorageCleanup(maxBatches = 20) {
  const service = createServiceClient();
  if (!service) return { pending: true, error: 'Sunucu depolama anahtarı eksik.' };
  for (let batch = 0; batch < maxBatches; batch++) {
    const pending = await service.from('studio_media_cleanup').select('object_path').order('queued_at').limit(100);
    if (pending.error) return { pending: true, error: 'Temizleme sırası okunamadı.' };
    if (!pending.data.length) return { pending: false, error: null };
    const paths = pending.data.map(item => item.object_path);
    const removed = await service.storage.from('studio-private').remove(paths);
    if (removed.error) return { pending: true, error: 'Depolama dosyaları şu anda silinemedi.' };
    const cleared = await service.from('studio_media_cleanup').delete().in('object_path', paths);
    if (cleared.error) return { pending: true, error: 'Temizleme kaydı güncellenemedi.' };
  }
  return { pending: true, error: null };
}
