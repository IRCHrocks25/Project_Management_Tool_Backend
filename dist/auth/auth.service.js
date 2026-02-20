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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcryptjs"));
const crypto = __importStar(require("crypto"));
const user_entity_1 = require("../users/entities/user.entity");
const email_service_1 = require("../email/email.service");
const config_1 = require("@nestjs/config");
let AuthService = class AuthService {
    constructor(usersRepository, jwtService, emailService, configService) {
        this.usersRepository = usersRepository;
        this.jwtService = jwtService;
        this.emailService = emailService;
        this.configService = configService;
    }
    async signup(signupDto) {
        const { email, password, name, role } = signupDto;
        const normalizedEmail = email.toLowerCase().trim();
        const existingUser = await this.usersRepository.findOne({
            where: { email: normalizedEmail },
        });
        if (existingUser) {
            throw new common_1.ConflictException('User with this email already exists');
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = this.usersRepository.create({
            email: normalizedEmail,
            password: hashedPassword,
            name,
            role,
        });
        const savedUser = await this.usersRepository.save(user);
        const payload = { sub: savedUser.id, email: savedUser.email, role: savedUser.role };
        const token = this.jwtService.sign(payload);
        const { password: _, ...userWithoutPassword } = savedUser;
        return {
            user: userWithoutPassword,
            token,
        };
    }
    async login(loginDto) {
        const { email, password } = loginDto;
        const normalizedEmail = email.toLowerCase().trim();
        const user = await this.usersRepository.findOne({
            where: { email: normalizedEmail },
        });
        if (!user) {
            const allUsers = await this.usersRepository.find();
            const foundUser = allUsers.find(u => u.email.toLowerCase() === normalizedEmail);
            if (!foundUser) {
                console.log(`Login attempt failed: User not found for email: ${normalizedEmail}`);
                throw new common_1.UnauthorizedException('Invalid email or password');
            }
            const isPasswordValid = await bcrypt.compare(password, foundUser.password);
            if (!isPasswordValid) {
                console.log(`Login attempt failed: Invalid password for email: ${normalizedEmail}`);
                throw new common_1.UnauthorizedException('Invalid email or password');
            }
            const payload = { sub: foundUser.id, email: foundUser.email, role: foundUser.role };
            const token = this.jwtService.sign(payload);
            const { password: _, ...userWithoutPassword } = foundUser;
            return {
                user: userWithoutPassword,
                token,
            };
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            console.log(`Login attempt failed: Invalid password for email: ${normalizedEmail}`);
            throw new common_1.UnauthorizedException('Invalid email or password');
        }
        const payload = { sub: user.id, email: user.email, role: user.role };
        const token = this.jwtService.sign(payload);
        const { password: _, ...userWithoutPassword } = user;
        return {
            user: userWithoutPassword,
            token,
        };
    }
    async validateUser(userId) {
        const user = await this.usersRepository.findOne({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('User not found');
        }
        return user;
    }
    async getAllUsers() {
        const users = await this.usersRepository.find({
            select: ['id', 'name', 'email', 'role', 'createdAt'],
            order: { name: 'ASC' },
        });
        return users;
    }
    async getOrCreateWebhookPM() {
        const webhookEmail = 'webhook@katalyst.pm';
        let webhookPM = await this.usersRepository.findOne({
            where: { email: webhookEmail },
        });
        if (!webhookPM) {
            const randomPassword = crypto.randomBytes(32).toString('hex');
            const hashedPassword = await bcrypt.hash(randomPassword, 10);
            webhookPM = this.usersRepository.create({
                email: webhookEmail,
                password: hashedPassword,
                name: 'Webhook System',
                role: user_entity_1.UserRole.PROJECT_MANAGER,
            });
            webhookPM = await this.usersRepository.save(webhookPM);
            console.log(`[AuthService] Created webhook PM account: ${webhookPM.id}`);
        }
        return webhookPM;
    }
    async forgotPassword(forgotPasswordDto) {
        const { email } = forgotPasswordDto;
        const normalizedEmail = email.toLowerCase().trim();
        try {
            const user = await this.usersRepository.findOne({
                where: { email: normalizedEmail },
            });
            if (!user) {
                return {
                    message: 'If an account with that email exists, a password reset link has been sent.',
                };
            }
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetTokenExpiry = new Date();
            resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1);
            try {
                user.resetPasswordToken = resetToken;
                user.resetPasswordExpires = resetTokenExpiry;
                await this.usersRepository.save(user);
            }
            catch (dbError) {
                console.error(`[Password Reset] Database error saving reset token:`, dbError);
                if (dbError.message?.includes('column') || dbError.code === '42703') {
                    throw new common_1.BadRequestException('Password reset feature is not fully configured. Please run the database migration: npm run migrate:password-reset');
                }
                throw dbError;
            }
            const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3001');
            const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
            try {
                await this.emailService.sendPasswordResetEmail(normalizedEmail, resetLink, user.name);
                console.log(`[Password Reset] Email sent successfully to ${normalizedEmail}`);
            }
            catch (emailError) {
                console.error(`[Password Reset] Failed to send email to ${normalizedEmail}:`, emailError);
                if (process.env.NODE_ENV === 'development') {
                    console.log(`[Password Reset] Development mode - Reset link: ${resetLink}`);
                    return {
                        message: 'If an account with that email exists, a password reset link has been sent.',
                        resetLink,
                    };
                }
            }
            return {
                message: 'If an account with that email exists, a password reset link has been sent.',
            };
        }
        catch (error) {
            console.error(`[Password Reset] Unexpected error:`, error);
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            return {
                message: 'If an account with that email exists, a password reset link has been sent.',
            };
        }
    }
    async resetPassword(resetPasswordDto) {
        const { token, password } = resetPasswordDto;
        const user = await this.usersRepository.findOne({
            where: { resetPasswordToken: token },
        });
        if (!user) {
            throw new common_1.BadRequestException('Invalid or expired reset token');
        }
        if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
            throw new common_1.BadRequestException('Reset token has expired. Please request a new one.');
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await this.usersRepository.save(user);
        return {
            message: 'Password has been reset successfully. You can now log in with your new password.',
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        jwt_1.JwtService,
        email_service_1.EmailService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map