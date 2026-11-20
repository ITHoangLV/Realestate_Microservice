import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { createUuidParamPipe } from '../../common/errors/uuid-param.pipe';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { ApiEnvelope } from '../../common/response/api-envelope.decorator';
import { ListingDto } from '../dto/listing.dto';
import { RejectListingDto } from '../dto/reject-listing.dto';
import { ListingReviewService } from '../services/listing-review.service';

/**
 * Duyệt tin: /api/v1/admin/listings (`RE.LISTING/API_Spec.md §1`, route 9–10). Chỉ ADMIN (`@Roles`);
 * gateway cũng chặn thô `/api/v1/admin/*`.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/listings')
export class ListingsAdminController {
  constructor(private readonly reviews: ListingReviewService) {}

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Duyệt tin đang chờ duyệt' })
  @ApiEnvelope(ListingDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'FORBIDDEN_ROLE' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'LISTING_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'LISTING_ALREADY_REVIEWED' })
  approve(
    @CurrentUser('sub') adminId: string,
    @Param('id', createUuidParamPipe('id')) id: string,
  ): Promise<ListingDto> {
    return this.reviews.approve(adminId, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Từ chối tin đang chờ duyệt (lý do bắt buộc)' })
  @ApiEnvelope(ListingDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'FORBIDDEN_ROLE' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'LISTING_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'LISTING_ALREADY_REVIEWED' })
  reject(
    @CurrentUser('sub') adminId: string,
    @Param('id', createUuidParamPipe('id')) id: string,
    @Body() dto: RejectListingDto,
  ): Promise<ListingDto> {
    return this.reviews.reject(adminId, id, dto.reason);
  }
}
