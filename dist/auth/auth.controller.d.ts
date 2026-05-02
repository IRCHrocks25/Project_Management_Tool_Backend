import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordOtpDto } from './dto/reset-password-otp.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { SetUserAccessDto } from './dto/set-user-access.dto';
import { AdminResetUserPasswordDto } from './dto/admin-reset-user-password.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    signup(signupDto: SignupDto): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
            role: import("../users/entities/user.entity").UserRole;
            isTeamLead: boolean;
            isHeadPM: boolean;
            emailNotificationsEnabled: boolean;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            resetPasswordToken: string;
            resetPasswordExpires: Date;
            otpCode: string;
            otpExpires: Date;
            avatarUrl: string;
            birthday: string;
            bio: string;
        };
        token: string;
    }>;
    login(loginDto: LoginDto): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
            role: import("../users/entities/user.entity").UserRole;
            isTeamLead: boolean;
            isHeadPM: boolean;
            emailNotificationsEnabled: boolean;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            resetPasswordToken: string;
            resetPasswordExpires: Date;
            otpCode: string;
            otpExpires: Date;
            avatarUrl: string;
            birthday: string;
            bio: string;
        };
        token: string;
    }>;
    getAllUsers(): Promise<import("../users/entities/user.entity").User[]>;
    setTeamLead(id: string, body: {
        isTeamLead: boolean;
    }): Promise<{
        id: string;
        name: string;
        email: string;
        role: import("../users/entities/user.entity").UserRole;
        isTeamLead: boolean;
        isHeadPM: boolean;
        emailNotificationsEnabled: boolean;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        resetPasswordToken: string;
        resetPasswordExpires: Date;
        otpCode: string;
        otpExpires: Date;
        avatarUrl: string;
        birthday: string;
        bio: string;
    }>;
    setHeadPM(id: string, body: {
        isHeadPM: boolean;
    }): Promise<{
        id: string;
        name: string;
        email: string;
        role: import("../users/entities/user.entity").UserRole;
        isTeamLead: boolean;
        isHeadPM: boolean;
        emailNotificationsEnabled: boolean;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        resetPasswordToken: string;
        resetPasswordExpires: Date;
        otpCode: string;
        otpExpires: Date;
        avatarUrl: string;
        birthday: string;
        bio: string;
    }>;
    updateUserRole(id: string, dto: UpdateUserRoleDto, req: {
        user: {
            userId: string;
        };
    }): Promise<{
        id: string;
        name: string;
        email: string;
        role: import("../users/entities/user.entity").UserRole;
        isTeamLead: boolean;
        isHeadPM: boolean;
        emailNotificationsEnabled: boolean;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        resetPasswordToken: string;
        resetPasswordExpires: Date;
        otpCode: string;
        otpExpires: Date;
        avatarUrl: string;
        birthday: string;
        bio: string;
    }>;
    setUserAccess(id: string, dto: SetUserAccessDto, req: {
        user: {
            userId: string;
        };
    }): Promise<{
        id: string;
        name: string;
        email: string;
        role: import("../users/entities/user.entity").UserRole;
        isTeamLead: boolean;
        isHeadPM: boolean;
        emailNotificationsEnabled: boolean;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        resetPasswordToken: string;
        resetPasswordExpires: Date;
        otpCode: string;
        otpExpires: Date;
        avatarUrl: string;
        birthday: string;
        bio: string;
    }>;
    adminResetUserPassword(id: string, dto: AdminResetUserPasswordDto, req: {
        user: {
            userId: string;
        };
    }): Promise<{
        message: string;
    }>;
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
    updateProfile(req: {
        user: {
            userId: string;
        };
    }, dto: UpdateProfileDto): Promise<{
        id: string;
        name: string;
        email: string;
        role: import("../users/entities/user.entity").UserRole;
        isTeamLead: boolean;
        isHeadPM: boolean;
        emailNotificationsEnabled: boolean;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        resetPasswordToken: string;
        resetPasswordExpires: Date;
        otpCode: string;
        otpExpires: Date;
        avatarUrl: string;
        birthday: string;
        bio: string;
    }>;
    changePassword(req: {
        user: {
            userId: string;
        };
    }, dto: ChangePasswordDto): Promise<{
        message: string;
    }>;
}
