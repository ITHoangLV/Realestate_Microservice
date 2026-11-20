import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { createUuidParamPipe } from '../../common/errors/uuid-param.pipe';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { ApiEnvelope } from '../../common/response/api-envelope.decorator';
import type { Paginated } from '../../common/response/response-meta';
import { ConfirmImageDto } from '../dto/confirm-image.dto';
import { CreateListingDto } from '../dto/create-listing.dto';
import { ListMineQuery } from '../dto/list-mine.query';
import { ListingDto, ListingImageDto } from '../dto/listing.dto';
import { UpdateListingDto } from '../dto/update-listing.dto';
import { UploadUrlDto, UploadUrlResponseDto } from '../dto/upload-url.dto';
import { ListingCommandService } from '../services/listing-command.service';
import { ListingImageService } from '../services/listing-image.service';
import { ListingQueryService } from '../services/listing-query.service';

/**
 * Sản phẩm của chủ trọ: /api/v1/listings (`RE.LISTING/API_Spec.md §1`, route 1–8, 12 và `mine`).
 *
 * Ghi, sửa, ẩn, xóa, ảnh, `mine` cần vai trò `LANDLORD` (gateway chặn thô, service chặn lại) và kiểm
 * chủ sở hữu ở service bằng `sub` của JWT (BR-03). Chỉ `GET /:id` là công khai.
 * `mine` PHẢI khai báo trước `:id`, nếu không Nest coi "mine" là một id.
 */
@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(
    private readonly commands: ListingCommandService,
    private readonly queries: ListingQueryService,
    private readonly images: ListingImageService,
  ) {}

  @Post()
  @Roles('LANDLORD')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm sản phẩm (chờ duyệt, chưa hiện ở tìm kiếm)' })
  @ApiEnvelope(ListingDto, { status: 201 })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'FORBIDDEN_ROLE' })
  create(@CurrentUser('sub') ownerId: string, @Body() dto: CreateListingDto): Promise<ListingDto> {
    return this.commands.create(ownerId, dto);
  }

  @Get('mine')
  @Roles('LANDLORD')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sản phẩm của tôi, kèm trạng thái duyệt và trạng thái BĐS' })
  @ApiEnvelope(ListingDto, { isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'FORBIDDEN_ROLE' })
  mine(
    @CurrentUser('sub') ownerId: string,
    @Query() query: ListMineQuery,
  ): Promise<Paginated<ListingDto>> {
    return this.queries.findMine(ownerId, query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Chi tiết tin đăng (chỉ tin đã duyệt, chưa xóa; tin ẩn vẫn xem được)' })
  @ApiEnvelope(ListingDto)
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'LISTING_NOT_FOUND' })
  detail(@Param('id', createUuidParamPipe('id')) id: string): Promise<ListingDto> {
    return this.queries.findPublic(id);
  }

  @Patch(':id')
  @Roles('LANDLORD')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sửa sản phẩm (sửa nội dung hiển thị thì phải duyệt lại)' })
  @ApiEnvelope(ListingDto)
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'LISTING_NOT_OWNER' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'LISTING_NOT_FOUND' })
  update(
    @CurrentUser('sub') ownerId: string,
    @Param('id', createUuidParamPipe('id')) id: string,
    @Body() dto: UpdateListingDto,
  ): Promise<ListingDto> {
    return this.commands.update(ownerId, id, dto);
  }

  @Post(':id/hide')
  @HttpCode(200)
  @Roles('LANDLORD')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ẩn tin: AVAILABLE → HIDDEN' })
  @ApiEnvelope(ListingDto)
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'LISTING_INVALID_STATUS' })
  hide(
    @CurrentUser('sub') ownerId: string,
    @Param('id', createUuidParamPipe('id')) id: string,
  ): Promise<ListingDto> {
    return this.commands.hide(ownerId, id);
  }

  @Post(':id/unhide')
  @HttpCode(200)
  @Roles('LANDLORD')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hiện lại tin: HIDDEN → AVAILABLE' })
  @ApiEnvelope(ListingDto)
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'LISTING_INVALID_STATUS' })
  unhide(
    @CurrentUser('sub') ownerId: string,
    @Param('id', createUuidParamPipe('id')) id: string,
  ): Promise<ListingDto> {
    return this.commands.unhide(ownerId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('LANDLORD')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa mềm (không xóa được tin đang có đơn đặt cọc)' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'LISTING_HAS_ACTIVE_DEPOSIT' })
  async remove(
    @CurrentUser('sub') ownerId: string,
    @Param('id', createUuidParamPipe('id')) id: string,
  ): Promise<void> {
    await this.commands.softDelete(ownerId, id);
  }

  @Post(':id/images/upload-url')
  @HttpCode(200)
  @Roles('LANDLORD')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xin URL tải ảnh lên S3 (presigned PUT, service đặt key)' })
  @ApiEnvelope(UploadUrlResponseDto)
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'LISTING_IMAGE_LIMIT_REACHED' })
  uploadUrl(
    @CurrentUser('sub') ownerId: string,
    @Param('id', createUuidParamPipe('id')) id: string,
    @Body() dto: UploadUrlDto,
  ): Promise<UploadUrlResponseDto> {
    return this.images.createUploadUrl(ownerId, id, dto.contentType);
  }

  @Post(':id/images')
  @Roles('LANDLORD')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Xác nhận ảnh đã tải (kiểm kích thước bằng HeadObject). Gọi lại cùng key: 200',
  })
  @ApiEnvelope(ListingImageDto, { status: 201 })
  @ApiEnvelope(ListingImageDto, { description: 'Key đã có: trả ảnh đã có' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'LISTING_IMAGE_LIMIT_REACHED' })
  async confirmImage(
    @CurrentUser('sub') ownerId: string,
    @Param('id', createUuidParamPipe('id')) id: string,
    @Body() dto: ConfirmImageDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ListingImageDto> {
    const { image, created } = await this.images.confirm(ownerId, id, dto.key);
    res.status(created ? 201 : 200);
    return image;
  }
}
