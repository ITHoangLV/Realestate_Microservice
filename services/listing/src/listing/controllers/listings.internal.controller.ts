import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { createUuidParamPipe } from '../../common/errors/uuid-param.pipe';
import {
  ChangeStatusDto,
  ChangeStatusResultDto,
  HoldListingDto,
  HoldResultDto,
  ListingSnapshotDto,
} from '../dto/internal-listing.dto';
import { ListingHoldService } from '../services/listing-hold.service';
import { ListingQueryService } from '../services/listing-query.service';

/**
 * API NỘI BỘ của listing (/internal/listings/...): chỉ rental gọi (S1, `architecture.md §7.1`), KHÔNG gắn
 * prefix /api/v1, không có trong Swagger công khai, gateway trả 404 cho /internal/* từ bên ngoài.
 * Hợp đồng: contracts/openapi/listing-internal.v1.yaml. Thiết kế: `RE.LISTING/API_Spec.md §2`.
 *
 * @Public(): tin mạng Docker (hạn chế đã biết, `security-policy.md §6`).
 */
@ApiExcludeController()
@Public()
@Controller('internal/listings')
export class ListingsInternalController {
  constructor(
    private readonly queries: ListingQueryService,
    private readonly holds: ListingHoldService,
  ) {}

  /** (a) Bản chụp tin cho rental tạo đơn. Tin không có hoặc đã xóa → 404. */
  @Get(':id')
  snapshot(@Param('id', createUuidParamPipe('id')) id: string): Promise<ListingSnapshotDto> {
    return this.queries.snapshot(id);
  }

  /** (b) Giữ chỗ nguyên tử (BR-05, BR-06). 200 cả khi gọi lại cùng `depositId`; 409 `LISTING_NOT_AVAILABLE`. */
  @Post(':id/holds')
  @HttpCode(200)
  hold(
    @Param('id', createUuidParamPipe('id')) id: string,
    @Body() dto: HoldListingDto,
  ): Promise<HoldResultDto> {
    return this.holds.hold(id, dto);
  }

  /** (c) Đổi trạng thái theo đơn (bảng §2.2). Idempotent; sai cặp hoặc tin của đơn khác → 409. */
  @Put(':id/status')
  changeStatus(
    @Param('id', createUuidParamPipe('id')) id: string,
    @Body() dto: ChangeStatusDto,
  ): Promise<ChangeStatusResultDto> {
    return this.holds.changeStatus(id, dto);
  }
}
