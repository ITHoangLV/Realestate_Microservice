import { IsIn, IsISO8601, IsUUID, Matches } from 'class-validator';
import { ListingStatus, TARGET_STATUSES, TargetStatus } from '../entities/listing.enums';

/**
 * DTO của API nội bộ `/internal/listings/*` (`contracts/openapi/listing-internal.v1.yaml`). Controller
 * nội bộ không có trong Swagger công khai nên không gắn `@ApiProperty`. Hợp đồng `additionalProperties:
 * false`: ValidationPipe toàn cục đã `forbidNonWhitelisted`.
 */

/** Body của `POST /internal/listings/:id/holds`. `heldUntil` do rental sinh (now + `HOLD_TTL_SECONDS`). */
export class HoldListingDto {
  @IsUUID(undefined, { message: 'depositId phải là UUID' })
  depositId!: string;

  /** date-time có múi giờ (`Z` hoặc `±hh:mm`); listing không kiểm "ở tương lai" (API_Spec §2.1). */
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, { message: 'heldUntil phải có múi giờ (Z hoặc ±hh:mm)' })
  heldUntil!: string;
}

/** Body của `PUT /internal/listings/:id/status`. */
export class ChangeStatusDto {
  @IsUUID(undefined, { message: 'depositId phải là UUID' })
  depositId!: string;

  @IsIn(TARGET_STATUSES, { message: `status chỉ nhận: ${TARGET_STATUSES.join(', ')}` })
  status!: TargetStatus;
}

/** Response của `GET /internal/listings/:id` (`ListingSnapshot`). */
export interface ListingSnapshotDto {
  id: string;
  ownerId: string;
  title: string;
  depositAmountVnd: number;
  status: ListingStatus;
  approvalStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
}

/** Response của `POST /internal/listings/:id/holds`. */
export interface HoldResultDto {
  listingId: string;
  depositId: string;
  status: 'HELD';
  heldUntil: string;
}

/** Response của `PUT /internal/listings/:id/status`. */
export interface ChangeStatusResultDto {
  listingId: string;
  status: ListingStatus;
}
