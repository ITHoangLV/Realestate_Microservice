import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AMENITIES,
  LISTING_STATUSES,
  ListingStatus,
  PROPERTY_TYPES,
  PropertyType,
} from '../entities/listing.enums';

/**
 * Một tin trong kết quả tìm kiếm (`GET /listings`, `RE.LISTING/API_Spec.md §1.4`). Bản gọn của
 * `ListingDto` cho trang kết quả: có ảnh bìa và khoảng cách, không có `description`, `images[]`,
 * `approvalStatus`, `rejectReason`, `updatedAt` (xem chi tiết ở `GET /listings/:id`).
 */
export class ListingSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() ownerId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: PROPERTY_TYPES }) propertyType!: PropertyType;
  @ApiProperty({ type: 'integer' }) priceVnd!: number;
  @ApiProperty({ type: 'integer' }) depositAmountVnd!: number;
  @ApiProperty({ type: 'number' }) areaM2!: number;
  @ApiPropertyOptional({ nullable: true, type: String }) address!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) district!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) city!: string | null;
  @ApiProperty({ enum: AMENITIES, isArray: true }) amenities!: string[];
  @ApiProperty({ type: 'number' }) lat!: number;
  @ApiProperty({ type: 'number' }) lng!: number;

  @ApiProperty({
    enum: LISTING_STATUSES,
    description: 'AVAILABLE, HELD, DEPOSITED hoặc RENTED (không bao giờ HIDDEN)',
  })
  status!: ListingStatus;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Presigned GET của ảnh bìa; null khi tin chưa có ảnh',
  })
  coverImageUrl!: string | null;

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Khoảng cách (mét) từ lat/lng của request; chỉ có khi request có lat và lng',
  })
  distanceM?: number;

  @ApiProperty() createdAt!: string;
}
