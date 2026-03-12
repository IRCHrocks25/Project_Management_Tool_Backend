"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const platform_socket_io_1 = require("@nestjs/platform-socket.io");
const app_module_1 = require("./app.module");
async function bootstrap() {
    try {
        const app = await core_1.NestFactory.create(app_module_1.AppModule);
        app.useWebSocketAdapter(new platform_socket_io_1.IoAdapter(app));
        const allowedOrigins = [
            'http://localhost:3001',
            'https://projectmanagementtoolfrontend-production-fbc2.up.railway.app',
        ];
        app.enableCors({
            origin: (origin, callback) => {
                if (!origin)
                    return callback(null, true);
                if (allowedOrigins.indexOf(origin) !== -1) {
                    return callback(null, true);
                }
                if (process.env.NODE_ENV === 'development' && origin.includes('localhost')) {
                    return callback(null, true);
                }
                if (process.env.NODE_ENV === 'production' && origin.includes('.up.railway.app')) {
                    return callback(null, true);
                }
                callback(new Error('Not allowed by CORS'));
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Secret', 'webhook-secret'],
        });
        app.useGlobalPipes(new common_1.ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }));
        const port = process.env.PORT || 3000;
        await app.listen(port);
        console.log(`🚀 Backend server running on http://localhost:${port}`);
        console.log(`📊 Database: ${process.env.DATABASE_URL ? 'Connected via DATABASE_URL' : 'Using local config'}`);
    }
    catch (error) {
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
//# sourceMappingURL=main.js.map