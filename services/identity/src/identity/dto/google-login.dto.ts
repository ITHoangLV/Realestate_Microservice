import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SELF_REGISTER_ROLES } from '../entities/user.entity';
import type { UserRole } from '../entities/user.entity';

/** Body `POST /auth/google` (route 14). */
export class GoogleLoginDto {
  /** ID token (JWT) Google Sign-In trả cho frontend. Trần 4096: ID token thật dài ~1–2 KB. */
  @ApiProperty({ example: 'eyJhbGciOi...' })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  idToken!: string;

  /** Chỉ cần khi chưa có tài khoản (lần đầu). ADMIN không tự đăng ký (BR-01). */
  @ApiPropertyOptional({ enum: SELF_REGISTER_ROLES })
  @IsOptional()
  @IsIn(SELF_REGISTER_ROLES)
  role?: Extract<UserRole, 'TENANT' | 'LANDLORD'>;
}
