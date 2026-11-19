import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { ApiEnvelope } from '../../common/response/api-envelope.decorator';
import type { Paginated } from '../../common/response/response-meta';
import { ListUsersQuery } from '../dto/list-users.query';
import { UserDto } from '../dto/user.dto';
import { UserAdminService } from '../services/user-admin.service';

/**
 * Quản trị người dùng: /api/v1/admin/users (route 8). Chỉ ADMIN (`@Roles`); gateway cũng chặn thô
 * `/api/v1/admin/*`. T2.5 thêm khóa, mở khóa vào controller này.
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
}
