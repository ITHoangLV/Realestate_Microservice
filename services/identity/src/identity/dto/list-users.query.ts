import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../common/response/page-query.dto';
import { USER_ROLES } from '../entities/user.entity';
import type { UserRole } from '../entities/user.entity';

/** Query của `GET /admin/users` (route 8): phân trang (kế thừa) + lọc theo vai trò. */
export class ListUsersQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: USER_ROLES, description: 'Chỉ lấy người dùng có vai trò này' })
  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;
}
