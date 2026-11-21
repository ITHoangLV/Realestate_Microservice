import { Body, Controller, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { ApiEnvelope } from '../../common/response/api-envelope.decorator';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { UserDto } from '../dto/user.dto';
import { ProfileService } from '../services/profile.service';

/**
 * Hồ sơ của chính người đăng nhập: /api/v1/users/me (route 15). Không @Public(): JwtAuthGuard toàn cục yêu cầu
 * access token. Người gọi luôn là `sub` trong JWT.
 */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users/me')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Patch()
  @ApiOperation({ summary: 'Sửa họ tên, số điện thoại của tôi (phone: null để xóa số)' })
  @ApiEnvelope(UserDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'IDENTITY_PHONE_TAKEN' })
  update(@CurrentUser('sub') userId: string, @Body() dto: UpdateProfileDto): Promise<UserDto> {
    return this.profile.update(userId, dto);
  }
}
