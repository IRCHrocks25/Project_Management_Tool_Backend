import {
  assertContentSize,
  cleanName,
  driveAccessLevel,
  normalizeShares,
  pdfOrFile,
  decodeStored,
  encodeStored,
  withAssetLinks,
  withoutAssetLinks,
} from './drively.logic';

const me = { userId: 'me', role: 'Designer' };

describe('driveAccessLevel', () => {
  it('is private by default, with no override for the CEO or a PM', () => {
    const chain = [{ ownerId: 'other', shares: [] }];
    expect(driveAccessLevel(me, chain)).toBeNull();
    expect(driveAccessLevel({ userId: 'ceo', role: 'FOUNDER/CEO' }, chain)).toBeNull();
    expect(driveAccessLevel({ userId: 'pm', role: 'Project Manager' }, chain)).toBeNull();
  });

  it('gives the owner everything', () => {
    expect(driveAccessLevel(me, [{ ownerId: 'me', shares: [] }])).toBe('owner');
  });

  it('inherits from parent folders and the strongest rule wins', () => {
    const view = { kind: 'user', target: 'me', permission: 'view' };
    const edit = { kind: 'department', target: 'Designer', permission: 'edit' };
    const file = { ownerId: 'other', shares: [view] };
    expect(driveAccessLevel(me, [file, { ownerId: 'other', shares: [] }])).toBe('view');
    expect(driveAccessLevel(me, [file, { ownerId: 'other', shares: [edit] }])).toBe('edit');
  });

  it('lets a folder owner edit what others put inside, without owning it', () => {
    expect(driveAccessLevel(me, [{ ownerId: 'other', shares: [] }, { ownerId: 'me', shares: [] }])).toBe('edit');
  });

  it('never matches a signed-out actor', () => {
    expect(driveAccessLevel({ userId: '' }, [{ ownerId: '', shares: [] }])).toBeNull();
  });
});

describe('cleanName', () => {
  it('trims, collapses spaces and strips control characters', () => {
    expect(cleanName('  Q4\n\tplan  ', 'x')).toBe('Q4 plan');
  });
  it('falls back when blank and caps the length', () => {
    expect(cleanName('   ', 'Untitled')).toBe('Untitled');
    expect(cleanName('a'.repeat(300), 'x')).toHaveLength(255);
  });
});

describe('asset links', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'image', attrs: { assetId: 'a1', src: 'https://old', alt: 'x' } },
      { type: 'image', attrs: { assetId: 'stolen', src: 'https://old' } },
      { type: 'image', attrs: { src: 'https://public' } },
    ],
  };

  it('fills links only for the assets it was given', () => {
    const out: any = withAssetLinks(doc, new Map([['a1', 'https://fresh']]));
    expect(out.content[0].attrs.src).toBe('https://fresh');
    expect(out.content[1].attrs.src).toBeNull();
    expect(out.content[2].attrs.src).toBe('https://public');
  });

  it('strips links before storing and leaves the input alone', () => {
    const out: any = withoutAssetLinks(doc);
    expect(out.content[0].attrs).toEqual({ assetId: 'a1', src: null, alt: 'x' });
    expect(doc.content[0].attrs.src).toBe('https://old');
  });
});

describe('normalizeShares', () => {
  it('keeps the last rule per target and drops the target on everyone', () => {
    expect(
      normalizeShares([
        { kind: 'user', target: 'u', permission: 'view' },
        { kind: 'user', target: 'u', permission: 'edit' },
        { kind: 'everyone', target: 'ignored', permission: 'view' },
      ]),
    ).toEqual([
      { kind: 'user', target: 'u', permission: 'edit' },
      { kind: 'everyone', target: null, permission: 'view' },
    ]);
  });
  it('needs a target unless it is everyone', () => {
    expect(() => normalizeShares([{ kind: 'user', permission: 'view' }])).toThrow('Pick who');
  });
});

it('refuses content over the limit', () => {
  expect(() => assertContentSize({ big: 'x'.repeat(10 * 1024 * 1024 + 1) })).toThrow('too large');
  expect(() => assertContentSize(undefined)).not.toThrow();
});

it('recognises PDFs by type or extension', () => {
  expect(pdfOrFile('application/pdf', 'a')).toBe('pdf');
  expect(pdfOrFile('application/octet-stream', 'A.PDF')).toBe('pdf');
  expect(pdfOrFile('image/png', 'a.png')).toBe('file');
});

describe('stored files', () => {
  it('keeps plain content without picture links', () => {
    const out = decodeStored(encodeStored({ content: { a: { assetId: 'x', src: 'https://old' } } }).toString());
    expect(out).toEqual({ content: { a: { assetId: 'x', src: null } }, yjs: null });
  });

  it('keeps live state byte for byte, and it replaces content', () => {
    const yjs = new Uint8Array([0, 1, 254, 255]);
    const out = decodeStored(encodeStored({ content: { old: true }, yjs }).toString());
    expect(out.content).toBeNull();
    expect([...(out.yjs as Uint8Array)]).toEqual([0, 1, 254, 255]);
  });
});
