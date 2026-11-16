import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Dùng cho cả POST /auth/refresh và POST /auth/logout. */
export class RefreshTokenDto {
  @ApiProperty({ example: 'qJ3x...43 ký tự base64url' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  refreshToken!: string;
}
