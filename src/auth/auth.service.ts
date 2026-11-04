import { createHash, randomInt, timingSafeEqual } from 'crypto';
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
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordOtpDto } from './dto/reset-password-otp.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import { debugLog } from '../shared/debug-log';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_HASH_LENGTH = 10;

@Injectable()
export class AuthService {
  /** Wrong tries per account for its current code. */
  private readonly otpAttempts = new Map<string, number>();

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  /** A Head PM or Founder adds a teammate. No token comes back: the new person logs in themselves. */
  async createUser(dto: CreateUserDto, actorUserId: string) {
    const actor = await this.ensureCanManageUsers(actorUserId);
    this.assertCanGrantRole(actor, dto.role);

    const email = dto.email.toLowerCase().trim();
    const existingUser = await this.usersRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Someone with this email already has an account');
    }

    const saved = await this.usersRepository.save(
      this.usersRepository.create({
        email,
        password: await bcrypt.hash(dto.password, 10),
        name: dto.name.trim(),
        role: dto.role,
      }),
    );
    const { password: _, ...userWithoutPassword } = saved;
    return userWithoutPassword;
  }

  /** Only a Founder can create or promote another Founder. */
  private assertCanGrantRole(actor: User, role: UserRole) {
    if (role === UserRole.FOUNDER_CEO && actor.role !== UserRole.FOUNDER_CEO) {
      throw new ForbiddenException('Only a Founder can give someone the Founder role');
    }
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
        debugLog(`Login attempt failed: User not found for email: ${normalizedEmail}`);
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
        debugLog(`Login attempt failed: Invalid password for email: ${normalizedEmail}`);
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
      debugLog(`Login attempt failed: Invalid password for email: ${normalizedEmail}`);
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
    if (dto.emailNotificationsEnabled !== undefined)
      user.emailNotificationsEnabled = dto.emailNotificationsEnabled;

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

  async setTeamLead(userId: string, isTeamLead: boolean, actorUserId: string) {
    await this.ensureCanManageUsers(actorUserId);
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.isTeamLead = isTeamLead;
    const saved = await this.usersRepository.save(user);
    const { password, ...userWithoutPassword } = saved;
    return userWithoutPassword;
  }

  async setHeadPM(userId: string, isHeadPM: boolean, actorUserId: string) {
    await this.ensureCanManageUsers(actorUserId);
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
    this.assertCanGrantRole(actor, role);
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
      debugLog(`[AuthService] Created webhook PM account: ${webhookPM.id}`);
    }

    return webhookPM;
  }

  // ------------------------------------------------------------ forgot password

  private findByEmail(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email: email.toLowerCase().trim() })
      .getOne();
  }

  /**
   * Stored instead of the code, so a database leak doesn't hand out working codes.
   * Cut to 10 characters because users.otpCode is VARCHAR(10) in production.
   */
  private hashOtp(userId: string, code: string): string {
    return createHash('sha256').update(`${userId}:${code}`).digest('hex').slice(0, OTP_HASH_LENGTH);
  }

  /**
   * Same answer whether or not the account exists. The email goes out in the background
   * so response time doesn't give that away either.
   */
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const message = 'If an account with that email exists, we sent it a reset code.';
    const user = await this.findByEmail(forgotPasswordDto.email);
    if (!user || user.isActive === false) return { message };

    const lastSentAt = user.otpExpires ? user.otpExpires.getTime() - OTP_TTL_MS : 0;
    if (Date.now() - lastSentAt < OTP_RESEND_COOLDOWN_MS) return { message };

    const code = randomInt(100000, 1000000).toString();
    user.otpCode = this.hashOtp(user.id, code);
    user.otpExpires = new Date(Date.now() + OTP_TTL_MS);
    await this.usersRepository.save(user);
    this.otpAttempts.delete(user.id);

    this.emailService
      .sendPasswordResetCode(user.email, code, OTP_TTL_MS / 60000, user.name)
      .catch((error) => console.error('[Auth] Password reset email failed:', error?.message || error));

    return { message };
  }

  /** Checks a code against the account. Too many wrong tries cancel it for good. */
  private async assertValidOtp(email: string, code: string): Promise<User> {
    const invalid = new BadRequestException('That code is wrong or has expired. Check it, or request a new one.');
    const user = await this.findByEmail(email);
    if (!user || !user.otpCode || !user.otpExpires || user.otpExpires.getTime() < Date.now()) throw invalid;

    const expected = Buffer.from(user.otpCode);
    const given = Buffer.from(this.hashOtp(user.id, String(code)));
    if (expected.length === given.length && timingSafeEqual(expected, given)) return user;

    const attempts = (this.otpAttempts.get(user.id) || 0) + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      this.otpAttempts.delete(user.id);
      user.otpCode = null;
      user.otpExpires = null;
      await this.usersRepository.save(user);
      throw new BadRequestException('Too many wrong tries, so this code was cancelled. Please request a new one.');
    }
    this.otpAttempts.set(user.id, attempts);
    throw invalid;
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    await this.assertValidOtp(verifyOtpDto.email, verifyOtpDto.otp);
    return { message: 'Code confirmed. You can now choose a new password.', verified: true };
  }

  /** The code is checked again here: this is the step that actually changes the password. */
  async resetPasswordWithOtp(resetPasswordOtpDto: ResetPasswordOtpDto) {
    const { email, otp, password } = resetPasswordOtpDto;
    const user = await this.assertValidOtp(email, otp);
    user.password = await bcrypt.hash(password, 10);
    user.otpCode = null;
    user.otpExpires = null;
    await this.usersRepository.save(user);
    this.otpAttempts.delete(user.id);
    return { message: 'Your password has been reset. You can now log in with your new password.' };
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
