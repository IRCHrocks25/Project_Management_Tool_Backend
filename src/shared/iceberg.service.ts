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

@Injectable()
export class IcebergService {
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
    this.assertConfigured();

    const trashed = await fetch(`${this.apiUrl}/assets/trash`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key, tenant_id: this.tenantId }),
    });

    if (trashed.status === 404) return;
    if (!trashed.ok) {
      const detail = await trashed.text().catch(() => '');
      this.logger.error(`Iceberg trash failed (${trashed.status}) for key ${key}: ${detail}`);
      throw new InternalServerErrorException('File delete failed');
    }

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
}
