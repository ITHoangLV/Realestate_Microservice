import { randomUUID } from 'node:crypto';
import type { ObjectHead } from '../../storage/storage.service';

/**
 * Luật thuần cho ảnh tin đăng (`RE.LISTING/API_Spec.md §1.2`, `Processing_Flow.md §2`).
 * Client không tự đặt key: service sinh key ở route 7, và route 8 chỉ nhận lại đúng dạng key đó.
 */

/** Đuôi file theo Content-Type; loại khác lấy phần sau `image/`. */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const KEY_NAME = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.[a-z0-9]{1,5}';

/** Key đặt cho ảnh mới: `listings/{listingId}/{uuid}.{ext}`. */
export function buildImageKey(listingId: string, contentType: string): string {
  const ext = EXTENSIONS[contentType] ?? contentType.replace(/^image\//, '');
  return `listings/${listingId}/${randomUUID()}.${ext}`;
}

/** `key` client gửi ở route 8 có đúng dạng service đã sinh cho tin này không (chặn key của tin khác, `..`). */
export function isKeyOfListing(listingId: string, key: string): boolean {
  return new RegExp(`^listings/${listingId}/${KEY_NAME}$`).test(key);
}

export interface ImageLimits {
  maxBytes: number;
  types: readonly string[];
}

export type ImageProblem = 'NOT_FOUND' | 'EMPTY' | 'TOO_LARGE' | 'TYPE_NOT_ALLOWED';

/**
 * Kiểm object đã nằm trên S3 (kết quả `HeadObject`). Trả `null` nếu hợp lệ, ngược lại mã lý do
 * (ghi vào `details.reason` của `LISTING_IMAGE_INVALID`). Presigned PUT không giới hạn kích thước,
 * nên đây là chỗ duy nhất chặn ảnh quá cỡ.
 */
export function checkUploadedImage(
  head: ObjectHead | null,
  limits: ImageLimits,
): ImageProblem | null {
  if (!head) return 'NOT_FOUND';
  if (head.contentLength <= 0) return 'EMPTY';
  if (head.contentLength > limits.maxBytes) return 'TOO_LARGE';
  const type = head.contentType?.split(';')[0].trim().toLowerCase();
  if (!type || !limits.types.includes(type)) return 'TYPE_NOT_ALLOWED';
  return null;
}
