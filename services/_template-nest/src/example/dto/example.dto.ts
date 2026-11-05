import { ApiProperty } from '@nestjs/swagger';

export class ExampleDto {
  @ApiProperty({ example: '0b0a8b5e-7f9e-4c3a-9d2a-2f5f4b9c1a11', format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Phòng trọ Cầu Giấy' })
  name!: string;

  @ApiProperty({ example: 3500000, type: 'integer', description: 'Giá, đơn vị VND, số nguyên' })
  priceVnd!: number;

  /** Thời gian luôn ở UTC, định dạng ISO-8601. */
  @ApiProperty({ example: '2026-11-05T10:00:00.000Z', format: 'date-time' })
  createdAt!: string;
}
