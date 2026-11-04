/** The only address links to the app may use in production: emails, share links, everything. */
export const OFFICIAL_APP_URL = 'https://telos.katek-ai.com';

/** Railway's generated hosts (e.g. projectmanagementtoolfrontend-production-fbc2.up.railway.app) are never linked to. */
function isRailwayHost(hostname: string): boolean {
  return hostname === 'railway.app' || hostname.endsWith('.railway.app');
}

/**
 * Base URL for links people receive. FRONTEND_URL may be a comma/space separated list;
 * the first valid http(s) URL that isn't a Railway host wins, so local development keeps
 * linking to localhost. Anything else falls back to the official address.
 */
export function publicAppUrl(rawFrontendUrl?: string | null): string {
  const candidates = (rawFrontendUrl || '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (isRailwayHost(parsed.hostname)) continue;
      return parsed.origin;
    } catch {
      // Skip invalid candidates.
    }
  }

  return OFFICIAL_APP_URL;
}
