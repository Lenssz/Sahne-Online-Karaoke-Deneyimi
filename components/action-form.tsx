'use client';
import { useActionState, type ReactNode } from 'react';
import type { ActionState } from '@/lib/types';
import { fieldClass } from '@/lib/styles';
export function ActionForm({ action, children, submit, className = '' }: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>; children: ReactNode; submit: string; className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const localInvite = !!state.url && /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//.test(state.url);
  return <form action={formAction} className={`space-y-4 ${className}`}>
    {children}
    <button disabled={pending} className="primary-button" type="submit">{pending ? 'Kaydediliyor…' : submit}</button>
    {state.error && <p role="alert" className="text-sm text-[#ffaaa4]">{state.error}</p>}
    {state.success && <p role="status" className="text-sm text-[#a6e4c9]">{state.success}</p>}
    {localInvite && <p className="rounded-xl border border-[#f3d18d]/25 bg-[#f3d18d]/10 p-3 text-xs leading-5 text-[#f3d18d]">Yerel test daveti: bu bağlantı yalnızca bu bilgisayarda çalışır. Arkadaşlarına göndermek için siteyi HTTPS yayın adresinden açıp orada davet oluştur.</p>}
    {state.url && <label className="block text-xs text-[#c7b7e9]">Bu bağlantıyı yalnızca davet ettiğin kişiye gönder. 7 gün geçerli.<input readOnly value={state.url} onFocus={e => e.target.select()} className={fieldClass} /><button type="button" className="secondary-button mt-2" onClick={async e => { const button = e.currentTarget; try { await navigator.clipboard.writeText(state.url!); button.textContent = 'Kopyalandı'; } catch { /* The selected field also supports manual copy. */ } }}>Bağlantıyı kopyala</button></label>}
  </form>;
}
