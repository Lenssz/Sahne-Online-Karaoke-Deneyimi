import 'server-only';

function parseOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch { return null; }
}

export function configuredSiteOrigin() {
  return parseOrigin(process.env.APP_URL)?.origin ?? null;
}

export function isTrustedOrigin(headers: Pick<Headers, 'get'>, requestUrl?: string) {
  const rawOrigin = headers.get('origin');
  const origin = parseOrigin(rawOrigin);
  // Origin headers contain an origin only, never a path or a list of domains.
  if (!origin || rawOrigin !== origin.origin) return false;
  if (origin.origin === configuredSiteOrigin()) return true;

  // Local access must target this exact loopback host and port. Forwarded host
  // headers cannot grant access to a different public site or tunnel.
  if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) return false;
  const target = parseOrigin(requestUrl);
  const host = headers.get('host') ?? target?.host;
  if (!host || host.toLowerCase() !== origin.host) return false;
  return requestUrl ? target?.origin === origin.origin : true;
}

export function isTrustedRequest(request: Request) {
  return isTrustedOrigin(request.headers, request.url);
}
