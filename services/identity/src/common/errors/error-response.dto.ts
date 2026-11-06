import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Mô tả format lỗi thống nhất trong Swagger/OpenAPI (khớp ErrorResponse trong all-exceptions.filter.ts). */
export class ErrorResponseDto {
  @ApiProperty({
    example: 'EXAMPLE_NAME_TAKEN',
    description: 'Mã lỗi ổn định, client dựa vào đây để xử lý',
  })
  code!: string;

  @ApiProperty({ example: 'Tên đã tồn tại', description: 'Thông điệp cho người đọc' })
  message!: string;

  @ApiPropertyOptional({ description: 'Dữ liệu bổ sung (lỗi từng trường, id liên quan...)' })
  details?: unknown;

  @ApiProperty({ example: 'abc-123', description: 'ID truy vết, trùng header X-Request-ID' })
  correlationId!: string;
}
