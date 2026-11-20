import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { trim } from './trim';

/** Body của `POST /admin/listings/:id/reject`: lý do bắt buộc, khớp `reject_reason varchar(500)`. */
export class RejectListingDto {
  @ApiProperty({ minLength: 1, maxLength: 500, example: 'Ảnh không đúng với căn phòng' })
  @Transform(trim)
  @IsString()
  @Length(1, 500)
  reason!: string;
}
