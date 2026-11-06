import { ApiProperty } from '@nestjs/swagger';
import { USER_ROLES } from '../entities/user.entity';
import type { User, UserRole } from '../entities/user.entity';

/** Thông tin user trả ra ngoài. KHÔNG bao giờ có password_hash. */
export class UserDto {
  @ApiProperty({ format: 'uuid', example: '0b0a8b5e-7f9e-4c3a-9d2a-2f5f4b9c1a11' })
  id!: string;

  @ApiProperty({ example: 'chu.nha@example.com' })
  email!: string;

  @ApiProperty({ example: 'Nguyễn Văn An' })
  fullName!: string;

  @ApiProperty({ enum: USER_ROLES })
  role!: UserRole;

  @ApiProperty({ format: 'date-time', example: '2026-11-06T10:00:00.000Z' })
  createdAt!: string;

  /** Chỉ copy từng trường cần thiết (danh sách trắng), nên thêm cột nhạy cảm vào entity cũng không lộ ra API. */
  static from(user: Pick<User, 'id' | 'email' | 'fullName' | 'role' | 'createdAt'>): UserDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
