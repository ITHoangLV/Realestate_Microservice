import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayOS } from '@payos/node';
import { PinoLogger } from 'nestjs-pino';
import { EnvVars } from '../config/env.validation';
import { PayosClient, PAYOS_CLIENT_CONFIG, PAYOS_PAYMENT_REQUESTS } from './clients/payos.client';
import type { PayosClientConfig, PayosPaymentRequests } from './clients/payos.client';
import { PaymentOrdersInternalController } from './controllers/payment-orders.internal.controller';
import { PaymentOrder } from './entities/payment-order.entity';
import { PaymentOrderService } from './services/payment-order.service';

/**
 * Nghiệp vụ payment (`RE.PAYMENT`). T3.1: payment order + payOS. Webhook (T3.4), ví và payout (T3.6) thêm sau.
 * Chỉ nạp khi có DB (`isPaymentEnabled`); khóa payOS bắt buộc lúc khởi động (`payment.env.ts`).
 */
@Module({
  imports: [TypeOrmModule.forFeature([PaymentOrder])],
  controllers: [PaymentOrdersInternalController],
  providers: [
    PaymentOrderService,
    {
      // SDK payOS: timeout PAYOS_TIMEOUT_MS cho mỗi lần gọi; retry mặc định 2 (chỉ hủy dùng, tạo link tự đặt 0);
      // tắt log của SDK (ở mức debug nó ghi chi tiết request), payment tự log lỗi đã lọc
      provide: PAYOS_PAYMENT_REQUESTS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>): PayosPaymentRequests =>
        new PayOS({
          clientId: config.get('PAYOS_CLIENT_ID', { infer: true }),
          apiKey: config.get('PAYOS_API_KEY', { infer: true }),
          checksumKey: config.get('PAYOS_CHECKSUM_KEY', { infer: true }),
          timeout: config.get('PAYOS_TIMEOUT_MS', { infer: true }),
          maxRetries: 2,
          logLevel: 'off',
        }).paymentRequests,
    },
    {
      provide: PAYOS_CLIENT_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>): PayosClientConfig => ({
        returnUrl: config.get('PAYOS_RETURN_URL', { infer: true }),
        cancelUrl: config.get('PAYOS_CANCEL_URL', { infer: true }),
      }),
    },
    {
      provide: PayosClient,
      inject: [PAYOS_PAYMENT_REQUESTS, PAYOS_CLIENT_CONFIG, PinoLogger],
      useFactory: (requests: PayosPaymentRequests, cfg: PayosClientConfig, logger: PinoLogger) =>
        new PayosClient(requests, cfg, logger),
    },
  ],
})
export class PaymentModule {}
