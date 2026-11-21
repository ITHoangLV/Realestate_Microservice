import { QueryFailedError } from 'typeorm';
import { PaymentError } from '../errors/payment.errors';
import type { PaymentOrder } from '../entities/payment-order.entity';
import { PaymentOrderService } from './payment-order.service';

const DEPOSIT = '3f9a1c2e-8b4d-4e6f-a1b2-c3d4e5f60718';
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000);
const DTO = {
  depositId: DEPOSIT,
  tenantId: '7c1e2d34-5b6a-4f70-9e81-2a3b4c5d6e7f',
  ownerId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  listingTitle: 'Phòng 25m2',
  amountVnd: 3_000_000,
  expiresAt: inMinutes(10),
};
const LINK = { paymentLinkId: 'link-1', checkoutUrl: 'https://pay.payos.vn/web/l', qrCode: 'qr' };

const order = (over: Partial<PaymentOrder> = {}): PaymentOrder =>
  ({
    id: 'c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f',
    depositId: DEPOSIT,
    tenantId: DTO.tenantId,
    ownerId: DTO.ownerId,
    listingTitle: DTO.listingTitle,
    amountVnd: DTO.amountVnd,
    payosOrderCode: 100001,
    payosPaymentLinkId: 'link-1',
    checkoutUrl: LINK.checkoutUrl,
    qrCode: LINK.qrCode,
    status: 'PENDING',
    payosReference: null,
    expiresAt: DTO.expiresAt,
    paidAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as PaymentOrder;

function setup(existing: PaymentOrder | null = null) {
  const calls: string[] = [];
  const orders = {
    findOneBy: jest.fn().mockResolvedValue(existing),
    query: jest.fn(async () => {
      calls.push('insert');
      return [{ id: 'new-order-id', payos_order_code: '100002' }];
    }),
    update: jest.fn(async (_where: unknown, set: Record<string, unknown>) => {
      calls.push(`update:${String(set.status ?? 'link')}`);
      return { affected: 1 };
    }),
  };
  const payos = {
    createLink: jest.fn(async () => {
      calls.push('payos.create');
      return LINK;
    }),
    cancelLink: jest.fn(async () => {
      calls.push('payos.cancel');
    }),
  };
  const service = new PaymentOrderService(orders as never, payos as never);
  return { service, orders, payos, calls };
}

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => 'khong-loi',
    (e: { code?: string }) => e.code,
  );

describe('PaymentOrderService.create (API_Spec §2a)', () => {
  it('dòng 1: expiresAt đã qua -> 409 PAYMENT_ORDER_EXPIRED, không chạm DB, không gọi payOS', async () => {
    const { service, orders, payos } = setup();
    expect(await codeOf(service.create({ ...DTO, expiresAt: inMinutes(-1) }))).toBe(
      PaymentError.ORDER_EXPIRED,
    );
    expect(orders.findOneBy).not.toHaveBeenCalled();
    expect(payos.createLink).not.toHaveBeenCalled();
  });

  it('dòng 5, 7: chưa có -> INSERT (nextval) TRƯỚC, rồi payOS, rồi lưu link -> created', async () => {
    const { service, orders, payos, calls } = setup();
    const result = await service.create(DTO);

    expect(calls).toEqual(['insert', 'payos.create', 'update:link']);
    const [sql, params] = orders.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/nextval\('payos_order_code_seq'\)/);
    expect(params).toEqual([
      DTO.depositId,
      DTO.tenantId,
      DTO.ownerId,
      DTO.listingTitle,
      DTO.amountVnd,
      DTO.expiresAt,
    ]);
    expect(payos.createLink).toHaveBeenCalledWith({
      orderCode: 100002,
      amountVnd: DTO.amountVnd,
      listingTitle: DTO.listingTitle,
      expiresAt: DTO.expiresAt,
    });
    expect(orders.update).toHaveBeenCalledWith(
      { id: 'new-order-id' },
      { payosPaymentLinkId: 'link-1', checkoutUrl: LINK.checkoutUrl, qrCode: LINK.qrCode },
    );
    expect(result).toEqual({
      created: true,
      view: {
        orderId: 'new-order-id',
        payosOrderCode: 100002,
        checkoutUrl: LINK.checkoutUrl,
        qrCode: LINK.qrCode,
        expiresAt: DTO.expiresAt.toISOString(),
      },
    });
  });

  it('dòng 6 (test 8): payOS lỗi -> ném 503, order đã có trong DB trước khi gọi, không lưu link', async () => {
    const { service, payos, orders, calls } = setup();
    payos.createLink.mockImplementation(async () => {
      calls.push('payos.create');
      throw Object.assign(new Error('x'), { code: PaymentError.PROVIDER_UNAVAILABLE });
    });
    expect(await codeOf(service.create(DTO))).toBe(PaymentError.PROVIDER_UNAVAILABLE);
    expect(calls).toEqual(['insert', 'payos.create']);
    expect(orders.update).not.toHaveBeenCalled();
  });

  it('dòng 2 (test 7): đã có PENDING có link -> trả order cũ, KHÔNG gọi payOS, không INSERT', async () => {
    const { service, orders, payos } = setup(order());
    const result = await service.create(DTO);
    expect(result.created).toBe(false);
    expect(result.view.orderId).toBe(order().id);
    expect(orders.query).not.toHaveBeenCalled();
    expect(payos.createLink).not.toHaveBeenCalled();
  });

  it.each([
    ['PAID', PaymentError.ORDER_ALREADY_PAID],
    ['CANCELLED', PaymentError.ORDER_CANCELLED],
  ])('dòng 3, 4: đã có %s -> 409 %s', async (status, code) => {
    const { service, payos } = setup(order({ status: status as PaymentOrder['status'] }));
    expect(await codeOf(service.create(DTO))).toBe(code);
    expect(payos.createLink).not.toHaveBeenCalled();
  });

  it('C23: đã có PENDING CHƯA có link (lần trước payOS lỗi) -> 503, không gọi lại payOS', async () => {
    const { service, payos } = setup(
      order({ payosPaymentLinkId: null, checkoutUrl: null, qrCode: null }),
    );
    expect(await codeOf(service.create(DTO))).toBe(PaymentError.PROVIDER_UNAVAILABLE);
    expect(payos.createLink).not.toHaveBeenCalled();
  });

  it('đua: INSERT trùng depositId (23505 uq_payment_orders_deposit) -> đọc lại, xử lý như đã có', async () => {
    const { service, orders, payos } = setup();
    orders.query.mockRejectedValueOnce(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('dup'), {
          code: '23505',
          constraint: 'uq_payment_orders_deposit',
        }),
      ),
    );
    orders.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce(order());
    const result = await service.create(DTO);
    expect(result.created).toBe(false);
    expect(payos.createLink).not.toHaveBeenCalled();
  });
});

