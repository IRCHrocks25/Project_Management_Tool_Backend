import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '../users/entities/user.entity';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
export declare class AuthService {
    private usersRepository;
    private jwtService;
    private emailService;
    private configService;
    constructor(usersRepository: Repository<User>, jwtService: JwtService, emailService: EmailService, configService: ConfigService);
    signup(signupDto: SignupDto): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
            role: UserRole;
            createdAt: Date;
            updatedAt: Date;
            resetPasswordToken: string;
            resetPasswordExpires: Date;
        };
        token: string;
    }>;
    login(loginDto: LoginDto): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
            role: UserRole;
            createdAt: Date;
            updatedAt: Date;
            resetPasswordToken: string;
            resetPasswordExpires: Date;
        };
        token: string;
    }>;
    validateUser(userId: string): Promise<User>;
    getAllUsers(): Promise<User[]>;
    getOrCreateWebhookPM(): Promise<User>;
    forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<{
        message: string;
        resetLink?: undefined;
    } | {
        message: string;
        resetLink: string;
    }>;
    resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{
        message: string;
    }>;
}
