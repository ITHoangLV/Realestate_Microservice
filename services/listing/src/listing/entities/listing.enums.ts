/**
 * Giá trị cố định của listing (`RE.LISTING/API_Spec.md §1.1, §6`; `domain-glossary.md`).
 * Khai báo một lần ở đây: DTO, entity, migration (CHECK) và service dùng chung các hằng này.
 */

/** Loại BĐS (`listings.property_type`). */
export const PROPERTY_TYPES = ['ROOM', 'APARTMENT', 'HOUSE'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Trạng thái BĐS (`listings.status`, Báo cáo Bảng 3.5). */
export const LISTING_STATUSES = ['AVAILABLE', 'HELD', 'DEPOSITED', 'RENTED', 'HIDDEN'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** Đích hợp lệ của `PUT /internal/listings/:id/status` (hợp đồng: `AVAILABLE`, `DEPOSITED`, `RENTED`). */
export const TARGET_STATUSES = ['AVAILABLE', 'DEPOSITED', 'RENTED'] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

/** Trạng thái duyệt tin (`listings.approval_status`, chốt 2026-11-16). */
export const APPROVAL_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** Tiện ích: danh mục cố định, mã lạ bị từ chối `400 VALIDATION_FAILED` (`API_Spec.md §1.1`). */
export const AMENITIES = [
  'AIR_CONDITIONER',
  'WATER_HEATER',
  'WASHING_MACHINE',
  'FRIDGE',
  'WIFI',
  'PARKING',
  'ELEVATOR',
  'PRIVATE_BATHROOM',
  'BALCONY',
  'FURNISHED',
  'PET_ALLOWED',
] as const;
export type Amenity = (typeof AMENITIES)[number];
