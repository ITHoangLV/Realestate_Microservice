import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePaymentOrderDto } from './payment-order.dto';

const VALID = {
  depositId: '3f9a1c2e-8b4d-4e6f-a1b2-c3d4e5f60718',
  tenantId: '7c1e2d34-5b6a-4f70-9e81-2a3b4c5d6e7f',
  ownerId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  listingTitle: 'Phòng 25m2 gần ĐH Bách Khoa',
  amountVnd: 3000000,
  expiresAt: '2026-11-20T08:10:00Z',
};

async function fields(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CreatePaymentOrderDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property).sort();
}

describe('CreatePaymentOrderDto (CreateOrderRequest)', () => {
  it('body hợp lệ theo ví dụ của hợp đồng', async () => {
    expect(await fields(VALID)).toEqual([]);
    expect(await fields({ ...VALID, expiresAt: '2026-11-20T15:10:00+07:00' })).toEqual([]);
  });

  it('thiếu trường bắt buộc -> báo đúng trường', async () => {
    expect(await fields({})).toEqual(
      ['amountVnd', 'depositId', 'expiresAt', 'listingTitle', 'ownerId', 'tenantId'].sort(),
    );
  });

  it.each([
    ['depositId không phải UUID', { depositId: 'abc' }, 'depositId'],
    ['amountVnd = 0', { amountVnd: 0 }, 'amountVnd'],
    ['amountVnd lẻ', { amountVnd: 1.5 }, 'amountVnd'],
    ['amountVnd là chuỗi', { amountVnd: '3000000' }, 'amountVnd'],
    ['listingTitle rỗng', { listingTitle: '' }, 'listingTitle'],
    ['listingTitle > 200', { listingTitle: 'a'.repeat(201) }, 'listingTitle'],
    ['expiresAt không có múi giờ', { expiresAt: '2026-11-20T08:10:00' }, 'expiresAt'],
    ['expiresAt không phải ngày', { expiresAt: 'ngày mai' }, 'expiresAt'],
  ])('%s -> lỗi', async (_, over, field) => {
    expect(await fields({ ...VALID, ...over })).toEqual([field]);
  });

  it('trường lạ bị từ chối (hợp đồng additionalProperties: false)', async () => {
    expect(await fields({ ...VALID, status: 'PAID' })).toEqual(['status']);
  });
});
