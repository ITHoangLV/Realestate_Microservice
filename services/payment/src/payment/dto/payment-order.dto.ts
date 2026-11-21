import { IsInt, IsISO8601, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import type { PaymentOrderStatus } from '../entities/payment-order.entity';

/**
 * DTO của API nội bộ `/internal/payment-orders*` (`contracts/openapi/payment-internal.v1.yaml`). Controller nội bộ
 * không có trong Swagger công khai nên không gắn `@ApiProperty`. Hợp đồng `additionalProperties: false`:
 * ValidationPipe toàn cục đã `forbidNonWhitelisted`.
 */

/** Body của `POST /internal/payment-orders` (`CreateOrderRequest`). Số tiền là bản chụp của rental (BR-04). */
export class CreatePaymentOrderDto {
  @IsUUID(undefined, { message: 'depositId phải là UUID' })
  depositId!: string;

  @IsUUID(undefined, { message: 'tenantId phải là UUID' })
  tenantId!: string;

  @IsUUID(undefined, { message: 'ownerId phải là UUID' })
  ownerId!: string;

  @IsString()
  @Length(1, 200)
  listingTitle!: string;

  /** VND, số nguyên dương. Trần 2^53 - 1 để không mất chính xác khi đọc `bigint` về number. */
  @IsInt({ message: 'amountVnd phải là số nguyên' })
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountVnd!: number;

  /** date-time có múi giờ, bằng `expires_at` của đơn; link payOS hết hạn đúng lúc này (BR-07). */
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, { message: 'expiresAt phải có múi giờ (Z hoặc ±hh:mm)' })
  expiresAt!: string;
}

/** Đầu vào của `PaymentOrderService.create` (controller đổi `expiresAt` sang Date). */
export interface CreateOrderInput {
  depositId: string;
  tenantId: string;
  ownerId: string;
  listingTitle: string;
  amountVnd: number;
  expiresAt: Date;
}

/** `data` của `CreateOrderResponse` (201 tạo mới, 200 gọi lại). */
export interface CreatedOrderView {
  orderId: string;
  payosOrderCode: number;
  checkoutUrl: string;
  qrCode: string;
  expiresAt: string;
}

/** `PaymentOrder` của hợp đồng (`GET /internal/payment-orders/:depositId`). */
export interface PaymentOrderView {
  orderId: string;
  depositId: string;
  status: PaymentOrderStatus;
  amountVnd: number;
  payosOrderCode: number;
  checkoutUrl: string | null;
  expiresAt: string;
  paidAt: string | null;
}

/** `data` của `CancelOrderResponse`. */
export interface CancelledOrderView {
  orderId: string;
  depositId: string;
  status: 'CANCELLED';
}
