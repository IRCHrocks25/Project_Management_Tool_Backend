import 'multer';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export interface IcebergUploadResult {
  /** Public delivery URL: `<CDN>/a/<assetId>`. */
  url: string;
  assetId: string;
  /** Tenant-relative key. Required to delete the asset later. */
  key: string;
  contentType: string;
  sizeBytes: number | null;
}

/**
 * Iceberg's JSON is produced by Go structs without json tags, so the keys are
 * PascalCase. Lowercase variants are accepted too in case tags are added later.
 */
interface IcebergAssetResponse {
  ID?: string;
  id?: string;
  Key?: string;
  key?: string;
  Size?: number;
  size?: number;
  ContentType?: string;
  content_type?: string;
}

export interface IcebergMultipartPart {
  partNumber: number;
  etag: string;
  size: number;
}

export interface IcebergPrivateLink {
  deliveryUrl: string;
  embedUrl: string;
  expiresAt: string;
}

@Injectable()
export class IcebergService {
  /** Iceberg's fixed multipart part size. */
  readonly maxPartBytes = 64 * 1024 * 1024;

  private readonly logger = new Logger(IcebergService.name);
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly tenantId: string;
  private readonly cdnBase: string;

  constructor(private configService: ConfigService) {
    this.apiUrl = (this.configService.get<string>('ICEBERG_API_URL') || '').replace(/\/+$/, '');
    this.token = this.configService.get<string>('ICEBERG_API_TOKEN') || '';
    this.tenantId = this.configService.get<string>('ICEBERG_TENANT_ID') || '';
    this.cdnBase = (
      this.configService.get<string>('ICEBERG_CDN_BASE') || 'https://cdn.katalyst-crm.com'
    ).replace(/\/+$/, '');

    if (!this.apiUrl || !this.token || !this.tenantId) {
      this.logger.warn(
        'Iceberg is not fully configured (ICEBERG_API_URL, ICEBERG_API_TOKEN, ICEBERG_TENANT_ID) — uploads will fail until it is.',
      );
    }
  }

  /**
   * Builds a tenant-relative key. Iceberg rejects a key that already exists
   * (409), so a short random segment is always included — unlike Cloudinary,
   * which generated a unique public_id server-side.
   */
  private buildKey(file: Express.Multer.File, folder: string): string {
    const original = file.originalname || 'file';
    const extMatch = original.match(/\.([a-zA-Z0-9]{1,8})$/);
    const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '';
    const stem = original
      .slice(0, original.length - ext.length)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^[._-]+|[._-]+$/g, '')
      .slice(0, 80);

