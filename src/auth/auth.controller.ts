import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  HttpCode,
  HttpStatus,
  UseGuards,
  Param,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
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
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { debugLog } from '../shared/debug-log';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Public signup is closed: it let anyone register with any role. Teammates are added below. */
  @Post('signup')
  signup() {
    throw new ForbiddenException('Public signup is closed. Ask your Head PM or Founder to add you.');
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard)
  async getAllUsers() {
    return this.authService.getAllUsers();
  }

  @Post('users')
  @UseGuards(JwtAuthGuard)
  async createUser(@Body() dto: CreateUserDto, @Req() req: { user: { userId: string } }) {
    return this.authService.createUser(dto, req.user.userId);
  }

  @Post('users/:id/team-lead')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async setTeamLead(
    @Param('id') id: string,
    @Body() body: { isTeamLead: boolean },
    @Req() req: { user: { userId: string } },
  ) {
    return this.authService.setTeamLead(id, body.isTeamLead, req.user.userId);
  }

  @Post('users/:id/head-pm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async setHeadPM(
    @Param('id') id: string,
    @Body() body: { isHeadPM: boolean },
    @Req() req: { user: { userId: string } },
  ) {
    return this.authService.setHeadPM(id, body.isHeadPM, req.user.userId);
  }

  @Post('users/:id/role')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.authService.updateUserRole(id, dto.role, req.user.userId);
  }

  @Post('users/:id/access')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async setUserAccess(
    @Param('id') id: string,
    @Body() dto: SetUserAccessDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.authService.setUserAccess(id, dto.isActive, req.user.userId);
  }

  @Post('users/:id/reset-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async adminResetUserPassword(
    @Param('id') id: string,
    @Body() dto: AdminResetUserPasswordDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.authService.adminResetUserPassword(id, dto.newPassword, req.user.userId);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto);
  }

  @Post('reset-password-otp')
  @HttpCode(HttpStatus.OK)
  async resetPasswordWithOtp(@Body() resetPasswordOtpDto: ResetPasswordOtpDto) {
    return this.authService.resetPasswordWithOtp(resetPasswordOtpDto);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateProfile(@Req() req: { user: { userId: string } }, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.userId, dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(@Req() req: { user: { userId: string } }, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.userId, dto);
  }
}
