import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';

/** Entities come from TypeOrmModule.forFeature in each module (autoLoadEntities). */
@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    
    // If DATABASE_URL is provided, use it directly
    if (databaseUrl) {
      // Railway and other cloud providers often require SSL
      const requiresSSL = databaseUrl.includes('railway') || 
                          databaseUrl.includes('sslmode=require') ||
                          databaseUrl.includes('trolley.proxy.rlwy.net');
      
      return {
        type: 'postgres',
        url: databaseUrl,
        autoLoadEntities: true,
        synchronize: false, // Temporarily disabled to fix enum mismatch - run migration script first
        logging: this.configService.get<string>('NODE_ENV') === 'development',
        ssl: requiresSSL ? { rejectUnauthorized: false } : false,
        extra: requiresSSL ? {
          ssl: {
            rejectUnauthorized: false,
          },
        } : {},
      };
    }

    // Otherwise, use individual connection parameters
    return {
      type: 'postgres',
      host: this.configService.get<string>('DB_HOST', 'localhost'),
      port: this.configService.get<number>('DB_PORT', 5432),
      username: this.configService.get<string>('DB_USERNAME', 'postgres'),
      password: this.configService.get<string>('DB_PASSWORD', 'postgres'),
      database: this.configService.get<string>('DB_DATABASE', 'katalyst_pm'),
      autoLoadEntities: true,
      synchronize: false, // Temporarily disabled to fix enum mismatch - run migration script first
      logging: this.configService.get<string>('NODE_ENV') === 'development',
    };
  }
}

