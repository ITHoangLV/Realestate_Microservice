import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintToNumber } from '../../database/transformers';

/** Trạng thái payment order (`RE.PAYMENT/API_Spec.md §7.1`, chốt 2026-11-16). */
export const PAYMENT_ORDER_STATUSES = ['PENDING', 'PAID', 'CANCELLED'] as const;
export type PaymentOrderStatus = (typeof PAYMENT_ORDER_STATUSES)[number];

/**
 * Một lệnh thanh toán cho một đơn đặt cọc (`deposit_id` UNIQUE). DDL ở migration
 * `1734000000000-create-payment-tables.ts` (`RE.PAYMENT/API_Spec.md §6`).
 *
 * Entity chỉ khai báo cột. Đổi trạng thái luôn là một câu `UPDATE ... WHERE status = 'PENDING'`
 * (hủy và webhook đua nhau, Postgres khóa dòng nên chỉ một bên thắng, `Processing_Flow §3`).
 */
@Entity('payment_orders')
export class PaymentOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Đơn bên rental (không khóa ngoại, ADR-0005). */
  @Column({ name: 'deposit_id', type: 'uuid' })
  depositId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @Column({ name: 'listing_title', type: 'varchar', length: 200, nullable: true })
  listingTitle!: string | null;

  /** Tiền cọc VND, bản chụp của rental (BR-04). */
  @Column({ name: 'amount_vnd', type: 'bigint', transformer: bigintToNumber })
  amountVnd!: number;

  /** `orderCode` gửi payOS, cấp từ `payos_order_code_seq`. */
  @Column({ name: 'payos_order_code', type: 'bigint', transformer: bigintToNumber })
  payosOrderCode!: number;

  @Column({ name: 'payos_payment_link_id', type: 'varchar', length: 100, nullable: true })
  payosPaymentLinkId!: string | null;

  /** `null` khi tạo link payOS chưa thành công. */
  @Column({ name: 'checkout_url', type: 'text', nullable: true })
  checkoutUrl!: string | null;

  @Column({ name: 'qr_code', type: 'text', nullable: true })
  qrCode!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status!: PaymentOrderStatus;

  /** Mã giao dịch payOS khi đã thanh toán (T3.4). */
  @Column({ name: 'payos_reference', type: 'varchar', length: 100, nullable: true })
  payosReference!: string | null;

  /** Bằng `expires_at` của đơn; link payOS hết hạn đúng lúc này (BR-07). */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
