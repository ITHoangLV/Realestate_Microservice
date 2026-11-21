import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiServiceUnavailableResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { ApiEnvelope } from '../../common/response/api-envelope.decorator';
import { AuthService } from '../services/auth.service';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh.dto';
import { RegisterDto } from '../dto/register.dto';
import { UserDto } from '../dto/user.dto';
import { EmailOnlyDto } from '../dto/email-only.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { PasswordResetService } from '../services/password-reset.service';
import { GoogleLoginDto } from '../dto/google-login.dto';
import { GoogleAuthService } from '../services/google-auth.service';

/**
 * API xác thực công khai: /api/v1/auth/*. Controller chỉ nhận request và gọi AuthService.
 * Register, login, refresh, logout gắn @Public() vì người gọi chưa có access token hợp lệ.
 * Riêng /me không @Public() nên JwtAuthGuard toàn cục tự yêu cầu và kiểm tra access token.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly google: GoogleAuthService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký (chỉ TENANT hoặc LANDLORD)' })
  @ApiEnvelope(UserDto, { status: HttpStatus.CREATED })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'IDENTITY_EMAIL_TAKEN hoặc IDENTITY_PHONE_TAKEN',
  })
  register(@Body() dto: RegisterDto): Promise<UserDto> {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Đăng nhập bằng email + mật khẩu' })
  @ApiEnvelope(AuthTokensDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'IDENTITY_INVALID_CREDENTIALS' })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'IDENTITY_EMAIL_NOT_VERIFIED hoặc IDENTITY_ACCOUNT_LOCKED (sau khi đúng mật khẩu)',
  })
  login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    return this.auth.login(dto);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(200)
  @ApiOperation({ summary: 'Xác minh email bằng OTP; đúng thì tài khoản ACTIVE và cấp cặp token' })
  @ApiEnvelope(AuthTokensDto)
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'IDENTITY_OTP_INVALID (sai, hết hạn, bị hủy sau quá số lần sai, hoặc không có tài khoản chờ xác minh)',
  })
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<AuthTokensDto> {
    return this.auth.verifyOtp(dto);
  }

  @Public()
  @Post('resend-otp')
  @HttpCode(202)
  @ApiOperation({ summary: 'Gửi lại OTP (202 cả khi email không có tài khoản)' })
  @ApiAcceptedResponse({ description: 'Đã nhận yêu cầu' })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'IDENTITY_OTP_RESEND_TOO_SOON (còn trong thời gian chờ gửi lại)',
  })
  resendOtp(@Body() dto: EmailOnlyDto): Promise<void> {
    return this.auth.resendOtp(dto.email);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Quên mật khẩu: gửi link đặt lại (202 cả khi email không có tài khoản)',
  })
  @ApiAcceptedResponse({ description: 'Luôn 202, không cho biết email có tài khoản hay không' })
  forgotPassword(@Body() dto: EmailOnlyDto): Promise<void> {
    return this.passwordReset.request(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  @ApiOperation({ summary: 'Đặt lại mật khẩu bằng token trong email; thu hồi mọi phiên đăng nhập' })
  @ApiNoContentResponse({ description: 'Đã đổi mật khẩu, mọi phiên cũ bị thu hồi' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'IDENTITY_RESET_TOKEN_INVALID (không có, hết hạn, đã dùng) hoặc VALIDATION_FAILED',
  })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.passwordReset.reset(dto.token, dto.newPassword);
  }

  @Public()
  @Post('google')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Đăng nhập bằng Google (ID token); lần đầu phải gửi kèm role',
  })
  @ApiEnvelope(AuthTokensDto)
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'IDENTITY_ROLE_REQUIRED (chưa có tài khoản, thiếu role) hoặc VALIDATION_FAILED',
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'IDENTITY_GOOGLE_TOKEN_INVALID' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'IDENTITY_ACCOUNT_LOCKED' })
  @ApiServiceUnavailableResponse({
    type: ErrorResponseDto,
    description:
      'DEPENDENCY_UNAVAILABLE (chưa đặt GOOGLE_CLIENT_ID, hoặc không tải được khóa Google)',
  })
  loginWithGoogle(@Body() dto: GoogleLoginDto): Promise<AuthTokensDto> {
    return this.google.login(dto.idToken, dto.role);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Đổi refresh token lấy cặp token mới (token cũ chỉ dùng được một lần)' })
  @ApiEnvelope(AuthTokensDto)
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'IDENTITY_INVALID_REFRESH_TOKEN (không có, hết hạn, đã thu hồi hoặc bị dùng lại)',
  })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Đăng xuất: thu hồi cả họ refresh token của phiên này' })
  @ApiNoContentResponse({ description: 'Luôn 204, kể cả khi token không tồn tại' })
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin người đang đăng nhập' })
  @ApiEnvelope(UserDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  me(@CurrentUser('sub') userId: string): Promise<UserDto> {
    return this.auth.me(userId);
  }
}
