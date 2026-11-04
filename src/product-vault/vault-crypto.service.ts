import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export const VAULT_NOT_SET_UP_MESSAGE =
  'The vault is not set up yet. Ask an admin to set VAULT_ENCRYPTION_KEY.';
export const VAULT_DECRYPT_FAILED_MESSAGE =
  'This password could not be decrypted. The vault key may have changed — ask an admin.';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Decodes VAULT_ENCRYPTION_KEY (base64, exactly 32 bytes). Returns null when missing or invalid. */
export function parseVaultKey(raw: string | null | undefined): Buffer | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!BASE64_RE.test(trimmed)) return null;
  const key = Buffer.from(trimmed, 'base64');
  return key.length === 32 ? key : null;
}

/** AES-256-GCM with a random 12-byte IV. Output: `v1:<iv b64>:<tag b64>:<ciphertext b64>`. */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Throws on a malformed payload, a wrong key or any tampering (GCM auth tag check). */
export function decryptSecret(payload: string, key: Buffer): string {
  const parts = typeof payload === 'string' ? payload.split(':') : [];
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unsupported vault payload');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Unsupported vault payload');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Encrypts and decrypts vault secrets with VAULT_ENCRYPTION_KEY.
 * The key is read on each call so a fixed env takes effect without code changes.
 * Never log plaintext or the key.
 */
@Injectable()
export class VaultCryptoService {
  constructor(private readonly configService: ConfigService) {}

  private getKey(): Buffer {
    const key = parseVaultKey(this.configService.get<string>('VAULT_ENCRYPTION_KEY'));
    if (!key) throw new ServiceUnavailableException(VAULT_NOT_SET_UP_MESSAGE);
    return key;
  }

  /** Throws 503 when the key is missing or invalid. */
  assertReady(): void {
    this.getKey();
  }

  encrypt(plain: string): string {
    return encryptSecret(plain, this.getKey());
  }

  decrypt(payload: string): string {
    const key = this.getKey();
    try {
      return decryptSecret(payload, key);
    } catch {
      throw new InternalServerErrorException(VAULT_DECRYPT_FAILED_MESSAGE);
    }
  }
}
