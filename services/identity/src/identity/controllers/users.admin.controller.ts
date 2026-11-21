import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { createUuidParamPipe } from '../../common/errors/uuid-param.pipe';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { ApiEnvelope } from '../../common/response/api-envelope.decorator';
import type { Paginated } from '../../common/response/response-meta';
import { ListUsersQuery } from '../dto/list-users.query';
import { LockUserDto } from '../dto/lock-user.dto';
import { UserDto } from '../dto/user.dto';
import { UserAdminService } from '../services/user-admin.service';

/**
 * Quản trị người dùng: /api/v1/admin/users (route 8 danh sách, route 16 khóa và mở khóa). Chỉ ADMIN
 * (`@Roles`); gateway cũng chặn thô `/api/v1/admin/*`.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/users')
export class UsersAdminController {
  constructor(private readonly admin: UserAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách người dùng (phân trang, lọc theo vai trò)' })
  @ApiEnvelope(UserDto, { isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'FORBIDDEN_ROLE' })
  list(@Query() query: ListUsersQuery): Promise<Paginated<UserDto>> {
    return this.admin.list(query);
  }

  @Post(':id/lock')
  @HttpCode(200)
  @ApiOperation({ summary: 'Khóa tài khoản: chặn đăng nhập, thu hồi mọi phiên (idempotent)' })
  @ApiEnvelope(UserDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'FORBIDDEN_ROLE' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'IDENTITY_USER_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'IDENTITY_CANNOT_LOCK_SELF' })
  lock(
    @CurrentUser('sub') adminId: string,
    @Param('id', createUuidParamPipe('id')) id: string,
    @Body() dto: LockUserDto,
  ): Promise<UserDto> {
    return this.admin.lock(adminId, id, dto.reason);
  }

  @Post(':id/unlock')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mở khóa: về ACTIVE nếu email đã xác minh, ngược lại PENDING_VERIFICATION',
  })
  @ApiEnvelope(UserDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'FORBIDDEN_ROLE' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'IDENTITY_USER_NOT_FOUND' })
  unlock(@Param('id', createUuidParamPipe('id')) id: string): Promise<UserDto> {
    return this.admin.unlock(id);
  }
}
