import 'server-only';
import { MAX_UPLOAD_BODY_BYTES } from '@/lib/media-limits';

// Bound the bytes even when a chunked request has no Content-Length header.
export async function readUploadForm(request: Request) {
  const limit = MAX_UPLOAD_BODY_BYTES;
  if (Number(request.headers.get('content-length') ?? 0) > limit || !request.body) throw new Error('Invalid body');
  const reader = request.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('Upload too large'); }
      chunks.push(value.slice().buffer);
    }
  } finally { reader.releaseLock(); }
  return new Response(new Blob(chunks), { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
}
