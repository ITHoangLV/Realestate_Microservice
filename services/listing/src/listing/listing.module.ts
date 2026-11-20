import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListingsAdminController } from './controllers/listings.admin.controller';
import { ListingsController } from './controllers/listings.controller';
import { ListingImage } from './entities/listing-image.entity';
import { Listing } from './entities/listing.entity';
import { ListingCommandService } from './services/listing-command.service';
import { ListingImageService } from './services/listing-image.service';
import { ListingQueryService } from './services/listing-query.service';
import { ListingReviewService } from './services/listing-review.service';
import { ListingPresenter } from './services/listing.presenter';

/**
 * Nghiệp vụ của listing-service (ADR-0010: sản phẩm và tin đăng là một bản ghi). Chỉ được nạp khi có
 * DB và S3 (xem app.module.ts và isListingEnabled()). Listing không phát, không nghe sự kiện.
 *
 * T2.3 thêm `ListingHoldService`, `listings.internal.controller.ts` và tìm kiếm ở `ListingQueryService`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Listing, ListingImage])],
  controllers: [ListingsController, ListingsAdminController],
  providers: [
    ListingPresenter,
    ListingCommandService,
    ListingQueryService,
    ListingReviewService,
    ListingImageService,
  ],
})
export class ListingModule {}