describe('PaymentOrderService.cancel (API_Spec §2b)', () => {
  it('test 9: PENDING có link -> payOS cancel TRƯỚC, rồi UPDATE ... WHERE status = PENDING', async () => {
    const { service, orders, payos, calls } = setup(order());
    const view = await service.cancel(DEPOSIT);

    expect(calls).toEqual(['payos.cancel', 'update:CANCELLED']);
    expect(payos.cancelLink).toHaveBeenCalledWith(100001);
    const [where, set] = orders.update.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(where).toEqual({ id: order().id, status: 'PENDING' });
    expect(set.status).toBe('CANCELLED');
    expect(typeof set.cancelledAt).toBe('function');
    expect(view).toEqual({ orderId: order().id, depositId: DEPOSIT, status: 'CANCELLED' });
  });

  it('PENDING chưa có link -> không gọi payOS (link chưa từng tạo), vẫn CANCELLED', async () => {
    const { service, payos, calls } = setup(order({ payosPaymentLinkId: null }));
    await service.cancel(DEPOSIT);
    expect(payos.cancelLink).not.toHaveBeenCalled();
    expect(calls).toEqual(['update:CANCELLED']);
  });

  it('test 10: UPDATE 0 dòng vì webhook vừa thắng (đọc lại thấy PAID) -> 409 PAYMENT_ORDER_ALREADY_PAID', async () => {
    const { service, orders } = setup(order());
    orders.update.mockResolvedValueOnce({ affected: 0 });
    orders.findOneBy
      .mockResolvedValueOnce(order())
      .mockResolvedValueOnce(order({ status: 'PAID' }));
    expect(await codeOf(service.cancel(DEPOSIT))).toBe(PaymentError.ORDER_ALREADY_PAID);
  });

  it('UPDATE 0 dòng vì lệnh hủy khác vừa xong (đọc lại thấy CANCELLED) -> 200', async () => {
    const { service, orders } = setup(order());
    orders.update.mockResolvedValueOnce({ affected: 0 });
    orders.findOneBy
      .mockResolvedValueOnce(order())
      .mockResolvedValueOnce(order({ status: 'CANCELLED' }));
    await expect(service.cancel(DEPOSIT)).resolves.toMatchObject({ status: 'CANCELLED' });
  });

  it('đã CANCELLED -> 200, không gọi payOS, không UPDATE (idempotent)', async () => {
    const { service, orders, payos } = setup(order({ status: 'CANCELLED' }));
    await expect(service.cancel(DEPOSIT)).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(payos.cancelLink).not.toHaveBeenCalled();
    expect(orders.update).not.toHaveBeenCalled();
  });

  it('PAID -> 409; không có -> 404', async () => {
    expect(await codeOf(setup(order({ status: 'PAID' })).service.cancel(DEPOSIT))).toBe(
      PaymentError.ORDER_ALREADY_PAID,
    );
    expect(await codeOf(setup(null).service.cancel(DEPOSIT))).toBe(PaymentError.ORDER_NOT_FOUND);
  });

  it('payOS lỗi -> 503, giữ PENDING (không UPDATE)', async () => {
    const { service, orders, payos } = setup(order());
    payos.cancelLink.mockRejectedValue(
      Object.assign(new Error('x'), { code: PaymentError.PROVIDER_UNAVAILABLE }),
    );
    expect(await codeOf(service.cancel(DEPOSIT))).toBe(PaymentError.PROVIDER_UNAVAILABLE);
    expect(orders.update).not.toHaveBeenCalled();
  });
});

describe('PaymentOrderService.get (API_Spec §2c)', () => {
  it('trả đúng các trường của PaymentOrder (hợp đồng), ngày dạng ISO', async () => {
    const paidAt = new Date('2026-11-20T08:05:00Z');
    const { service } = setup(order({ status: 'PAID', paidAt }));
    expect(await service.get(DEPOSIT)).toEqual({
      orderId: order().id,
      depositId: DEPOSIT,
      status: 'PAID',
      amountVnd: DTO.amountVnd,
      payosOrderCode: 100001,
      checkoutUrl: LINK.checkoutUrl,
      expiresAt: DTO.expiresAt.toISOString(),
      paidAt: paidAt.toISOString(),
    });
  });

  it('không có -> 404', async () => {
    expect(await codeOf(setup(null).service.get(DEPOSIT))).toBe(PaymentError.ORDER_NOT_FOUND);
  });
});
