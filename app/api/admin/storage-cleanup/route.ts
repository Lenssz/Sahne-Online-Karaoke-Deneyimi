import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { drainStorageCleanup } from '@/lib/storage-cleanup';

export async function POST() {
  const headers = { 'Cache-Control': 'private, no-store' };
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: 'Yalnızca yönetici temizleme yapabilir.' }, { status: 403, headers });
  const result = await drainStorageCleanup();
  return NextResponse.json(result, { headers });
}
