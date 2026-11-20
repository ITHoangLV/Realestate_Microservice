import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsDefined, IsNumber, Max, Min, ValidateIf } from 'class-validator';
import { CreateListingDto } from './create-listing.dto';

/**
 * Body của `PATCH /listings/:id`: mọi trường của `CreateListingDto` đều tùy chọn
 * (`RE.LISTING/API_Spec.md §1.4`). Hai ràng buộc chéo:
 * - `lat` và `lng` đi cùng nhau (vị trí là một điểm, không sửa nửa tọa độ);
 * - ít nhất một trường (kiểm ở `ListingCommandService.update`, vì cần biết trường nào thật sự gửi).
 */
export class UpdateListingDto extends PartialType(CreateListingDto) {
  @ApiPropertyOptional({ type: 'number', minimum: -90, maximum: 90 })
  @ValidateIf((o: UpdateListingDto) => o.lat !== undefined || o.lng !== undefined)
  @IsDefined({ message: 'lat phải đi cùng lng' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  declare lat?: number;

  @ApiPropertyOptional({ type: 'number', minimum: -180, maximum: 180 })
  @ValidateIf((o: UpdateListingDto) => o.lat !== undefined || o.lng !== undefined)
  @IsDefined({ message: 'lng phải đi cùng lat' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  declare lng?: number;
}
