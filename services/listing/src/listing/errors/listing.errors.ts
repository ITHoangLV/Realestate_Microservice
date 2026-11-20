import { AppException } from '../../common/errors/app.exception';

/** Mã lỗi nghiệp vụ của listing-service (`RE.LISTING/API_Spec.md §4`). Ổn định: client dựa vào mã này. */
export const ListingError = {
  NOT_FOUND: 'LISTING_NOT_FOUND', // 404
  NOT_AVAILABLE: 'LISTING_NOT_AVAILABLE', // 409 (giữ chỗ, T2.3)
  NOT_OWNER: 'LISTING_NOT_OWNER', // 403
  HAS_ACTIVE_DEPOSIT: 'LISTING_HAS_ACTIVE_DEPOSIT', // 409
  INVALID_STATUS: 'LISTING_INVALID_STATUS', // 409
  ALREADY_REVIEWED: 'LISTING_ALREADY_REVIEWED', // 409
  IMAGE_INVALID: 'LISTING_IMAGE_INVALID', // 400
  IMAGE_LIMIT_REACHED: 'LISTING_IMAGE_LIMIT_REACHED', // 409
} as const;

export const listingNotFound = (): AppException =>
  new AppException(ListingError.NOT_FOUND, 'Không tìm thấy tin đăng', 404);

export const listingNotAvailable = (): AppException =>
  new AppException(ListingError.NOT_AVAILABLE, 'Bất động sản đang được người khác giữ chỗ', 409);

export const listingNotOwner = (): AppException =>
  new AppException(ListingError.NOT_OWNER, 'Bạn không phải chủ tin đăng này', 403);

export const listingHasActiveDeposit = (): AppException =>
  new AppException(ListingError.HAS_ACTIVE_DEPOSIT, 'Tin đang có đơn đặt cọc, không thể xóa', 409);

/** `details` (API nội bộ đổi trạng thái): `{ current, target }` như ví dụ ở `listing-internal.v1.yaml`. */
export const listingInvalidStatus = (details?: { current: string; target: string }): AppException =>
  new AppException(ListingError.INVALID_STATUS, 'Không thể chuyển trạng thái tin', 409, details);

export const listingAlreadyReviewed = (): AppException =>
  new AppException(ListingError.ALREADY_REVIEWED, 'Tin đã được duyệt hoặc từ chối', 409);

export const listingImageInvalid = (reason: string): AppException =>
  new AppException(ListingError.IMAGE_INVALID, 'Ảnh không hợp lệ hoặc vượt kích thước', 400, {
    reason,
  });

export const listingImageLimitReached = (max: number): AppException =>
  new AppException(ListingError.IMAGE_LIMIT_REACHED, `Tin đã đủ ${max} ảnh`, 409);
