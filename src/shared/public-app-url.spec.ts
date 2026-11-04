import { OFFICIAL_APP_URL, publicAppUrl } from './public-app-url';

describe('publicAppUrl', () => {
  it('never returns a Railway address', () => {
    expect(publicAppUrl('https://projectmanagementtoolfrontend-production-fbc2.up.railway.app')).toBe(OFFICIAL_APP_URL);
    expect(
      publicAppUrl('https://projectmanagementtoolfrontend-production-fbc2.up.railway.app, https://telos.katek-ai.com/'),
    ).toBe('https://telos.katek-ai.com');
  });

  it('falls back to the official address when nothing usable is set', () => {
    expect(publicAppUrl(undefined)).toBe(OFFICIAL_APP_URL);
    expect(publicAppUrl('')).toBe(OFFICIAL_APP_URL);
    expect(publicAppUrl('nope, ftp://x.com')).toBe(OFFICIAL_APP_URL);
  });

  it('keeps a local development address', () => {
    expect(publicAppUrl('http://localhost:3001/')).toBe('http://localhost:3001');
  });
});
