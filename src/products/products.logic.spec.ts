import { computeAttention, daysUntil, generateCode, slugify, uniqueSlug } from './products.logic';

const NOW = new Date('2026-11-04T15:00:00Z');
const base = { domains: [], highPriorityOpen: 0, lastUpdateAt: '2026-11-03T10:00:00Z', productCreatedAt: '2026-01-01' };

describe('daysUntil', () => {
  it('counts calendar days, ignoring time of day', () => {
    expect(daysUntil('2026-11-04', NOW)).toBe(0);
    expect(daysUntil('2026-11-05', NOW)).toBe(1);
    expect(daysUntil('2026-11-01', NOW)).toBe(-3);
  });
});

describe('computeAttention', () => {
  it('returns nothing for a healthy product', () => {
    expect(
      computeAttention({ ...base, domains: [{ domain: 'a.com', renewsOn: '2027-06-01', sslExpiresOn: '2027-01-01' }] }, NOW),
    ).toEqual([]);
  });

  it('flags domain renewal and SSL within 30 days as critical on the files tab', () => {
    const result = computeAttention(
      { ...base, domains: [{ domain: 'courseforge.io', renewsOn: '2026-11-16', sslExpiresOn: '2026-12-04' }] },
      NOW,
    );
    expect(result).toEqual([
      { level: 'critical', message: 'Domain courseforge.io renews in 12 days', tab: 'files' },
      { level: 'critical', message: 'SSL for courseforge.io expires in 30 days', tab: 'files' },
    ]);
  });

  it('does not flag at 31 days', () => {
    expect(computeAttention({ ...base, domains: [{ domain: 'a.com', renewsOn: '2026-12-05', sslExpiresOn: null }] }, NOW)).toEqual([]);
  });

  it('says expired N days ago and today', () => {
    const result = computeAttention(
      { ...base, domains: [{ domain: 'a.com', renewsOn: '2026-11-03', sslExpiresOn: '2026-11-04' }] },
      NOW,
    );
    expect(result.map((a) => a.message)).toEqual(['Domain a.com expired 1 day ago', 'SSL for a.com expires today']);
  });

  it('flags open high-priority tickets as a warning', () => {
    expect(computeAttention({ ...base, highPriorityOpen: 2 }, NOW)).toEqual([
      { level: 'warning', message: '2 open high-priority tickets', tab: 'tickets' },
    ]);
    expect(computeAttention({ ...base, highPriorityOpen: 1 }, NOW)[0].message).toBe('1 open high-priority ticket');
  });

  it('flags no update in 10 days as info', () => {
    expect(computeAttention({ ...base, lastUpdateAt: '2026-10-25T09:00:00Z' }, NOW)).toEqual([
      { level: 'info', message: 'No update in 10 days', tab: 'updates' },
    ]);
    expect(computeAttention({ ...base, lastUpdateAt: '2026-10-26T09:00:00Z' }, NOW)).toEqual([]);
  });

  it('flags a product that never had an update only once it is 10 days old', () => {
    expect(computeAttention({ ...base, lastUpdateAt: null, productCreatedAt: '2026-11-01' }, NOW)).toEqual([]);
    expect(computeAttention({ ...base, lastUpdateAt: null }, NOW)[0]).toEqual({
      level: 'info',
      message: 'No updates posted yet',
      tab: 'updates',
    });
  });

  it('orders critical, then warning, then info; soonest expiry first', () => {
    const result = computeAttention(
      {
        domains: [{ domain: 'b.com', renewsOn: '2026-11-20', sslExpiresOn: '2026-11-01' }],
        highPriorityOpen: 1,
        lastUpdateAt: null,
        productCreatedAt: '2026-01-01',
      },
      NOW,
    );
    expect(result.map((a) => a.level)).toEqual(['critical', 'critical', 'warning', 'info']);
    expect(result[0].message).toBe('SSL for b.com expired 3 days ago');
  });
});

describe('slugify / uniqueSlug', () => {
  it('makes url-safe slugs', () => {
    expect(slugify('Project Management Tool')).toBe('project-management-tool');
    expect(slugify('  CourseForge 2.0! ')).toBe('courseforge-2-0');
    expect(slugify('Café Été')).toBe('cafe-ete');
    expect(slugify('!!!')).toBe('product');
  });

  it('adds -2, -3 when taken', () => {
    expect(uniqueSlug('Iceberg', [])).toBe('iceberg');
    expect(uniqueSlug('Iceberg', ['iceberg'])).toBe('iceberg-2');
    expect(uniqueSlug('Iceberg', ['iceberg', 'iceberg-2'])).toBe('iceberg-3');
  });
});

describe('generateCode', () => {
  it('uses initials, camelCase aware', () => {
    expect(generateCode('CourseForge', [])).toBe('CF');
    expect(generateCode('SOPMaster', [])).toBe('SM');
    expect(generateCode('Project Management Tool', [])).toBe('PMT');
  });

  it('keeps short all-caps names and takes first letters of single words', () => {
    expect(generateCode('CMS', [])).toBe('CMS');
    expect(generateCode('Iceberg', [])).toBe('IC');
    expect(generateCode('Maistro', [])).toBe('MA');
  });

  it('avoids taken codes', () => {
    expect(generateCode('CourseForge', ['CF'])).toBe('CFO');
    expect(generateCode('Iceberg', ['IC'])).toBe('ICE');
    expect(generateCode('Iceberg', ['ic', 'ICE', 'ICEB', 'ICEBE'])).toBe('IC2');
  });

  it('always returns 2–5 uppercase chars', () => {
    for (const name of ['A', 'x', '', 'One Two Three Four Five Six Seven', 'é']) {
      expect(generateCode(name, [])).toMatch(/^[A-Z0-9]{2,5}$/);
    }
  });
});
