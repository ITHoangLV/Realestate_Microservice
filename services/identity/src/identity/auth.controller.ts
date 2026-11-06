import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Public } from '../common/auth/public.decorator';
import { ErrorResponseDto } from '../common/errors/error-response.dto';
import { AuthService } from './auth.service';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { UserDto } from './dto/user.dto';

/**
 * API xác thực công khai: /api/v1/auth/*. Controller chỉ nhận request và gọi AuthService.
 * Register, login, refresh, logout gắn @Public() vì người gọi chưa có access token hợp lệ.
 * Riêng /me không @Public() nên JwtAuthGuard toàn cục tự yêu cầu và kiểm tra access token.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký (chỉ TENANT hoặc LANDLORD)' })
  @ApiCreatedResponse({ type: UserDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'IDENTITY_EMAIL_TAKEN' })
  register(@Body() dto: RegisterDto): Promise<UserDto> {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Đăng nhập bằng email + mật khẩu' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'IDENTITY_INVALID_CREDENTIALS' })
  login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Đổi refresh token lấy cặp token mới (token cũ chỉ dùng được một lần)' })
  @ApiOkResponse({ type: AuthTokensDto })
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
  @ApiOkResponse({ type: UserDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  me(@CurrentUser('sub') userId: string): Promise<UserDto> {
    return this.auth.me(userId);
  }
}