    const unique = randomUUID().split('-')[0];
    const prefix = folder.replace(/^\/+|\/+$/g, '');
    return `${prefix}/${stem || 'file'}-${unique}${ext}`;
  }

  /**
   * Iceberg delivery URLs are `/a/<asset-id>` and carry no filename, so
   * anything that infers a file type from the URL (icon and label rendering,
   * PDF detection) would lose that ability. The edge worker routes on
   * pathname only and ignores the query, so the original filename rides along
   * as `?name=` purely as a hint to consumers.
   */
  private publicUrl(assetId: string, filename?: string): string {
    const url = `${this.cdnBase}/a/${encodeURIComponent(assetId)}`;
    return filename ? `${url}?name=${encodeURIComponent(filename)}` : url;
  }

  private assertConfigured(): void {
    if (!this.apiUrl || !this.token || !this.tenantId) {
      throw new InternalServerErrorException('File storage is not configured');
    }
  }

  async upload(file: Express.Multer.File, folder?: string): Promise<IcebergUploadResult> {
    if (!file || !file.buffer) throw new Error('Invalid file provided');
    this.assertConfigured();

    const key = this.buildKey(file, folder || 'PM_tool/uploads');
    const contentType = file.mimetype || 'application/octet-stream';

    // A zero-copy view over the Multer buffer; Buffer itself isn't a BlobPart.
    const bytes = new Uint8Array(
      file.buffer.buffer,
      file.buffer.byteOffset,
      file.buffer.byteLength,
    ) as Uint8Array<ArrayBuffer>;

    const form = new FormData();
    form.append('file', new Blob([bytes], { type: contentType }), file.originalname || 'file');
    form.append('key', key);
    form.append('content_type', contentType);
    form.append('tenant_id', this.tenantId);

    const response = await fetch(`${this.apiUrl}/assets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(`Iceberg upload failed (${response.status}) for key ${key}: ${detail}`);
      throw new InternalServerErrorException('File upload failed');
    }

    const asset = (await response.json()) as IcebergAssetResponse;
    const assetId = asset.ID || asset.id;
    if (!assetId) {
      this.logger.error(`Iceberg upload for key ${key} returned no asset id`);
      throw new InternalServerErrorException('File upload failed');
    }

    const size = asset.Size ?? asset.size;
    return {
      url: this.publicUrl(assetId, file.originalname),
      assetId,
      key: asset.Key || asset.key || key,
      contentType: asset.ContentType || asset.content_type || contentType,
      sizeBytes: typeof size === 'number' ? size : (file.size ?? null),
    };
  }

  /** Parity helper for callers that only need the delivery URL. */
  async uploadImage(file: Express.Multer.File, folder?: string): Promise<string> {
    const result = await this.upload(file, folder);
    return result.url;
  }

  /**
   * Deletes by tenant-relative key. Iceberg has no concept of Cloudinary's
   * resource_type, so the key is the only identifier needed.
   *
   * Deletion is two-step: an asset must be trashed before it can be removed
   * permanently, otherwise DELETE answers 400 "asset must be trashed before
   * permanent deletion". Both steps treat 404 as success so a caller deleting
   * an already-gone asset isn't blocked.
   */
  async deleteAsset(key: string): Promise<void> {
    if (!key) return;
    if (!(await this.trashAsset(key))) return;

    const path = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const url = `${this.apiUrl}/assets/${path}?tenant_id=${encodeURIComponent(this.tenantId)}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.token}` },
    });

    if (!response.ok && response.status !== 404) {
      const detail = await response.text().catch(() => '');
      this.logger.error(`Iceberg delete failed (${response.status}) for key ${key}: ${detail}`);
      throw new InternalServerErrorException('File delete failed');
    }
  }

  /**
   * Moves an asset to Iceberg's trash, where it stops being served and Iceberg clears it out later.
   * Answers false if it was already gone. Permanent deletion needs a token with purge rights.
   */
  async trashAsset(key: string): Promise<boolean> {
    if (!key) return false;
    this.assertConfigured();

    const trashed = await fetch(`${this.apiUrl}/assets/trash`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key, tenant_id: this.tenantId }),
    });

    if (trashed.status === 404) return false;
    if (!trashed.ok) {
      const detail = await trashed.text().catch(() => '');
      this.logger.error(`Iceberg trash failed (${trashed.status}) for key ${key}: ${detail}`);
      throw new InternalServerErrorException('File delete failed');
    }
    return true;
  }

  /** Starts an upload of known size. The same idempotency key resumes the same upload. */
  async initMultipartUpload(key: string, contentType: string, sizeBytes: number, idempotencyKey: string) {
    const res = await this.call('/assets/uploads', 'POST', {
      key,
      tenant_id: this.tenantId,
      content_type: contentType,
      expected_size: sizeBytes,
      idempotency_key: idempotencyKey,
    });
    return { uploadId: res.upload_id as string, assetId: res.asset_id as string, partSize: res.part_size as number };
  }

  async signMultipartPart(uploadId: string, partNumber: number): Promise<string> {
    const res = await this.call(`/assets/uploads/${encodeURIComponent(uploadId)}/parts/${partNumber}`, 'POST', { tenant_id: this.tenantId });
    return res.upload_url;
  }

  /** Safe to call again. The answer's `status` is `completed` once Iceberg has checked the file and accepted it. */
  async completeMultipartUpload(uploadId: string, parts: IcebergMultipartPart[]) {
    const res = await this.call(`/assets/uploads/${encodeURIComponent(uploadId)}/complete`, 'POST', {
      tenant_id: this.tenantId,
      parts: parts.map((p) => ({ part_number: p.partNumber, etag: p.etag, size: p.size })),
    });
    return { status: res.status as string, reason: (res.terminal_reason as string) || null };
  }

  async abortMultipartUpload(uploadId: string): Promise<void> {
    await this.call(`/assets/uploads/${encodeURIComponent(uploadId)}?tenant_id=${encodeURIComponent(this.tenantId)}`, 'DELETE');
  }

  async setAssetPrivate(assetId: string): Promise<void> {
    await this.call(`/assets/${encodeURIComponent(assetId)}/privacy?tenant_id=${encodeURIComponent(this.tenantId)}`, 'PUT', { private: true });
  }

  /** A link to a private asset that stops working after `lifetimeSeconds` (24 hours at most). */
  async issuePrivateLink(assetId: string, lifetimeSeconds: number): Promise<IcebergPrivateLink> {
    const res = await this.call(`/assets/${encodeURIComponent(assetId)}/delivery-links?tenant_id=${encodeURIComponent(this.tenantId)}`, 'POST', {
      lifetime_seconds: lifetimeSeconds,
    });
    return { deliveryUrl: res.delivery_url, embedUrl: res.embed_url, expiresAt: res.expires_at };
  }

  private async call(path: string, method: string, body?: unknown): Promise<any> {
    this.assertConfigured();
    const response = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(`Iceberg ${method} ${path.split('?')[0]} failed (${response.status}): ${detail}`);
      throw new InternalServerErrorException('File storage request failed');
    }
    return response.json().catch(() => ({}));
  }
}
