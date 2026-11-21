import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { createUuidParamPipe } from '../../common/errors/uuid-param.pipe';
import {
  CancelledOrderView,
  CreatedOrderView,
  CreatePaymentOrderDto,
  PaymentOrderView,
} from '../dto/payment-order.dto';
import { PaymentOrderService } from '../services/payment-order.service';

/**
 * API NỘI BỘ của payment (/internal/payment-orders/...): chỉ rental gọi (S2, `architecture.md §7.1`), KHÔNG gắn
 * prefix /api/v1, không có trong Swagger công khai, gateway trả 404 cho /internal/* từ bên ngoài.
 * Hợp đồng: contracts/openapi/payment-internal.v1.yaml. Thiết kế: `RE.PAYMENT/API_Spec.md §2`.
 *
 * @Public(): tin mạng Docker (hạn chế đã biết, `security-policy.md §6`), như listing.
 */
@ApiExcludeController()
@Public()
@Controller('internal/payment-orders')
export class PaymentOrdersInternalController {
  constructor(private readonly orders: PaymentOrderService) {}

  /** (a) Tạo order + link payOS. `201` tạo mới; `200` đơn đã có order `PENDING` có link (gọi lại). */
  @Post()
  async create(
    @Body() dto: CreatePaymentOrderDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreatedOrderView> {
    const { created, view } = await this.orders.create({
      ...dto,
      expiresAt: new Date(dto.expiresAt),
    });
    res.status(created ? 201 : 200);
    return view;
  }

  /** (c) Tra cứu trạng thái order của đơn (đối soát saga). */
  @Get(':depositId')
  get(
    @Param('depositId', createUuidParamPipe('depositId')) depositId: string,
  ): Promise<PaymentOrderView> {
    return this.orders.get(depositId);
  }

  /** (b) Hủy link payOS rồi `CANCELLED` (BR-09). Idempotent; webhook thắng trước → `409`. */
  @Post(':depositId/cancel')
  @HttpCode(200)
  cancel(
    @Param('depositId', createUuidParamPipe('depositId')) depositId: string,
  ): Promise<CancelledOrderView> {
    return this.orders.cancel(depositId);
  }
}
