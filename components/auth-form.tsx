'use client';

import { useActionState, useSyncExternalStore } from 'react';
import { joinInvite, signInAdmin } from '@/app/auth-actions';
import { fieldClass } from '@/lib/styles';

const subscribeHash = (callback: () => void) => {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
};
const readHash = () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
const serverHash = () => '';

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(signInAdmin, {});
  return <form action={action} className="mt-6 space-y-4">
    <label className="block text-xs">Yönetici hesabı<input name="email" required type="email" autoComplete="username" maxLength={254} placeholder="Supabase'te oluşturduğun hesap" className={fieldClass} /></label>
    <label className="block text-xs">Şifre<input name="password" required type="password" autoComplete="current-password" className={fieldClass} /></label>
    <button disabled={pending} className="primary-button w-full">{pending ? 'Giriş yapılıyor…' : 'Yönetici olarak giriş yap'}</button>
    {state.error && <p role="alert" className="text-sm text-[#ffaaa4]">{state.error}</p>}
    <p className="text-xs leading-6 text-[#9292a6]">Bu hesap adı yalnızca giriş için kullanılır; e-posta kodu gönderilmez. Arkadaşların özel davet bağlantısıyla katılır.</p>
  </form>;
}

export function InviteJoinForm() {
  const invite = useSyncExternalStore(subscribeHash, readHash, serverHash);
  const [state, action, pending] = useActionState(joinInvite, {});
  return <form action={action} className="mt-6 space-y-4">
    <input type="hidden" name="invite" value={invite} />
    <label className="block text-xs">Odadaki adın<input name="name" required maxLength={80} autoComplete="nickname" className={fieldClass} /></label>
    <button disabled={pending || !invite} className="primary-button w-full">{pending ? 'Katılıyorsun…' : 'Özel odaya katıl'}</button>
    {!invite && <p role="alert" className="text-xs text-[#ffaaa4]">Bu sayfayı arkadaşının gönderdiği davet bağlantısıyla aç.</p>}
    {state.error && <p role="alert" className="text-sm text-[#ffaaa4]">{state.error}</p>}
    <p className="text-xs leading-6 text-[#9292a6]">E-posta ve şifre gerekmez. Odan bu tarayıcıdaki oturumla korunur; tarayıcı verilerini silersen yeniden davet gerekebilir.</p>
  </form>;
}
