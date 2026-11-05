import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';

export class CreateExampleDto {
  @ApiProperty({ example: 'Phòng trọ Cầu Giấy', minLength: 3, maxLength: 100 })
  @IsString()
  @Length(3, 100)
  name!: string;

  /** Tiền luôn là số nguyên VND, KHÔNG dùng số thập phân (tránh sai số làm tròn). */
  @ApiProperty({
    example: 3500000,
    type: 'integer',
    minimum: 0,
    description: 'Giá, đơn vị VND, số nguyên',
  })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  priceVnd!: number;
}
