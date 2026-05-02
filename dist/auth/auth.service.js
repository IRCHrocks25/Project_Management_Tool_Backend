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
        this.WEBHOOK_URL = 'https://katalyst-crm2.fly.dev/webhook/5bd4150f-d3c8-43e7-9238-18c4634b0679';
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
            const foundUser = allUsers.find((u) => u.email.toLowerCase() === normalizedEmail);
            if (!foundUser) {
                console.log(`Login attempt failed: User not found for email: ${normalizedEmail}`);
                throw new common_1.UnauthorizedException('Invalid email or password');
            }
            if (foundUser.isActive === false) {
                throw new common_1.UnauthorizedException('Your account access has been revoked. Please contact Head PM.');
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
        if (user.isActive === false) {
            throw new common_1.UnauthorizedException('Your account access has been revoked. Please contact Head PM.');
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
        if (user.isActive === false) {
            throw new common_1.UnauthorizedException('Your account access has been revoked');
        }
        return user;
    }
    async getAllUsers() {
        const users = await this.usersRepository.find({
            select: [
                'id',
                'name',
                'email',
                'role',
                'createdAt',
                'isTeamLead',
                'isHeadPM',
                'emailNotificationsEnabled',
                'isActive',
                'avatarUrl',
                'birthday',
                'bio',
            ],
            order: { name: 'ASC' },
        });
        return users;
    }
    async updateProfile(userId, dto) {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (dto.email !== undefined) {
            const normalizedEmail = dto.email.toLowerCase().trim();
            const existing = await this.usersRepository.findOne({ where: { email: normalizedEmail } });
            if (existing && existing.id !== userId) {
                throw new common_1.ConflictException('Email is already in use');
            }
            user.email = normalizedEmail;
        }
        if (dto.name !== undefined)
            user.name = dto.name;
        if (dto.avatarUrl !== undefined)
            user.avatarUrl = dto.avatarUrl;
        if (dto.birthday !== undefined)
            user.birthday = dto.birthday;
        if (dto.bio !== undefined)
            user.bio = dto.bio;
        if (dto.emailNotificationsEnabled !== undefined)
            user.emailNotificationsEnabled = dto.emailNotificationsEnabled;
        const saved = await this.usersRepository.save(user);
        const { password, ...userWithoutPassword } = saved;
        return userWithoutPassword;
    }
    async changePassword(userId, dto) {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        const isPasswordValid = await bcrypt.compare(dto.currentPassword, user.password);
        if (!isPasswordValid) {
            throw new common_1.UnauthorizedException('Current password is incorrect');
        }
        user.password = await bcrypt.hash(dto.newPassword, 10);
        await this.usersRepository.save(user);
        return { message: 'Password updated successfully' };
    }
    async setTeamLead(userId, isTeamLead) {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        user.isTeamLead = isTeamLead;
        const saved = await this.usersRepository.save(user);
        const { password, ...userWithoutPassword } = saved;
        return userWithoutPassword;
    }
    async setHeadPM(userId, isHeadPM) {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (user.role !== user_entity_1.UserRole.PROJECT_MANAGER) {
            throw new common_1.BadRequestException('Only Project Managers can be designated as Head PM');
        }
        user.isHeadPM = isHeadPM;
        const saved = await this.usersRepository.save(user);
        const { password, ...userWithoutPassword } = saved;
        return userWithoutPassword;
    }
    async ensureCanManageUsers(actorUserId) {
        const actor = await this.usersRepository.findOne({ where: { id: actorUserId } });
        if (!actor) {
            throw new common_1.UnauthorizedException('Requesting user not found');
        }
        const isFounder = actor.role === user_entity_1.UserRole.FOUNDER_CEO;
        if (!actor.isHeadPM && !isFounder) {
            throw new common_1.ForbiddenException('Only Head PM can manage users');
        }
        return actor;
    }
    async updateUserRole(userId, role, actorUserId) {
        const actor = await this.ensureCanManageUsers(actorUserId);
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (user.id === actor.id && role !== user.role) {
            throw new common_1.BadRequestException('You cannot change your own department');
        }
        user.role = role;
        if (role !== user_entity_1.UserRole.PROJECT_MANAGER) {
            user.isHeadPM = false;
        }
        const saved = await this.usersRepository.save(user);
        const { password, ...userWithoutPassword } = saved;
        return userWithoutPassword;
    }
    async setUserAccess(userId, isActive, actorUserId) {
        const actor = await this.ensureCanManageUsers(actorUserId);
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (user.id === actor.id && !isActive) {
            throw new common_1.BadRequestException('You cannot revoke your own access');
        }
        user.isActive = isActive;
        if (!isActive) {
            user.isHeadPM = false;
            user.isTeamLead = false;
        }
        const saved = await this.usersRepository.save(user);
        const { password, ...userWithoutPassword } = saved;
        return userWithoutPassword;
    }
    async adminResetUserPassword(userId, newPassword, actorUserId) {
        await this.ensureCanManageUsers(actorUserId);
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        user.password = await bcrypt.hash(newPassword, 10);
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        user.otpCode = null;
        user.otpExpires = null;
        await this.usersRepository.save(user);
        return { message: 'User password has been reset successfully' };
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
        process.stdout.write('\n');
        console.log('🔔 [FORGOT PASSWORD] ==========================================');
        console.log('🔔 [FORGOT PASSWORD] Request received for email:', normalizedEmail);
        console.log('🔔 [FORGOT PASSWORD] Flow: Email submit → Generate OTP → Save to DB → Send via Webhook');
        console.log('🔔 [FORGOT PASSWORD] ==========================================\n');
        try {
            let user = await this.usersRepository.findOne({
                where: { email: normalizedEmail },
            });
            if (!user) {
                console.log('🔔 [FORGOT PASSWORD] User not found with exact match, trying case-insensitive search...');
                console.log('🔔 [FORGOT PASSWORD] Searching for normalized email:', normalizedEmail);
                const allUsers = await this.usersRepository.find();
                console.log('🔔 [FORGOT PASSWORD] Total users in database:', allUsers.length);
                console.log('🔔 [FORGOT PASSWORD] Sample emails in DB:', allUsers.slice(0, 5).map((u) => u.email));
                user = allUsers.find((u) => u.email.toLowerCase() === normalizedEmail) || null;
                if (user) {
                    console.log('🔔 [FORGOT PASSWORD] ✅ User found with case-insensitive search!');
                    console.log('🔔 [FORGOT PASSWORD] Found user email:', user.email);
                    console.log('🔔 [FORGOT PASSWORD] Found user ID:', user.id);
                }
                else {
                    console.log('🔔 [FORGOT PASSWORD] ❌ User not found even with case-insensitive search');
                    console.log('🔔 [FORGOT PASSWORD] Searched email:', normalizedEmail);
                }
            }
            else {
                console.log('🔔 [FORGOT PASSWORD] ✅ User found with exact match:', user.email);
            }
            if (!user) {
                console.log('🔔 [FORGOT PASSWORD] ❌ User not found in database');
                return {
                    message: 'If an account with that email exists, an OTP has been sent to your email.',
                    webhookStatus: { success: false, message: 'User not found' },
                };
            }
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const otpExpiry = new Date();
            otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);
            console.log('🔔 [FORGOT PASSWORD] Generated OTP:', otpCode);
            console.log('🔔 [FORGOT PASSWORD] OTP expires at:', otpExpiry.toISOString());
            try {
                user.otpCode = otpCode;
                user.otpExpires = otpExpiry;
                await this.usersRepository.save(user);
                console.log('🔔 [FORGOT PASSWORD] OTP saved to database');
            }
            catch (dbError) {
                console.error(`[OTP Password Reset] Database error saving OTP:`, dbError);
                if (dbError.message?.includes('column') || dbError.code === '42703') {
                    throw new common_1.BadRequestException('OTP password reset feature is not fully configured. Please run database migration to add OTP fields.');
                }
                throw dbError;
            }
            console.log('🔔 [FORGOT PASSWORD] Sending OTP via webhook...');
            let webhookStatus = null;
            try {
                webhookStatus = await this.sendOtpViaWebhook(normalizedEmail, otpCode, user.name);
                if (webhookStatus.success && webhookStatus.message?.includes('Email sent')) {
                    webhookStatus.emailSent = true;
                    console.log(`✅ [FORGOT PASSWORD] Email sent successfully via webhook!`);
                }
                else if (webhookStatus.success) {
                    console.log(`✅ [FORGOT PASSWORD] Webhook triggered successfully!`);
                }
                else {
                    console.error(`❌ [FORGOT PASSWORD] Webhook returned error:`, webhookStatus);
                }
            }
            catch (webhookError) {
                console.error(`❌ [FORGOT PASSWORD] Failed to send OTP via webhook:`, webhookError);
                webhookStatus = {
                    success: false,
                    error: webhookError.message || 'Unknown error',
                };
            }
            const response = {
                message: 'If an account with that email exists, an OTP has been sent to your email.',
            };
            response.webhookStatus = webhookStatus;
            console.log('🔔 [FORGOT PASSWORD] Returning response with webhook status');
            console.log('🔔 [FORGOT PASSWORD] ==========================================\n');
            return response;
        }
        catch (error) {
            console.error(`[OTP Password Reset] Unexpected error:`, error);
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            return {
                message: 'If an account with that email exists, an OTP has been sent to your email.',
                webhookStatus: { success: false, error: error.message },
            };
        }
    }
    async sendOtpViaWebhook(email, otp, userName) {
        try {
            const payload = {
                to: email,
                otp: otp,
            };
            if (userName)
                payload.userName = userName;
            console.log('\n📤 [WEBHOOK] ==========================================');
            console.log(`📤 [WEBHOOK] Preparing to send OTP email to: ${email}`);
            console.log(`📤 [WEBHOOK] Webhook URL: ${this.WEBHOOK_URL}`);
            console.log(`📤 [WEBHOOK] Method: POST`);
            console.log(`📤 [WEBHOOK] Payload Summary:`, payload);
            console.log(`📤 [WEBHOOK] Full Payload JSON:`, JSON.stringify(payload, null, 2));
            const requestBody = JSON.stringify(payload);
            console.log(`📤 [WEBHOOK] Request body length: ${requestBody.length} bytes`);
            console.log(`📤 [WEBHOOK] Sending POST request now...\n`);
            try {
                const response = await fetch(this.WEBHOOK_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'Webhook-Token': this.configService.get('WEBHOOK_TOKEN', 'katalystPM2026'),
                    },
                    body: requestBody,
                });
                console.log(`📥 [WEBHOOK] Response received!`);
                console.log(`📥 [WEBHOOK] Response status: ${response.status} ${response.statusText}`);
                console.log(`📥 [WEBHOOK] Response headers:`, Object.fromEntries(response.headers.entries()));
                const responseText = await response.text();
                console.log(`📥 [WEBHOOK] Response body:`, responseText);
                let responseData = null;
                try {
                    responseData = JSON.parse(responseText);
                    console.log(`📥 [WEBHOOK] Parsed response:`, responseData);
                }
                catch (e) {
                    console.log(`📥 [WEBHOOK] Response is not JSON, treating as text`);
                }
                if (!response.ok) {
                    console.error(`❌ [WEBHOOK] Error: Webhook returned status ${response.status}`);
                    console.error(`❌ [WEBHOOK] Error response:`, responseText);
                    console.error(`❌ [WEBHOOK] ==========================================\n`);
                    return {
                        success: false,
                        status: response.status,
                        message: `Webhook returned status ${response.status}`,
                        error: responseText,
                    };
                }
                const emailSent = responseData?.response?.includes('Email sent') || responseText.includes('Email sent to');
                console.log(`✅ [WEBHOOK] Successfully sent OTP email to ${email} via webhook`);
                console.log(`✅ [WEBHOOK] Response status: ${response.status}`);
                console.log(`✅ [WEBHOOK] Email sent confirmation: ${emailSent}`);
                console.log(`📤 [WEBHOOK] ==========================================\n`);
                return {
                    success: true,
                    status: response.status,
                    message: responseData?.response || responseText || 'Webhook request successful',
                    emailSent: emailSent,
                };
            }
            catch (fetchError) {
                console.error(`\n❌ [WEBHOOK] Fetch error occurred:`);
                console.error(`❌ [WEBHOOK] Error name:`, fetchError.name);
                console.error(`❌ [WEBHOOK] Error message:`, fetchError.message);
                console.error(`❌ [WEBHOOK] Error stack:`, fetchError.stack);
                console.error(`❌ [WEBHOOK] ==========================================\n`);
                return {
                    success: false,
                    message: 'Network error occurred',
                    error: fetchError.message || 'Unknown fetch error',
                };
            }
        }
        catch (error) {
            console.error(`\n❌ [WEBHOOK] Failed to send OTP email to ${email}`);
            console.error(`❌ [WEBHOOK] Error type:`, error.constructor.name);
            console.error(`❌ [WEBHOOK] Error message:`, error.message);
            console.error(`❌ [WEBHOOK] Full error:`, error);
            console.error(`❌ [WEBHOOK] ==========================================\n`);
            return {
                success: false,
                message: 'Unexpected error occurred',
                error: error.message || 'Unknown error',
            };
        }
    }
    async verifyOtp(verifyOtpDto) {
        const { email, otp } = verifyOtpDto;
        const normalizedEmail = email.toLowerCase().trim();
        console.log('🔔 [VERIFY OTP] Verifying OTP for email:', normalizedEmail);
        console.log('🔔 [VERIFY OTP] OTP received:', otp);
        let user = await this.usersRepository.findOne({
            where: { email: normalizedEmail },
        });
        if (!user) {
            console.log('🔔 [VERIFY OTP] User not found with exact match, trying case-insensitive search...');
            const allUsers = await this.usersRepository.find();
            user = allUsers.find((u) => u.email.toLowerCase() === normalizedEmail) || null;
            if (user) {
                console.log('🔔 [VERIFY OTP] ✅ User found with case-insensitive search:', user.email);
            }
        }
        else {
            console.log('🔔 [VERIFY OTP] ✅ User found with exact match:', user.email);
        }
        if (!user) {
            console.log('🔔 [VERIFY OTP] ❌ User not found');
            throw new common_1.BadRequestException('Invalid email or OTP');
        }
        console.log('🔔 [VERIFY OTP] User OTP in database:', user.otpCode);
        console.log('🔔 [VERIFY OTP] OTP expires at:', user.otpExpires);
        if (!user.otpCode) {
            console.log('🔔 [VERIFY OTP] ❌ No OTP code found for user');
            throw new common_1.BadRequestException('Invalid OTP code');
        }
        if (user.otpCode !== otp) {
            console.log('🔔 [VERIFY OTP] ❌ OTP mismatch!');
            console.log('🔔 [VERIFY OTP] Expected:', user.otpCode);
            console.log('🔔 [VERIFY OTP] Received:', otp);
            throw new common_1.BadRequestException('Invalid OTP code');
        }
        console.log('🔔 [VERIFY OTP] ✅ OTP matches!');
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
        console.log('🔔 [RESET PASSWORD] Resetting password for email:', normalizedEmail);
        let user = await this.usersRepository.findOne({
            where: { email: normalizedEmail },
        });
        if (!user) {
            console.log('🔔 [RESET PASSWORD] User not found with exact match, trying case-insensitive search...');
            const allUsers = await this.usersRepository.find();
            user = allUsers.find((u) => u.email.toLowerCase() === normalizedEmail) || null;
            if (user) {
                console.log('🔔 [RESET PASSWORD] ✅ User found with case-insensitive search:', user.email);
            }
            else {
                console.log('🔔 [RESET PASSWORD] ❌ User not found even with case-insensitive search');
            }
        }
        else {
            console.log('🔔 [RESET PASSWORD] ✅ User found with exact match:', user.email);
        }
        if (!user) {
            console.log('🔔 [RESET PASSWORD] ❌ User not found');
            throw new common_1.BadRequestException('Invalid email');
        }
        console.log('🔔 [RESET PASSWORD] Checking OTP validity...');
        console.log('🔔 [RESET PASSWORD] User OTP in database:', user.otpCode);
        console.log('🔔 [RESET PASSWORD] OTP expires at:', user.otpExpires);
        if (!user.otpCode) {
            console.log('🔔 [RESET PASSWORD] ❌ No OTP code found');
            throw new common_1.BadRequestException('OTP has expired or is invalid. Please request a new OTP.');
        }
        if (!user.otpExpires || user.otpExpires < new Date()) {
            console.log('🔔 [RESET PASSWORD] ❌ OTP has expired');
            throw new common_1.BadRequestException('OTP has expired or is invalid. Please request a new OTP.');
        }
        console.log('🔔 [RESET PASSWORD] ✅ OTP is valid');
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