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
        this.WEBHOOK_URL = 'https://katalyst-crm.fly.dev/webhook/5bd4150f-d3c8-43e7-9238-18c4634b0679';
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
                    message: 'If an account with that email exists, an OTP has been sent to your email.',
                };
            }
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const otpExpiry = new Date();
            otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);
            try {
                user.otpCode = otpCode;
                user.otpExpires = otpExpiry;
                await this.usersRepository.save(user);
            }
            catch (dbError) {
                console.error(`[OTP Password Reset] Database error saving OTP:`, dbError);
                if (dbError.message?.includes('column') || dbError.code === '42703') {
                    throw new common_1.BadRequestException('OTP password reset feature is not fully configured. Please run database migration to add OTP fields.');
                }
                throw dbError;
            }
            try {
                await this.sendOtpViaWebhook(normalizedEmail, otpCode, user.name);
                console.log(`[OTP Password Reset] OTP sent successfully to ${normalizedEmail}`);
            }
            catch (webhookError) {
                console.error(`[OTP Password Reset] Failed to send OTP via webhook to ${normalizedEmail}:`, webhookError);
                if (process.env.NODE_ENV === 'development') {
                    console.log(`[OTP Password Reset] Development mode - OTP: ${otpCode}`);
                }
            }
            return {
                message: 'If an account with that email exists, an OTP has been sent to your email.',
            };
        }
        catch (error) {
            console.error(`[OTP Password Reset] Unexpected error:`, error);
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            return {
                message: 'If an account with that email exists, an OTP has been sent to your email.',
            };
        }
    }
    async sendOtpViaWebhook(email, otp, userName) {
        try {
            const emailBody = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background: #f9fafb;
              border-radius: 8px;
              padding: 30px;
              border: 1px solid #e5e7eb;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #667eea;
              margin-bottom: 10px;
            }
            .otp-box {
              display: inline-block;
              padding: 15px 30px;
              background: #667eea;
              color: white;
              border-radius: 6px;
              margin: 20px 0;
              font-weight: 600;
              font-size: 24px;
              letter-spacing: 5px;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              font-size: 12px;
              color: #6b7280;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">Katalyst PM</div>
            </div>
            <h2>Password Reset OTP</h2>
            <p>Hello${userName ? ` ${userName}` : ''},</p>
            <p>We received a request to reset your password for your Katalyst PM account.</p>
            <p>Your OTP code is:</p>
            <div style="text-align: center;">
              <div class="otp-box">${otp}</div>
            </div>
            <p><strong>This OTP will expire in 10 minutes.</strong></p>
            <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
            <div class="footer">
              <p>This is an automated message, please do not reply to this email.</p>
              <p>&copy; ${new Date().getFullYear()} Katalyst PM. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;
            const payload = {
                to: email,
                subject: 'Password Reset OTP - Katalyst PM',
                body: emailBody,
                html: emailBody,
            };
            console.log(`[Webhook] ==========================================`);
            console.log(`[Webhook] Preparing to send OTP email to: ${email}`);
            console.log(`[Webhook] Webhook URL: ${this.WEBHOOK_URL}`);
            console.log(`[Webhook] Method: POST`);
            console.log(`[Webhook] Full Payload:`, JSON.stringify(payload, null, 2));
            console.log(`[Webhook] Payload Summary:`, {
                to: payload.to,
                subject: payload.subject,
                bodyLength: payload.body.length,
                htmlLength: payload.html.length,
            });
            const requestBody = JSON.stringify(payload);
            console.log(`[Webhook] Request body length: ${requestBody.length} bytes`);
            try {
                const response = await fetch(this.WEBHOOK_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: requestBody,
                });
                console.log(`[Webhook] Response received!`);
                console.log(`[Webhook] Response status: ${response.status} ${response.statusText}`);
                console.log(`[Webhook] Response headers:`, Object.fromEntries(response.headers.entries()));
                const responseText = await response.text();
                console.log(`[Webhook] Response body:`, responseText);
                if (!response.ok) {
                    console.error(`[Webhook] ❌ Error: Webhook returned status ${response.status}`);
                    console.error(`[Webhook] Error response:`, responseText);
                    throw new Error(`Webhook request failed with status ${response.status}: ${responseText}`);
                }
                console.log(`[Webhook] ✅ Successfully sent OTP email to ${email} via webhook`);
                console.log(`[Webhook] ==========================================`);
            }
            catch (fetchError) {
                console.error(`[Webhook] ❌ Fetch error occurred:`, fetchError);
                console.error(`[Webhook] Error name:`, fetchError.name);
                console.error(`[Webhook] Error message:`, fetchError.message);
                console.error(`[Webhook] Error stack:`, fetchError.stack);
                throw fetchError;
            }
        }
        catch (error) {
            console.error(`[Webhook] ❌ Failed to send OTP email to ${email}`);
            console.error(`[Webhook] Error type:`, error.constructor.name);
            console.error(`[Webhook] Error message:`, error.message);
            console.error(`[Webhook] Full error:`, error);
            console.error(`[Webhook] ==========================================`);
            throw error;
        }
    }
    async verifyOtp(verifyOtpDto) {
        const { email, otp } = verifyOtpDto;
        const normalizedEmail = email.toLowerCase().trim();
        const user = await this.usersRepository.findOne({
            where: { email: normalizedEmail },
        });
        if (!user) {
            throw new common_1.BadRequestException('Invalid email or OTP');
        }
        if (!user.otpCode || user.otpCode !== otp) {
            throw new common_1.BadRequestException('Invalid OTP code');
        }
        if (!user.otpExpires || user.otpExpires < new Date()) {
            user.otpCode = null;
            user.otpExpires = null;
            await this.usersRepository.save(user);
            throw new common_1.BadRequestException('OTP has expired. Please request a new one.');
        }
        return {
            message: 'OTP verified successfully. You can now reset your password.',
            verified: true,
        };
    }
    async resetPasswordWithOtp(resetPasswordOtpDto) {
        const { email, password } = resetPasswordOtpDto;
        const normalizedEmail = email.toLowerCase().trim();
        const user = await this.usersRepository.findOne({
            where: { email: normalizedEmail },
        });
        if (!user) {
            throw new common_1.BadRequestException('Invalid email');
        }
        if (!user.otpCode || !user.otpExpires || user.otpExpires < new Date()) {
            throw new common_1.BadRequestException('OTP has expired or is invalid. Please request a new OTP.');
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        user.otpCode = null;
        user.otpExpires = null;
        await this.usersRepository.save(user);
        return {
            message: 'Password has been reset successfully. You can now log in with your new password.',
        };
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