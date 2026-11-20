import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

/** Body của `POST /listings/:id/images`: `key` đã nhận ở route 7 (kiểm dạng và tiền tố ở service). */
export class ConfirmImageDto {
  @ApiProperty({
    maxLength: 300,
    example: 'listings/0b0a8b5e-7f9e-4c3a-9d2a-2f5f4b9c1a11/6f1c0000.jpg',
  })
  @IsString()
  @MaxLength(300)
  key!: string;
}
