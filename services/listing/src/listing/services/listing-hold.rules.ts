import { ListingStatus, TargetStatus } from '../entities/listing.enums';

/**
 * Bảng chuyển trạng thái BĐS theo đơn đặt cọc (`RE.LISTING/API_Spec.md §2.2`). Chỉ bốn cặp này hợp lệ,
 * điều kiện chung `held_by_deposit_id = depositId`.
 */
export const STATUS_TRANSITIONS: ReadonlyArray<{ from: ListingStatus; to: TargetStatus }> = [
  { from: 'HELD', to: 'AVAILABLE' }, // hết hạn, bù trừ
  { from: 'HELD', to: 'DEPOSITED' }, // đơn PAID
  { from: 'DEPOSITED', to: 'RENTED' }, // đơn RELEASED
  { from: 'DEPOSITED', to: 'AVAILABLE' }, // đơn REFUNDED
];

/** Các trạng thái nguồn hợp lệ của một đích (dùng cho `status = ANY($n)` trong câu `UPDATE`). */
export function sourcesFor(target: TargetStatus): ListingStatus[] {
  return STATUS_TRANSITIONS.filter((t) => t.to === target).map((t) => t.from);
}

export function isTransitionAllowed(from: ListingStatus, to: TargetStatus): boolean {
  return STATUS_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/** Trạng thái tối thiểu của tin để quyết định khi `UPDATE` không khớp dòng nào. */
export interface HoldState {
  status: ListingStatus;
  heldByDepositId: string | null;
}

/**
 * `UPDATE ... WHERE status = <nguồn> AND held_by_deposit_id = $depositId` không khớp dòng nào mà tin
 * còn tồn tại: coi như đã làm rồi (`IDEMPOTENT` → `200`) hay xung đột (`CONFLICT` → `409`)? (§2.2, chốt 2026-11-20)
 *
 * - Đích `AVAILABLE`: tin đã `AVAILABLE` → `IDEMPOTENT` với MỌI `depositId`. Về `AVAILABLE` đã xóa
 *   `held_by_deposit_id` nên không còn kiểm được "cùng đơn"; rental retry bù trừ vẫn phải nhận `200`.
 * - Đích `DEPOSITED`, `RENTED`: tin đã ở đích VÀ `held_by_deposit_id = depositId` → `IDEMPOTENT`.
 * - Còn lại (tin thuộc đơn khác, cặp ngoài bảng, tin `HIDDEN`): `CONFLICT`.
 */
export function decideWhenNoMatch(
  current: HoldState,
  target: TargetStatus,
  depositId: string,
): 'IDEMPOTENT' | 'CONFLICT' {
  if (target === 'AVAILABLE') return current.status === 'AVAILABLE' ? 'IDEMPOTENT' : 'CONFLICT';
  return current.status === target && current.heldByDepositId === depositId
    ? 'IDEMPOTENT'
    : 'CONFLICT';
}
