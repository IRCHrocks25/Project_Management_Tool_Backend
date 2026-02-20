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
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
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

    // Find user (case-insensitive)
    const user = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Don't reveal if user exists or not for security
      // Return success message regardless
      return {
        message: 'If an account with that email exists, a password reset link has been sent.',
      };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date();
    resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // Token expires in 1 hour

    // Save reset token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpiry;
    await this.usersRepository.save(user);

    // Generate reset link
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3001');
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
    
    // Try to send email
    try {
      await this.emailService.sendPasswordResetEmail(normalizedEmail, resetLink, user.name);
      console.log(`[Password Reset] Email sent successfully to ${normalizedEmail}`);
    } catch (error) {
      console.error(`[Password Reset] Failed to send email to ${normalizedEmail}:`, error);
      // In development, still return the link if email fails
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Password Reset] Development mode - Reset link: ${resetLink}`);
        return {
          message: 'If an account with that email exists, a password reset link has been sent.',
          resetLink, // Only in development when email fails
        };
      }
      // In production, don't reveal if email failed for security
    }

    return {
      message: 'If an account with that email exists, a password reset link has been sent.',
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

