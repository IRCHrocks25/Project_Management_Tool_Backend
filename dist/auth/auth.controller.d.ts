import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
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
        };
        token: string;
    }>;
    getAllUsers(): Promise<import("../users/entities/user.entity").User[]>;
}
