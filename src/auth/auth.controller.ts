import { Controller, Post, Body, Get, Patch, HttpCode, HttpStatus, UseGuards, Param, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordOtpDto } from './dto/reset-password-otp.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
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

  @Post('users/:id/team-lead')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async setTeamLead(
    @Param('id') id: string,
    @Body() body: { isTeamLead: boolean },
  ) {
    return this.authService.setTeamLead(id, body.isTeamLead);
  }

  @Post('users/:id/head-pm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async setHeadPM(
    @Param('id') id: string,
    @Body() body: { isHeadPM: boolean },
  ) {
    return this.authService.setHeadPM(id, body.isHeadPM);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    console.log('\n🚀 [CONTROLLER] /auth/forgot-password endpoint called!');
    console.log('🚀 [CONTROLLER] Request body:', JSON.stringify(forgotPasswordDto, null, 2));
    console.log('🚀 [CONTROLLER] Calling authService.forgotPassword()...\n');
    
    try {
      const result = await this.authService.forgotPassword(forgotPasswordDto);
      console.log('🚀 [CONTROLLER] forgotPassword completed successfully');
      return result;
    } catch (error) {
      console.error('🚀 [CONTROLLER] Error in forgotPassword:', error);
      throw error;
    }
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

