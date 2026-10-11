import { AdminLoginForm } from '@/components/auth-form';
import { PageIntro, PreviewNotice } from '@/components/studio-ui';
import { isConfigured } from '@/lib/supabase/server';
export default function LoginPage() {
  return <div className="mx-auto max-w-lg py-10"><PageIntro eyebrow="SİZE ÖZEL STÜDYO" title="Yönetici girişi" description="Şarkılarını ve özel odalarını şifrenle yönet." /><div className="surface rounded-[24px] p-6">{isConfigured() ? <AdminLoginForm /> : <PreviewNotice>Stüdyo bağlantısı henüz hazırlanmadı. Supabase kurulumunu tamamladığında giriş yapabileceksin.</PreviewNotice>}</div></div>;
}
