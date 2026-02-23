import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordOtpDto } from './dto/reset-password-otp.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    signup(signupDto: SignupDto): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
            role: import("../users/entities/user.entity").UserRole;
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
            role: import("../users/entities/user.entity").UserRole;
            createdAt: Date;
            updatedAt: Date;
            resetPasswordToken: string;
            resetPasswordExpires: Date;
            otpCode: string;
            otpExpires: Date;
        };
        token: string;
    }>;
    getAllUsers(): Promise<import("../users/entities/user.entity").User[]>;
    forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<any>;
    resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{
        message: string;
    }>;
    verifyOtp(verifyOtpDto: VerifyOtpDto): Promise<{
        message: string;
        verified: boolean;
    }>;
    resetPasswordWithOtp(resetPasswordOtpDto: ResetPasswordOtpDto): Promise<{
        message: string;
    }>;
}
