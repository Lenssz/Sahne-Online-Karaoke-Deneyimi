import { InviteJoinForm } from '@/components/auth-form';
import { PageIntro, PreviewNotice } from '@/components/studio-ui';
import { isConfigured } from '@/lib/supabase/server';
export default function InvitePage() {
  return <div className="mx-auto max-w-lg py-10"><PageIntro eyebrow="ÖZEL DAVET" title="Sahnede yerin hazır" description="Adını yaz ve özel odaya katıl. Şarkıcı rolünü odada seçebilirsin." /><div className="surface rounded-[24px] p-6">{isConfigured() ? <InviteJoinForm /> : <PreviewNotice>Stüdyo bağlantısı henüz hazırlanmadı.</PreviewNotice>}</div></div>;
}
