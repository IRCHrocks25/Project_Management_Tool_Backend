"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const platform_socket_io_1 = require("@nestjs/platform-socket.io");
const pg = __importStar(require("pg"));
const app_module_1 = require("./app.module");
pg.types.setTypeParser(1082, (val) => val);
async function bootstrap() {
    try {
        const app = await core_1.NestFactory.create(app_module_1.AppModule);
        app.useWebSocketAdapter(new platform_socket_io_1.IoAdapter(app));
        const envOrigins = (process.env.CORS_ORIGINS || '')
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean);
        const allowedOrigins = [
            'http://localhost:3001',
            'https://projectmanagementtoolfrontend-production-fbc2.up.railway.app',
            'https://telos.katek-ai.com',
            ...envOrigins,
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