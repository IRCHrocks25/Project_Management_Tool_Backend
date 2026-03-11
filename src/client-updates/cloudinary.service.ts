import 'multer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadImage(file: Express.Multer.File, folder?: string): Promise<string> {
    if (!file || !file.buffer) {
      throw new Error('Invalid file provided');
    }

    // Determine resource type based on file mime type
    const resourceType = file.mimetype?.startsWith('video/') ? 'video' : 
                        file.mimetype?.startsWith('application/') || file.mimetype?.startsWith('text/') ? 'raw' : 
                        'image';

    // Extract file extension from original filename
    const getFileExtension = (filename: string): string | null => {
      const match = filename.match(/\.([a-z0-9]+)$/i);
      return match ? match[1].toLowerCase() : null;
    };

    const fileExtension = file.originalname ? getFileExtension(file.originalname) : null;
    
    // For raw files (PDFs, docs, etc.), preserve the extension in the public_id
    let publicId: string | undefined;
    if (resourceType === 'raw' && fileExtension && file.originalname) {
      // Use the original filename (with extension) as public_id
      const sanitizedFilename = file.originalname
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_{2,}/g, '_');
      publicId = sanitizedFilename;
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: resourceType,
          folder: folder || 'PM_tool/uploads',
          public_id: publicId,
          // Optimize images automatically
          ...(resourceType === 'image' && {
            quality: 'auto',
            fetch_format: 'auto',
          }),
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result.secure_url);
          }
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
          if (error) {
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        },
      );

      uploadStream.end(buffer);
    });
  }

  async deleteImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}

