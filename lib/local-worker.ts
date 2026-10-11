import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { createServiceClient } from './supabase/service';

export function workerAuthorized(request: Request) {
  const configured = process.env.LOCAL_WORKER_TOKEN;
  const received = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!configured || configured.length < 32 || !received) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(received);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function workerClient() {
  return createServiceClient();
}
