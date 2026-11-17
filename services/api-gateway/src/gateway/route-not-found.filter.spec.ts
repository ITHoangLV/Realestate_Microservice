import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/errors/app.exception';
import { RouteNotFoundFilter } from './route-not-found.filter';

function run(exception: unknown) {
  const reply = jest.fn();
  const filter = new RouteNotFoundFilter(
    { httpAdapter: { reply } } as unknown as HttpAdapterHost,
    { setContext: jest.fn(), error: jest.fn() } as unknown as PinoLogger,
  );
  const req = { headers: { 'x-request-id': 'nf-1' } };
  const res = { headersSent: false, setHeader: jest.fn() };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  filter.catch(exception, host);
  return reply.mock.calls[0] as [unknown, { error: { code: string; message: string } }, number];
}

describe('RouteNotFoundFilter', () => {
  it('NotFoundException của Nest ("Cannot GET /foo") -> 404 GATEWAY_ROUTE_NOT_FOUND, không lộ đường dẫn', () => {
    const [, body, status] = run(new NotFoundException('Cannot GET /foo/bi-mat'));
    expect(status).toBe(404);
    expect(body.error.code).toBe('GATEWAY_ROUTE_NOT_FOUND');
    expect(JSON.stringify(body)).not.toContain('bi-mat');
    expect(body).toMatchObject({ meta: { correlationId: 'nf-1' } });
  });

  it('chỉ bắt NotFoundException: Reflect metadata của @Catch khai báo đúng loại', () => {
    const types = Reflect.getMetadata(
      '__filterCatchExceptions__',
      RouteNotFoundFilter,
    ) as unknown[];
    expect(types).toEqual([NotFoundException]);
    // Các lỗi khác không thuộc phạm vi filter này (AllExceptionsFilter xử lý)
    expect(types).not.toContain(BadRequestException);
    expect(types).not.toContain(AppException);
  });
});
