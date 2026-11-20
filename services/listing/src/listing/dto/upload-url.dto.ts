import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

/**
 * Body của `POST /listings/:id/images/upload-url`. Loại file được phép lấy từ `LISTING_IMAGE_TYPES`
 * (đổi được bằng env), nên kiểm ở `ListingImageService` và trả `400 LISTING_IMAGE_INVALID`,
 * không ghi cứng danh sách vào DTO.
 */
export class UploadUrlDto {
  @ApiProperty({ example: 'image/jpeg', description: 'Thuộc LISTING_IMAGE_TYPES' })
  @IsString()
  @MaxLength(100)
  contentType!: string;
}

/** Response của route 7. */
export class UploadUrlResponseDto {
  @ApiProperty({ description: 'Presigned PUT. Client PUT đúng Content-Type đã khai' })
  uploadUrl!: string;

  @ApiProperty({ example: 'listings/0b0a8b5e-7f9e-4c3a-9d2a-2f5f4b9c1a11/6f1c0000.jpg' })
  key!: string;

  @ApiProperty({ example: 900 })
  expiresInSeconds!: number;
}
