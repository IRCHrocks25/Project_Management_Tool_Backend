import { UserRole } from '../../users/entities/user.entity';
export declare class SignupDto {
    name: string;
    email: string;
    password: string;
    role: UserRole;
}
