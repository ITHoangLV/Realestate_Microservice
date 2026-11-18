import type { NextFunction, Request, Response } from 'express';
import { InternalBlockMiddleware } from './internal-block.middleware';

function run(method: string, url: string, headers: Record<string, string> = {}) {
  const req = { method, url, originalUrl: url, headers } as unknown as Request;
  const res = {
    headersSent: false,
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as unknown as NextFunction;
  new InternalBlockMiddleware().use(req, res, next);
  return { res, next: next as unknown as jest.Mock };
}

describe('InternalBlockMiddleware — /internal/* trả 404 cho mọi request từ ngoài', () => {
  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])(
    '%s /internal/listings/x -> 404 GATEWAY_ROUTE_NOT_FOUND, không đi tiếp',
    (method) => {
      const { res, next } = run(method, '/internal/listings/x');
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: 'GATEWAY_ROUTE_NOT_FOUND', message: expect.any(String) },
        meta: { correlationId: expect.any(String), timestamp: expect.any(String) },
      });
    },
  );

  it.each([
    '/internal',
    '/internal/',
    '/internal/rooms/1?x=1',
    '/INTERNAL/rooms/1',
    '/Internal/payment-orders',
    '/internal?a=b',
    '/internal#frag',
  ])('chặn %s (không phân biệt hoa thường, kèm query)', (url) => {
    const { res, next } = run('GET', url);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it.each([
    '/api/v1/listings',
    '/health',
    '/internals/x',
    '/internal-api/x',
    '/api/v1/internal/x', // không thuộc /internal/*: bảng định tuyến sẽ trả 404 ở bước resolve
    '/ws',
    '/',
  ])('cho đi tiếp %s', (url) => {
    const { res, next } = run('GET', url);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('thông điệp lỗi không nhắc đường dẫn, địa chỉ hay service nội bộ', () => {
    const { res } = run('GET', '/internal/payment-orders/secret-id');
    const body = JSON.stringify((res.json as jest.Mock).mock.calls[0][0]);
    expect(body).not.toContain('secret-id');
    expect(body).not.toContain('payment');
  });

  it('giữ correlation ID do client gửi (X-Request-ID) trong meta', () => {
    const { res } = run('GET', '/internal/x', { 'x-request-id': 'abc-123' });
    expect((res.json as jest.Mock).mock.calls[0][0].meta.correlationId).toBe('abc-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'abc-123');
  });
});
