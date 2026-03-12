import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '../users/entities/user.entity';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordOtpDto } from './dto/reset-password-otp.dto';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
export declare class AuthService {
    private usersRepository;
    private jwtService;
    private emailService;
    private configService;
    private readonly WEBHOOK_URL;
    constructor(usersRepository: Repository<User>, jwtService: JwtService, emailService: EmailService, configService: ConfigService);
    signup(signupDto: SignupDto): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
            role: UserRole;
            isTeamLead: boolean;
            isHeadPM: boolean;
            createdAt: Date;
            updatedAt: Date;
            resetPasswordToken: string;
            resetPasswordExpires: Date;
            otpCode: string;
            otpExpires: Date;
        };
        token: string;
    }>;
    login(loginDto: LoginDto): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
            role: UserRole;
            isTeamLead: boolean;
            isHeadPM: boolean;
            createdAt: Date;
            updatedAt: Date;
            resetPasswordToken: string;
            resetPasswordExpires: Date;
            otpCode: string;
            otpExpires: Date;
        };
        token: string;
    }>;
    validateUser(userId: string): Promise<User>;
    getAllUsers(): Promise<User[]>;
    setTeamLead(userId: string, isTeamLead: boolean): Promise<{
        id: string;
        name: string;
        email: string;
        role: UserRole;
        isTeamLead: boolean;
        isHeadPM: boolean;
        createdAt: Date;
        updatedAt: Date;
        resetPasswordToken: string;
        resetPasswordExpires: Date;
        otpCode: string;
        otpExpires: Date;
    }>;
    setHeadPM(userId: string, isHeadPM: boolean): Promise<{
        id: string;
        name: string;
        email: string;
        role: UserRole;
        isTeamLead: boolean;
        isHeadPM: boolean;
        createdAt: Date;
        updatedAt: Date;
        resetPasswordToken: string;
        resetPasswordExpires: Date;
        otpCode: string;
        otpExpires: Date;
    }>;
    getOrCreateWebhookPM(): Promise<User>;
    forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<any>;
    private sendOtpViaWebhook;
    verifyOtp(verifyOtpDto: VerifyOtpDto): Promise<{
        message: string;
        verified: boolean;
    }>;
    resetPasswordWithOtp(resetPasswordOtpDto: ResetPasswordOtpDto): Promise<{
        message: string;
    }>;
    resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{
        message: string;
    }>;
}
