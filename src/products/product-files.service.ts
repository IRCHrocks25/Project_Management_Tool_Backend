import 'multer';
import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ProductFile } from './entities/product-file.entity';
import { IcebergService, IcebergUploadResult } from '../shared/iceberg.service';
import { HubUsersService, SafeUser } from './hub-users.service';
import { ProductsService } from './products.service';

export const MAX_PRODUCT_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_PRODUCT_FILES_PER_REQUEST = 10;
export const DEFAULT_FILE_FOLDER = 'General';
export const UPDATE_FILE_FOLDER = 'Updates';

export interface UploadedAsset {
  file: Express.Multer.File;
  name: string;
  result: IcebergUploadResult;
}

/** Multer decodes multipart filenames as latin1; recover UTF-8 names like "Überblick.pdf". */
export function decodeFilename(name: string | undefined): string {
  if (!name) return 'file';
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('�') ? name : decoded;
  } catch {
    return name;
  }
}

@Injectable()
export class ProductFilesService {
  private readonly logger = new Logger(ProductFilesService.name);

  constructor(
    @InjectRepository(ProductFile) private readonly filesRepository: Repository<ProductFile>,
    private readonly iceberg: IcebergService,
    private readonly products: ProductsService,
    private readonly hubUsers: HubUsersService,
  ) {}

  toResponse(file: ProductFile, users: Map<string, SafeUser>) {
    const { product, update, uploadedBy, ...rest } = file as ProductFile & Record<string, any>;
    return {
      ...rest,
      sizeBytes: file.sizeBytes == null ? null : Number(file.sizeBytes),
      uploadedBy: users.get(file.uploadedById) ?? null,
    };
  }

  async list(productId: string) {
    await this.products.findOrFail(productId);
    const files = await this.filesRepository.find({ where: { productId }, order: { createdAt: 'DESC' } });
    const users = await this.hubUsers.load(files.map((f) => f.uploadedById));
    return files.map((f) => this.toResponse(f, users));
  }

  async findByUpdateIds(updateIds: string[]) {
    if (updateIds.length === 0) return [];
    return this.filesRepository.find({ where: { updateId: In(updateIds) }, order: { createdAt: 'ASC' } });
  }

  /** Uploads to Iceberg first; if one fails, the ones already uploaded are removed again. */
  async uploadAssets(productId: string, files: Express.Multer.File[]): Promise<UploadedAsset[]> {
    if (files.length > MAX_PRODUCT_FILES_PER_REQUEST) {
      throw new BadRequestException(`You can upload up to ${MAX_PRODUCT_FILES_PER_REQUEST} files at a time.`);
    }
    const uploaded: UploadedAsset[] = [];
    try {
      for (const file of files) {
        if (file.size > MAX_PRODUCT_FILE_BYTES) {
          throw new BadRequestException(`${decodeFilename(file.originalname)} is larger than 50 MB.`);
        }
        const name = decodeFilename(file.originalname);
        let result: IcebergUploadResult;
        try {
          result = await this.iceberg.upload(file, `products/${productId}`);
        } catch (error) {
          if (error instanceof HttpException) throw error;
          this.logger.error(`Iceberg upload failed for ${name}: ${error?.message || error}`);
          throw new ServiceUnavailableException(
            `Upload failed for ${name}. File storage could not be reached. Try again in a minute.`,
          );
        }
        uploaded.push({ file, name, result });
      }
    } catch (error) {
      await this.discardAssets(uploaded);
      throw error;
    }
    return uploaded;
  }

  async discardAssets(assets: UploadedAsset[]) {
    for (const a of assets) {
      try {
        await this.iceberg.deleteAsset(a.result.key);
      } catch (error) {
        this.logger.warn(`Could not remove orphaned Iceberg asset ${a.result.key}: ${error?.message || error}`);
      }
    }
  }

  buildRows(
    productId: string,
    assets: UploadedAsset[],
    opts: { folder: string; uploadedById: string; updateId?: string | null },
  ): Partial<ProductFile>[] {
    return assets.map((a) => ({
      productId,
      updateId: opts.updateId ?? null,
      name: a.name.slice(0, 255),
      folder: opts.folder,
      url: a.result.url,
      storageKey: a.result.key,
      contentType: a.result.contentType || a.file.mimetype || null,
      sizeBytes: String(a.result.sizeBytes ?? a.file.size ?? 0),
      uploadedById: opts.uploadedById,
    }));
  }

  async saveRows(rows: Partial<ProductFile>[], manager?: EntityManager): Promise<ProductFile[]> {
    const repo = manager ? manager.getRepository(ProductFile) : this.filesRepository;
    return repo.save(rows.map((r) => repo.create(r)));
  }

  async upload(productId: string, files: Express.Multer.File[], folder: string | undefined, actorId: string) {
    await this.products.findOrFail(productId);
    if (!files || files.length === 0) throw new BadRequestException('Choose at least one file to upload.');
    const assets = await this.uploadAssets(productId, files);
    let saved: ProductFile[];
    try {
      saved = await this.saveRows(
        this.buildRows(productId, assets, { folder: folder || DEFAULT_FILE_FOLDER, uploadedById: actorId }),
      );
    } catch (error) {
      await this.discardAssets(assets);
      throw error;
    }
    const users = await this.hubUsers.load([actorId]);
    return saved.map((f) => this.toResponse(f, users));
  }

  async remove(productId: string, fileId: string) {
    const file = await this.filesRepository.findOne({ where: { id: fileId, productId } });
    if (!file) throw new NotFoundException('File not found.');
    // IcebergService treats a 404 (already gone) as success.
    try {
      await this.iceberg.deleteAsset(file.storageKey);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Iceberg delete failed for ${file.storageKey}: ${error?.message || error}`);
      throw new ServiceUnavailableException(
        `Couldn't delete ${file.name}. File storage could not be reached. Try again in a minute.`,
      );
    }
    await this.filesRepository.delete(file.id);
    return { success: true };
  }
}
