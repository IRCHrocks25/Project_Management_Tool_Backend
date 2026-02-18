"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
async function bootstrap() {
    try {
        const app = await core_1.NestFactory.create(app_module_1.AppModule);
        app.enableCors({
            origin: 'http://localhost:3001',
            credentials: true,
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