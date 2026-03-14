import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);
    app.useWebSocketAdapter(new IoAdapter(app));
    
    // Enable CORS for frontend communication
    const envOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
    const allowedOrigins = [
      'http://localhost:3001',
      'https://projectmanagementtoolfrontend-production-fbc2.up.railway.app',
      'https://telos.katek-ai.com',
      ...envOrigins,
    ];
    
    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or webhook requests)
        if (!origin) return callback(null, true);
        
        // Check exact matches first
        if (allowedOrigins.indexOf(origin) !== -1) {
          return callback(null, true);
        }
        
        // In development, allow localhost for local testing (n8n, Postman, etc.)
        if (process.env.NODE_ENV === 'development' && origin.includes('localhost')) {
          return callback(null, true);
        }
        
        // In production, allow Railway preview deployments (optional - for flexibility)
        if (process.env.NODE_ENV === 'production' && origin.includes('.up.railway.app')) {
          return callback(null, true);
        }
        
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Secret', 'webhook-secret'],
    });

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(`🚀 Backend server running on http://localhost:${port}`);
    console.log(`📊 Database: ${process.env.DATABASE_URL ? 'Connected via DATABASE_URL' : 'Using local config'}`);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    if (error.message?.includes('ECONNREFUSED')) {
      console.error('💡 Database connection failed. Please check:');
      console.error('   1. Database server is running');
      console.error('   2. DATABASE_URL is correct');
      console.error('   3. Network/firewall allows connection');
    }
    process.exit(1);
  }
}
bootstrap();

