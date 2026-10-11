import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { PageIntro } from '@/components/studio-ui';
import { NewSongForm } from '@/components/new-song-form';

export default async function NewSongPage() {
  await requireAdmin();
  return <><PageIntro eyebrow="YÖNETİCİ ALANI" title="Yeni şarkı ekle" description="Klibi, şarkıcı rollerini ve söz zamanlarını tek yerde hazırla." action={<Link href="/admin/songs" className="secondary-button">Kitaplığa dön</Link>} /><NewSongForm /></>;
}
