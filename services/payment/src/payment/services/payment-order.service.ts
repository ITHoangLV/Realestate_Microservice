import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayosClient } from '../clients/payos.client';
import type {
  CancelledOrderView,
  CreatedOrderView,
  CreateOrderInput,
  PaymentOrderView,
} from '../dto/payment-order.dto';
import { PaymentOrder } from '../entities/payment-order.entity';
import {
  isUniqueViolation,
  orderAlreadyPaid,
  orderCancelled,
  orderExpired,
  orderNotFound,
  providerUnavailable,
} from '../errors/payment.errors';

/** Ràng buộc một order mỗi đơn (migration `CreatePaymentTables`). */
const DEPOSIT_UNIQUE = 'uq_payment_orders_deposit';

/** `INSERT` cấp `orderCode` từ sequence trong cùng câu (RE.PAYMENT §6). */
const INSERT_ORDER = `
  INSERT INTO payment_orders (deposit_id, tenant_id, owner_id, listing_title, amount_vnd, payos_order_code, expires_at)
  VALUES ($1, $2, $3, $4, $5, nextval('payos_order_code_seq'), $6)
  RETURNING id, payos_order_code`;

export interface CreateResult {
  /** `true` → 201; `false` → 200 (gọi lại, trả order cũ). */
  created: boolean;
  view: CreatedOrderView;
}

/**
 * Payment order (`RE.PAYMENT/API_Spec.md §2`, `Processing_Flow §1, §3`).
 *
 * Idempotent theo `depositId` (`payment_orders.deposit_id` UNIQUE), nên rental được gọi lại kể cả lệnh POST.
 * Không giữ transaction khi gọi payOS: order được INSERT (đã commit) **trước** khi gọi, để nếu payment chết sau
 * khi payOS tạo link thì webhook vẫn tìm được `orderCode`. Đổi trạng thái là một câu `UPDATE ... WHERE
 * status = 'PENDING'`: hủy và webhook đua nhau thì Postgres chọn một bên thắng.
 */
@Injectable()
export class PaymentOrderService {
  constructor(
    @InjectRepository(PaymentOrder) private readonly orders: Repository<PaymentOrder>,
    @Inject(PayosClient) private readonly payos: PayosClient,
  ) {}

  /** Bảng §2a. Truy vấn: tạo mới 3 (SELECT, INSERT, UPDATE link); gọi lại 1. */
  async create(input: CreateOrderInput): Promise<CreateResult> {
    if (input.expiresAt.getTime() <= Date.now()) throw orderExpired(); // dòng 1

    const existing = await this.orders.findOneBy({ depositId: input.depositId });
    if (existing) return { created: false, view: this.reuse(existing) }; // dòng 2–4

    let id: string;
    let orderCode: number;
    try {
      const [row] = (await this.orders.query(INSERT_ORDER, [
        input.depositId,
        input.tenantId,
        input.ownerId,
        input.listingTitle,
        input.amountVnd,
        input.expiresAt,
      ])) as Array<{ id: string; payos_order_code: string }>;
      id = row.id;
      orderCode = Number(row.payos_order_code);
    } catch (err) {
      // Hai lệnh tạo cùng đơn chạy song song: bên thua đọc lại order của bên thắng
      if (!isUniqueViolation(err, DEPOSIT_UNIQUE)) throw err;
      const winner = await this.orders.findOneBy({ depositId: input.depositId });
      if (!winner) throw err;
      return { created: false, view: this.reuse(winner) };
    }

    // Dòng 5–7: ngoài transaction. payOS lỗi -> 503, order giữ PENDING không link (§7.3, job rental xử lý)
    const link = await this.payos.createLink({
      orderCode,
      amountVnd: input.amountVnd,
      listingTitle: input.listingTitle,
      expiresAt: input.expiresAt,
    });
    await this.orders.update(
      { id },
      {
        payosPaymentLinkId: link.paymentLinkId,
        checkoutUrl: link.checkoutUrl,
        qrCode: link.qrCode,
      },
    );
    return {
      created: true,
      view: {
        orderId: id,
        payosOrderCode: orderCode,
        checkoutUrl: link.checkoutUrl,
        qrCode: link.qrCode,
        expiresAt: input.expiresAt.toISOString(),
      },
    };
  }

  /**
   * Bảng §2b (BR-09). payOS hủy **trước**, rồi `UPDATE ... WHERE status='PENDING'`. Order chưa có link (lần tạo
   * link trước lỗi) thì không gọi payOS: link chưa từng được tạo thành công, và link payOS tự hết hạn đúng
   * `expiresAt`. Truy vấn: 2 (SELECT, UPDATE), thêm 1 SELECT khi UPDATE 0 dòng.
   */
  async cancel(depositId: string): Promise<CancelledOrderView> {
    const order = await this.orders.findOneBy({ depositId });
    if (!order) throw orderNotFound();
    if (order.status === 'CANCELLED') return cancelledView(order);
    if (order.status === 'PAID') throw orderAlreadyPaid();

    if (order.payosPaymentLinkId) await this.payos.cancelLink(order.payosOrderCode);

    const { affected } = await this.orders.update(
      { id: order.id, status: 'PENDING' },
      { status: 'CANCELLED', cancelledAt: () => 'now()' },
    );
    if (affected) return cancelledView(order);

    // 0 dòng: bên khác vừa đổi trạng thái. Webhook thắng -> PAID -> 409 (rental không EXPIRED, chờ payment.deposited)
    const now = await this.orders.findOneBy({ id: order.id });
    if (now?.status === 'CANCELLED') return cancelledView(order);
    throw orderAlreadyPaid();
  }

  /**
   * Bảng §2c: chỉ đọc DB, 1 truy vấn. Phần "hỏi payOS khi `PENDING` chưa có link" của thiết kế chưa làm: chờ chốt
   * cách dùng kết quả (`implementation/van-de-can-quyet-dinh.md` C22).
   */
  async get(depositId: string): Promise<PaymentOrderView> {
    const order = await this.orders.findOneBy({ depositId });
    if (!order) throw orderNotFound();
    return {
      orderId: order.id,
      depositId: order.depositId,
      status: order.status,
      amountVnd: order.amountVnd,
      payosOrderCode: order.payosOrderCode,
      checkoutUrl: order.checkoutUrl,
      expiresAt: order.expiresAt.toISOString(),
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    };
  }

  /** Dòng 2–4 khi đã có order cho đơn. `PENDING` chưa có link: 503 như lần đầu (C23). */
  private reuse(order: PaymentOrder): CreatedOrderView {
    if (order.status === 'PAID') throw orderAlreadyPaid();
    if (order.status === 'CANCELLED') throw orderCancelled();
    if (!order.checkoutUrl || !order.qrCode) throw providerUnavailable();
    return {
      orderId: order.id,
      payosOrderCode: order.payosOrderCode,
      checkoutUrl: order.checkoutUrl,
      qrCode: order.qrCode,
      expiresAt: order.expiresAt.toISOString(),
    };
  }
}

const cancelledView = (order: PaymentOrder): CancelledOrderView => ({
  orderId: order.id,
  depositId: order.depositId,
  status: 'CANCELLED',
});
