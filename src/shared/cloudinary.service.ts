import 'multer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  resourceType: string;
  sizeBytes: number | null;
}

@Injectable()
export class CloudinaryService {
  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  private getResourceType(mimetype: string): string {
    if (mimetype?.startsWith('video/')) return 'video';
    if (mimetype?.startsWith('application/') || mimetype?.startsWith('text/')) return 'raw';
    return 'image';
  }

  private buildPublicId(file: Express.Multer.File, resourceType: string): string | undefined {
    if (resourceType !== 'raw' || !file.originalname) return undefined;
    const ext = file.originalname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    if (!ext) return undefined;
    return file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
  }

  async uploadImage(file: Express.Multer.File, folder?: string): Promise<string> {
    if (!file || !file.buffer) throw new Error('Invalid file provided');

    const resourceType = this.getResourceType(file.mimetype);
    const publicId = this.buildPublicId(file, resourceType);

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: resourceType as any,
          folder: folder || 'PM_tool/uploads',
          public_id: publicId,
          ...(resourceType === 'image' && { quality: 'auto', fetch_format: 'auto' }),
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result.secure_url);
        },
      );
      uploadStream.end(file.buffer);
    });
  }

  async uploadForAttachment(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<CloudinaryUploadResult> {
    if (!file || !file.buffer) throw new Error('Invalid file provided');

    const resourceType = this.getResourceType(file.mimetype);
    const publicId = this.buildPublicId(file, resourceType);

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: resourceType as any,
          folder: folder || 'PM_tool/uploads',
          public_id: publicId,
          ...(resourceType === 'image' && { quality: 'auto', fetch_format: 'auto' }),
        },
        (error, result) => {
          if (error) reject(error);
          else
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              resourceType: result.resource_type,
              sizeBytes: result.bytes ?? null,
            });
        },
      );
      uploadStream.end(file.buffer);
    });
  }

  async uploadImageFromBuffer(buffer: Buffer, folder?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: folder || 'PM_tool/uploads',
          quality: 'auto',
          fetch_format: 'auto',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result.secure_url);
        },
      );
      uploadStream.end(buffer);
    });
  }

  // resourceType defaults to 'image' for backward compatibility with existing callers
  async deleteImage(publicId: string, resourceType: string = 'image'): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType as any });
  }
}
