import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '../users/entities/user.entity';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
export declare class AuthService {
    private usersRepository;
    private jwtService;
    constructor(usersRepository: Repository<User>, jwtService: JwtService);
    signup(signupDto: SignupDto): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
            role: UserRole;
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
            role: UserRole;
            createdAt: Date;
            updatedAt: Date;
        };
        token: string;
    }>;
    validateUser(userId: string): Promise<User>;
    getAllUsers(): Promise<User[]>;
    getOrCreateWebhookPM(): Promise<User>;
}
