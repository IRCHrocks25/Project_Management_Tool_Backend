import { randomBytes } from 'crypto';
import { ServiceUnavailableException, InternalServerErrorException } from '@nestjs/common';
import {
  VAULT_NOT_SET_UP_MESSAGE,
  VaultCryptoService,
  decryptSecret,
  encryptSecret,
  parseVaultKey,
} from './vault-crypto.service';

const makeService = (key: string | undefined) =>
  new VaultCryptoService({ get: () => key } as any);

describe('vault crypto', () => {
  const key = randomBytes(32);
  const keyB64 = key.toString('base64');

  it('round-trips a secret, including unicode', () => {
    const secret = 'pässwörd 🔐 with:colons';
    const payload = encryptSecret(secret, key);
    expect(payload.startsWith('v1:')).toBe(true);
    expect(payload.split(':')).toHaveLength(4);
    expect(payload).not.toContain(secret);
    expect(decryptSecret(payload, key)).toBe(secret);
  });

  it('uses a fresh 12-byte IV for every encryption', () => {
    const a = encryptSecret('same', key);
    const b = encryptSecret('same', key);
    expect(a).not.toBe(b);
    expect(Buffer.from(a.split(':')[1], 'base64')).toHaveLength(12);
  });

  it('rejects tampered ciphertext, tag or iv', () => {
    const [v, iv, tag, ct] = encryptSecret('hunter2', key).split(':');
    const flip = (b64: string) => {
      const buf = Buffer.from(b64, 'base64');
      buf[0] ^= 0x01;
      return buf.toString('base64');
    };
    expect(() => decryptSecret([v, iv, tag, flip(ct)].join(':'), key)).toThrow();
    expect(() => decryptSecret([v, iv, flip(tag), ct].join(':'), key)).toThrow();
    expect(() => decryptSecret([v, flip(iv), tag, ct].join(':'), key)).toThrow();
    expect(() => decryptSecret('v2:' + [iv, tag, ct].join(':'), key)).toThrow();
    expect(() => decryptSecret('garbage', key)).toThrow();
  });

  it('fails with the wrong key', () => {
    const payload = encryptSecret('hunter2', key);
    expect(() => decryptSecret(payload, randomBytes(32))).toThrow();
  });

  it('parses only base64 keys of exactly 32 bytes', () => {
    expect(parseVaultKey(keyB64)?.equals(key)).toBe(true);
    expect(parseVaultKey(` ${keyB64}\n`)?.equals(key)).toBe(true);
    expect(parseVaultKey(undefined)).toBeNull();
    expect(parseVaultKey('')).toBeNull();
    expect(parseVaultKey(randomBytes(16).toString('base64'))).toBeNull();
    expect(parseVaultKey('not base64 at all!')).toBeNull();
  });

  describe('VaultCryptoService', () => {
    it('encrypts and decrypts with the configured key', () => {
      const svc = makeService(keyB64);
      expect(svc.decrypt(svc.encrypt('s3cret'))).toBe('s3cret');
    });

    it.each([undefined, '', 'short', randomBytes(31).toString('base64')])(
      'returns 503 when the key is %p',
      (bad) => {
        const svc = makeService(bad as any);
        for (const call of [() => svc.assertReady(), () => svc.encrypt('x'), () => svc.decrypt('v1:a:b:c')]) {
          try {
            call();
            fail('expected 503');
          } catch (e) {
            expect(e).toBeInstanceOf(ServiceUnavailableException);
            expect((e as ServiceUnavailableException).message).toBe(VAULT_NOT_SET_UP_MESSAGE);
          }
        }
      },
    );

    it('returns a 500 without leaking details when decryption fails', () => {
      const payload = makeService(keyB64).encrypt('s3cret');
      const other = makeService(randomBytes(32).toString('base64'));
      expect(() => other.decrypt(payload)).toThrow(InternalServerErrorException);
    });
  });
});
