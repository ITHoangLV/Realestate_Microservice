import { ApiProperty } from '@nestjs/swagger';

export class AuthTokensDto {
  @ApiProperty({ description: 'JWT RS256, gửi kèm header Authorization: Bearer <accessToken>' })
  accessToken!: string;

  @ApiProperty({
    description: 'Chuỗi ngẫu nhiên, dùng một lần để lấy cặp token mới (POST /auth/refresh)',
  })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ example: 900, description: 'Số giây access token còn sống' })
  expiresIn!: number;
}
