import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
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
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private readonly WEBHOOK_URL = 'https://katalyst-crm2.fly.dev/webhook/5bd4150f-d3c8-43e7-9238-18c4634b0679';

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
      const foundUser = allUsers.find(u => u.email.toLowerCase() === normalizedEmail);
      
      if (!foundUser) {
        console.log(`Login attempt failed: User not found for email: ${normalizedEmail}`);
        throw new UnauthorizedException('Invalid email or password');
      }
      
      // Use found user
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

    return user;
  }

  async getAllUsers() {
    const users = await this.usersRepository.find({
      select: ['id', 'name', 'email', 'role', 'createdAt'],
      order: { name: 'ASC' },
    });
    return users;
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
    console.log('🔔 [FORGOT PASSWORD] Starting password reset flow...');
    console.log('🔔 [FORGOT PASSWORD] ==========================================\n');

    try {
      // Find user (case-insensitive)
      const user = await this.usersRepository.findOne({
        where: { email: normalizedEmail },
      });

      if (!user) {
        // Don't reveal if user exists or not for security
        // Return success message regardless
        return {
          message: 'If an account with that email exists, an OTP has been sent to your email.',
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
      } catch (dbError: any) {
        console.error(`[OTP Password Reset] Database error saving OTP:`, dbError);
        // Check if it's a column missing error
        if (dbError.message?.includes('column') || dbError.code === '42703') {
          throw new BadRequestException('OTP password reset feature is not fully configured. Please run database migration to add OTP fields.');
        }
        throw dbError;
      }

      // Send OTP via webhook
      console.log('🔔 [FORGOT PASSWORD] Attempting to send OTP via webhook...');
      let webhookStatus: { success: boolean; status?: number; message?: string; error?: string } | null = null;
      
      try {
        webhookStatus = await this.sendOtpViaWebhook(normalizedEmail, otpCode, user.name);
        if (webhookStatus.success) {
          console.log(`✅ [FORGOT PASSWORD] OTP sent successfully to ${normalizedEmail}`);
          console.log(`✅ [FORGOT PASSWORD] Webhook response status: ${webhookStatus.status}`);
        } else {
          console.error(`❌ [FORGOT PASSWORD] Webhook returned error:`, webhookStatus);
        }
      } catch (webhookError: any) {
        console.error(`❌ [FORGOT PASSWORD] Failed to send OTP via webhook to ${normalizedEmail}:`, webhookError);
        console.error(`❌ [FORGOT PASSWORD] Webhook error details:`, {
          name: webhookError.name,
          message: webhookError.message,
          stack: webhookError.stack,
        });
        webhookStatus = {
          success: false,
          error: webhookError.message || 'Unknown error',
        };
        // In development, log the OTP for testing
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔑 [FORGOT PASSWORD] Development mode - OTP for testing: ${otpCode}`);
        }
        // Don't fail the request - still return success message for security
      }

      const response: any = {
        message: 'If an account with that email exists, an OTP has been sent to your email.',
      };

      // ALWAYS include webhook status in response for debugging
      response.webhookStatus = webhookStatus;
      response.otpGenerated = !!otpCode; // For debugging

      return response;
    } catch (error: any) {
      console.error(`[OTP Password Reset] Unexpected error:`, error);
      // Re-throw BadRequestException (for migration errors)
      if (error instanceof BadRequestException) {
        throw error;
      }
      // For other errors, return generic message (don't reveal internal errors)
      return {
        message: 'If an account with that email exists, an OTP has been sent to your email.',
      };
    }
  }

  private async sendOtpViaWebhook(email: string, otp: string, userName?: string): Promise<{ success: boolean; status?: number; message?: string; error?: string }> {
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

      console.log('\n📤 [WEBHOOK] ==========================================');
      console.log(`📤 [WEBHOOK] Preparing to send OTP email to: ${email}`);
      console.log(`📤 [WEBHOOK] Webhook URL: ${this.WEBHOOK_URL}`);
      console.log(`📤 [WEBHOOK] Method: POST`);
      console.log(`📤 [WEBHOOK] Payload Summary:`, {
        to: payload.to,
        subject: payload.subject,
        bodyLength: payload.body.length,
        htmlLength: payload.html.length,
      });
      console.log(`📤 [WEBHOOK] Full Payload JSON:`, JSON.stringify(payload, null, 2));

      const requestBody = JSON.stringify(payload);
      console.log(`📤 [WEBHOOK] Request body length: ${requestBody.length} bytes`);
      console.log(`📤 [WEBHOOK] Sending POST request now...\n`);

      try {
        const response = await fetch(this.WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: requestBody,
        });

        console.log(`📥 [WEBHOOK] Response received!`);
        console.log(`📥 [WEBHOOK] Response status: ${response.status} ${response.statusText}`);
        console.log(`📥 [WEBHOOK] Response headers:`, Object.fromEntries(response.headers.entries()));
        
        const responseText = await response.text();
        console.log(`📥 [WEBHOOK] Response body:`, responseText);
        
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

        console.log(`✅ [WEBHOOK] Successfully sent OTP email to ${email} via webhook`);
        console.log(`✅ [WEBHOOK] Response status: ${response.status}`);
        console.log(`✅ [WEBHOOK] Response body: ${responseText}`);
        console.log(`📤 [WEBHOOK] ==========================================\n`);
        
        return {
          success: true,
          status: response.status,
          message: 'Webhook request successful',
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

    // Find user (case-insensitive)
    const user = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new BadRequestException('Invalid email or OTP');
    }

    // Check if OTP exists and matches
    if (!user.otpCode || user.otpCode !== otp) {
      throw new BadRequestException('Invalid OTP code');
    }

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

    // Find user (case-insensitive)
    const user = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new BadRequestException('Invalid email');
    }

    // Verify OTP is still valid
    if (!user.otpCode || !user.otpExpires || user.otpExpires < new Date()) {
      throw new BadRequestException('OTP has expired or is invalid. Please request a new OTP.');
    }

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

