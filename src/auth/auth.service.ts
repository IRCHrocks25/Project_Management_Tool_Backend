import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserRole } from '../users/entities/user.entity';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordOtpDto } from './dto/reset-password-otp.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private readonly WEBHOOK_URL =
    'https://katalyst-crm2.fly.dev/webhook/5bd4150f-d3c8-43e7-9238-18c4634b0679';

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  async signup(signupDto: SignupDto) {
    const { email, password, name, role } = signupDto;

    // Normalize email (lowercase and trim)
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists (case-insensitive)
    const existingUser = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with normalized email
    const user = this.usersRepository.create({
      email: normalizedEmail,
      password: hashedPassword,
      name,
      role,
    });

    const savedUser = await this.usersRepository.save(user);

    // Generate JWT token
    const payload = { sub: savedUser.id, email: savedUser.email, role: savedUser.role };
    const token = this.jwtService.sign(payload);

    // Return user data without password
    const { password: _, ...userWithoutPassword } = savedUser;

    return {
      user: userWithoutPassword,
      token,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Normalize email (lowercase and trim)
    const normalizedEmail = email.toLowerCase().trim();

    // Find user (case-insensitive email lookup)
    const user = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Try case-insensitive search as fallback
      const allUsers = await this.usersRepository.find();
      const foundUser = allUsers.find((u) => u.email.toLowerCase() === normalizedEmail);

      if (!foundUser) {
        console.log(`Login attempt failed: User not found for email: ${normalizedEmail}`);
        throw new UnauthorizedException('Invalid email or password');
      }

      // Use found user
      if (foundUser.isActive === false) {
        throw new UnauthorizedException(
          'Your account access has been revoked. Please contact Head PM.',
        );
      }

      const isPasswordValid = await bcrypt.compare(password, foundUser.password);

      if (!isPasswordValid) {
        console.log(`Login attempt failed: Invalid password for email: ${normalizedEmail}`);
        throw new UnauthorizedException('Invalid email or password');
      }

      // Generate JWT token
      const payload = { sub: foundUser.id, email: foundUser.email, role: foundUser.role };
      const token = this.jwtService.sign(payload);

      // Return user data without password
      const { password: _, ...userWithoutPassword } = foundUser;

      return {
        user: userWithoutPassword,
        token,
      };
    }

    // Verify password
    if (user.isActive === false) {
      throw new UnauthorizedException(
        'Your account access has been revoked. Please contact Head PM.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      console.log(`Login attempt failed: Invalid password for email: ${normalizedEmail}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate JWT token
    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);

    // Return user data without password
    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token,
    };
  }

  async validateUser(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.isActive === false) {
      throw new UnauthorizedException('Your account access has been revoked');
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
        'isActive',
        'avatarUrl',
        'birthday',
        'bio',
      ],
      order: { name: 'ASC' },
    });
    return users;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.email !== undefined) {
      const normalizedEmail = dto.email.toLowerCase().trim();
      const existing = await this.usersRepository.findOne({ where: { email: normalizedEmail } });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email is already in use');
      }
      user.email = normalizedEmail;
    }
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;
    if (dto.birthday !== undefined) user.birthday = dto.birthday;
    if (dto.bio !== undefined) user.bio = dto.bio;

    const saved = await this.usersRepository.save(user);
    const { password, ...userWithoutPassword } = saved;
    return userWithoutPassword;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    user.password = await bcrypt.hash(dto.newPassword, 10);
    await this.usersRepository.save(user);
    return { message: 'Password updated successfully' };
  }

  async setTeamLead(userId: string, isTeamLead: boolean) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.isTeamLead = isTeamLead;
    const saved = await this.usersRepository.save(user);
    const { password, ...userWithoutPassword } = saved;
    return userWithoutPassword;
  }

  async setHeadPM(userId: string, isHeadPM: boolean) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role !== UserRole.PROJECT_MANAGER) {
      throw new BadRequestException('Only Project Managers can be designated as Head PM');
    }
    user.isHeadPM = isHeadPM;
    const saved = await this.usersRepository.save(user);
    const { password, ...userWithoutPassword } = saved;
    return userWithoutPassword;
  }

  private async ensureCanManageUsers(actorUserId: string): Promise<User> {
    const actor = await this.usersRepository.findOne({ where: { id: actorUserId } });
    if (!actor) {
      throw new UnauthorizedException('Requesting user not found');
    }
    const isFounder = actor.role === UserRole.FOUNDER_CEO;
    if (!actor.isHeadPM && !isFounder) {
      throw new ForbiddenException('Only Head PM can manage users');
    }
    return actor;
  }

  async updateUserRole(userId: string, role: UserRole, actorUserId: string) {
    const actor = await this.ensureCanManageUsers(actorUserId);
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.id === actor.id && role !== user.role) {
      throw new BadRequestException('You cannot change your own department');
    }

    user.role = role;
    if (role !== UserRole.PROJECT_MANAGER) {
      user.isHeadPM = false;
    }
    const saved = await this.usersRepository.save(user);
    const { password, ...userWithoutPassword } = saved;
    return userWithoutPassword;
  }

  async setUserAccess(userId: string, isActive: boolean, actorUserId: string) {
    const actor = await this.ensureCanManageUsers(actorUserId);
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.id === actor.id && !isActive) {
      throw new BadRequestException('You cannot revoke your own access');
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

  async adminResetUserPassword(userId: string, newPassword: string, actorUserId: string) {
    await this.ensureCanManageUsers(actorUserId);
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.otpCode = null;
    user.otpExpires = null;
    await this.usersRepository.save(user);
    return { message: 'User password has been reset successfully' };
  }

  /**
   * Get or create a dedicated webhook PM account
   * This account is used for projects created via webhook
   */
  async getOrCreateWebhookPM(): Promise<User> {
    const webhookEmail = 'webhook@katalyst.pm';

    // Try to find existing webhook PM
    let webhookPM = await this.usersRepository.findOne({
      where: { email: webhookEmail },
    });

    if (!webhookPM) {
      // Create webhook PM account if it doesn't exist
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      webhookPM = this.usersRepository.create({
        email: webhookEmail,
        password: hashedPassword,
        name: 'Webhook System',
        role: UserRole.PROJECT_MANAGER,
      });

      webhookPM = await this.usersRepository.save(webhookPM);
      console.log(`[AuthService] Created webhook PM account: ${webhookPM.id}`);
    }

    return webhookPM;
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;
    const normalizedEmail = email.toLowerCase().trim();

    // Force output to terminal
    process.stdout.write('\n');
    console.log('🔔 [FORGOT PASSWORD] ==========================================');
    console.log('🔔 [FORGOT PASSWORD] Request received for email:', normalizedEmail);
    console.log(
      '🔔 [FORGOT PASSWORD] Flow: Email submit → Generate OTP → Save to DB → Send via Webhook',
    );
    console.log('🔔 [FORGOT PASSWORD] ==========================================\n');

    try {
      // Find user (case-insensitive)
      let user = await this.usersRepository.findOne({
        where: { email: normalizedEmail },
      });

      // Fallback: case-insensitive search if not found
      if (!user) {
        console.log(
          '🔔 [FORGOT PASSWORD] User not found with exact match, trying case-insensitive search...',
        );
        console.log('🔔 [FORGOT PASSWORD] Searching for normalized email:', normalizedEmail);
        const allUsers = await this.usersRepository.find();
        console.log('🔔 [FORGOT PASSWORD] Total users in database:', allUsers.length);
        console.log(
          '🔔 [FORGOT PASSWORD] Sample emails in DB:',
          allUsers.slice(0, 5).map((u) => u.email),
        );

        user = allUsers.find((u) => u.email.toLowerCase() === normalizedEmail) || null;

        if (user) {
          console.log('🔔 [FORGOT PASSWORD] ✅ User found with case-insensitive search!');
          console.log('🔔 [FORGOT PASSWORD] Found user email:', user.email);
          console.log('🔔 [FORGOT PASSWORD] Found user ID:', user.id);
        } else {
          console.log('🔔 [FORGOT PASSWORD] ❌ User not found even with case-insensitive search');
          console.log('🔔 [FORGOT PASSWORD] Searched email:', normalizedEmail);
        }
      } else {
        console.log('🔔 [FORGOT PASSWORD] ✅ User found with exact match:', user.email);
      }

      if (!user) {
        console.log('🔔 [FORGOT PASSWORD] ❌ User not found in database');
        // Don't reveal if user exists or not for security
        return {
          message: 'If an account with that email exists, an OTP has been sent to your email.',
          webhookStatus: { success: false, message: 'User not found' },
        };
      }

      // Generate 6-digit OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiry = new Date();
      otpExpiry.setMinutes(otpExpiry.getMinutes() + 10); // OTP expires in 10 minutes

      console.log('🔔 [FORGOT PASSWORD] Generated OTP:', otpCode);
      console.log('🔔 [FORGOT PASSWORD] OTP expires at:', otpExpiry.toISOString());

      // Save OTP to user
      try {
        user.otpCode = otpCode;
        user.otpExpires = otpExpiry;
        await this.usersRepository.save(user);
        console.log('🔔 [FORGOT PASSWORD] OTP saved to database');
      } catch (dbError: any) {
        console.error(`[OTP Password Reset] Database error saving OTP:`, dbError);
        if (dbError.message?.includes('column') || dbError.code === '42703') {
          throw new BadRequestException(
            'OTP password reset feature is not fully configured. Please run database migration to add OTP fields.',
          );
        }
        throw dbError;
      }

      // Send OTP via webhook
      console.log('🔔 [FORGOT PASSWORD] Sending OTP via webhook...');
      let webhookStatus: {
        success: boolean;
        status?: number;
        message?: string;
        error?: string;
        emailSent?: boolean;
      } | null = null;

      try {
        webhookStatus = await this.sendOtpViaWebhook(normalizedEmail, otpCode, user.name);

        // Check if webhook response indicates email was sent
        if (webhookStatus.success && webhookStatus.message?.includes('Email sent')) {
          webhookStatus.emailSent = true;
          console.log(`✅ [FORGOT PASSWORD] Email sent successfully via webhook!`);
        } else if (webhookStatus.success) {
          console.log(`✅ [FORGOT PASSWORD] Webhook triggered successfully!`);
        } else {
          console.error(`❌ [FORGOT PASSWORD] Webhook returned error:`, webhookStatus);
        }
      } catch (webhookError: any) {
        console.error(`❌ [FORGOT PASSWORD] Failed to send OTP via webhook:`, webhookError);
        webhookStatus = {
          success: false,
          error: webhookError.message || 'Unknown error',
        };
      }

      const response: any = {
        message: 'If an account with that email exists, an OTP has been sent to your email.',
      };

      // ALWAYS include webhook status in response
      response.webhookStatus = webhookStatus;

      console.log('🔔 [FORGOT PASSWORD] Returning response with webhook status');
      console.log('🔔 [FORGOT PASSWORD] ==========================================\n');

      return response;
    } catch (error: any) {
      console.error(`[OTP Password Reset] Unexpected error:`, error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      return {
        message: 'If an account with that email exists, an OTP has been sent to your email.',
        webhookStatus: { success: false, error: error.message },
      };
    }
  }

  private async sendOtpViaWebhook(
    email: string,
    otp: string,
    userName?: string,
  ): Promise<{
    success: boolean;
    status?: number;
    message?: string;
    error?: string;
    emailSent?: boolean;
  }> {
    try {
      // Payload for n8n: to, otp, optional userName for personalization
      const payload: { to: string; otp: string; userName?: string } = {
        to: email,
        otp: otp,
      };
      if (userName) payload.userName = userName;

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
            'Webhook-Token': this.configService.get<string>('WEBHOOK_TOKEN', 'katalystPM2026'),
          },
          body: requestBody,
        });

        console.log(`📥 [WEBHOOK] Response received!`);
        console.log(`📥 [WEBHOOK] Response status: ${response.status} ${response.statusText}`);
        console.log(
          `📥 [WEBHOOK] Response headers:`,
          Object.fromEntries(response.headers.entries()),
        );

        const responseText = await response.text();
        console.log(`📥 [WEBHOOK] Response body:`, responseText);

        // Try to parse JSON response
        let responseData: any = null;
        try {
          responseData = JSON.parse(responseText);
          console.log(`📥 [WEBHOOK] Parsed response:`, responseData);
        } catch (e) {
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

        // Check if response indicates email was sent (format: {"response": "Email sent to test@example.com."})
        const emailSent =
          responseData?.response?.includes('Email sent') || responseText.includes('Email sent to');

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
      } catch (fetchError: any) {
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
    } catch (error: any) {
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

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { email, otp } = verifyOtpDto;
    const normalizedEmail = email.toLowerCase().trim();

    console.log('🔔 [VERIFY OTP] Verifying OTP for email:', normalizedEmail);
    console.log('🔔 [VERIFY OTP] OTP received:', otp);

    // Find user (case-insensitive)
    let user = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });

    // Fallback: case-insensitive search if not found
    if (!user) {
      console.log(
        '🔔 [VERIFY OTP] User not found with exact match, trying case-insensitive search...',
      );
      const allUsers = await this.usersRepository.find();
      user = allUsers.find((u) => u.email.toLowerCase() === normalizedEmail) || null;

      if (user) {
        console.log('🔔 [VERIFY OTP] ✅ User found with case-insensitive search:', user.email);
      }
    } else {
      console.log('🔔 [VERIFY OTP] ✅ User found with exact match:', user.email);
    }

    if (!user) {
      console.log('🔔 [VERIFY OTP] ❌ User not found');
      throw new BadRequestException('Invalid email or OTP');
    }

    console.log('🔔 [VERIFY OTP] User OTP in database:', user.otpCode);
    console.log('🔔 [VERIFY OTP] OTP expires at:', user.otpExpires);

    // Check if OTP exists and matches
    if (!user.otpCode) {
      console.log('🔔 [VERIFY OTP] ❌ No OTP code found for user');
      throw new BadRequestException('Invalid OTP code');
    }

    if (user.otpCode !== otp) {
      console.log('🔔 [VERIFY OTP] ❌ OTP mismatch!');
      console.log('🔔 [VERIFY OTP] Expected:', user.otpCode);
      console.log('🔔 [VERIFY OTP] Received:', otp);
      throw new BadRequestException('Invalid OTP code');
    }

    console.log('🔔 [VERIFY OTP] ✅ OTP matches!');

    // Check if OTP has expired
    if (!user.otpExpires || user.otpExpires < new Date()) {
      // Clear expired OTP
      user.otpCode = null;
      user.otpExpires = null;
      await this.usersRepository.save(user);
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    // OTP is valid - return success (don't clear OTP yet, will be cleared on password reset)
    return {
      message: 'OTP verified successfully. You can now reset your password.',
      verified: true,
    };
  }

  async resetPasswordWithOtp(resetPasswordOtpDto: ResetPasswordOtpDto) {
    const { email, password } = resetPasswordOtpDto;
    const normalizedEmail = email.toLowerCase().trim();

    console.log('🔔 [RESET PASSWORD] Resetting password for email:', normalizedEmail);

    // Find user (case-insensitive)
    let user = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });

    // Fallback: case-insensitive search if not found
    if (!user) {
      console.log(
        '🔔 [RESET PASSWORD] User not found with exact match, trying case-insensitive search...',
      );
      const allUsers = await this.usersRepository.find();
      user = allUsers.find((u) => u.email.toLowerCase() === normalizedEmail) || null;

      if (user) {
        console.log('🔔 [RESET PASSWORD] ✅ User found with case-insensitive search:', user.email);
      } else {
        console.log('🔔 [RESET PASSWORD] ❌ User not found even with case-insensitive search');
      }
    } else {
      console.log('🔔 [RESET PASSWORD] ✅ User found with exact match:', user.email);
    }

    if (!user) {
      console.log('🔔 [RESET PASSWORD] ❌ User not found');
      throw new BadRequestException('Invalid email');
    }

    // Verify OTP is still valid
    console.log('🔔 [RESET PASSWORD] Checking OTP validity...');
    console.log('🔔 [RESET PASSWORD] User OTP in database:', user.otpCode);
    console.log('🔔 [RESET PASSWORD] OTP expires at:', user.otpExpires);

    if (!user.otpCode) {
      console.log('🔔 [RESET PASSWORD] ❌ No OTP code found');
      throw new BadRequestException('OTP has expired or is invalid. Please request a new OTP.');
    }

    if (!user.otpExpires || user.otpExpires < new Date()) {
      console.log('🔔 [RESET PASSWORD] ❌ OTP has expired');
      throw new BadRequestException('OTP has expired or is invalid. Please request a new OTP.');
    }

    console.log('🔔 [RESET PASSWORD] ✅ OTP is valid');

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password and clear OTP
    user.password = hashedPassword;
    user.otpCode = null;
    user.otpExpires = null;
    await this.usersRepository.save(user);

    return {
      message: 'Password has been reset successfully. You can now log in with your new password.',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, password } = resetPasswordDto;

    // Find user with valid reset token
    const user = await this.usersRepository.findOne({
      where: { resetPasswordToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Check if token has expired
    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new BadRequestException('Reset token has expired. Please request a new one.');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await this.usersRepository.save(user);

    return {
      message: 'Password has been reset successfully. You can now log in with your new password.',
    };
  }
}
