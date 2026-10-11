export const MAX_MEDIA_FILE_BYTES = 50 * 1024 * 1024;
export const FREE_STORAGE_BYTES = 1_000_000_000;
export const MAX_UPLOAD_BODY_BYTES = MAX_MEDIA_FILE_BYTES + 1024 * 1024;

export function formatMegabytes(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
