import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WebhookGuard implements CanActivate {
  private readonly logger = new Logger(WebhookGuard.name);

  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedSecret = request.headers['x-webhook-secret'] || request.headers['webhook-secret'];

    const expectedSecret = this.configService.get<string>('WEBHOOK_SECRET');

    if (!expectedSecret) {
      this.logger.error('Webhook secret not configured on server');
      throw new UnauthorizedException('Webhook secret not configured on server');
    }

    if (!providedSecret) {
      this.logger.warn(`Webhook request rejected: Missing secret from IP ${this.getClientIp(request)}`);
      throw new UnauthorizedException('Webhook secret is required');
    }

    if (providedSecret !== expectedSecret) {
      this.logger.warn(`Webhook request rejected: Invalid secret from IP ${this.getClientIp(request)}`);
      throw new UnauthorizedException('Invalid webhook secret');
    }

    // Optional: IP whitelist check (only if configured - not required for internal use)
    const allowedIps = this.configService.get<string>('WEBHOOK_ALLOWED_IPS');
    if (allowedIps && allowedIps.trim() !== '') {
      const clientIp = this.getClientIp(request);
      const ipList = allowedIps.split(',').map(ip => ip.trim()).filter(ip => ip !== '');
      
      if (ipList.length > 0 && !ipList.includes(clientIp)) {
        this.logger.warn(`Webhook request rejected: IP ${clientIp} not in whitelist`);
        throw new ForbiddenException('IP address not allowed');
      }
    }

    // Log successful webhook authentication (without sensitive data)
    this.logger.log(`Webhook request authenticated from IP ${this.getClientIp(request)}`);

    return true;
  }

  private getClientIp(request: any): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.ip ||
      'unknown'
    );
  }
}

