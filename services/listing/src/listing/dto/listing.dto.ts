import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AMENITIES,
  APPROVAL_STATUSES,
  ApprovalStatus,
  LISTING_STATUSES,
  ListingStatus,
  PROPERTY_TYPES,
  PropertyType,
} from '../entities/listing.enums';

/** Ảnh trong `ListingDto`: `url` là presigned GET (DB chỉ lưu key). */
export class ListingImageDto {
  @ApiProperty() id!: string;

  @ApiProperty({ description: 'Presigned GET, hết hạn sau S3_PRESIGN_TTL_SECONDS' })
  url!: string;

  @ApiProperty({ type: 'integer' }) sortOrder!: number;
}

/**
 * Tin đăng trong response (`RE.LISTING/API_Spec.md §1.4`). Không có `version`, `held_*`, `reviewed_*`.
 * `lat`/`lng` đọc từ `location` (PostGIS).
 */
export class ListingDto {
  @ApiProperty() id!: string;
  @ApiProperty() ownerId!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description!: string | null;
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
  @ApiProperty({ enum: LISTING_STATUSES }) status!: ListingStatus;
  @ApiProperty({ enum: APPROVAL_STATUSES }) approvalStatus!: ApprovalStatus;
  @ApiProperty({ nullable: true, type: String }) rejectReason!: string | null;
  @ApiProperty({ type: [ListingImageDto] }) images!: ListingImageDto[];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}
