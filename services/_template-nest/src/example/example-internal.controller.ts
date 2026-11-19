import { Controller, Get, Param } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import { createUuidParamPipe } from '../common/errors/uuid-param.pipe';
import { ExampleDto } from './dto/example.dto';
import { ExampleService } from './example.service';

/**
 * API NỘI BỘ (/internal/...): chỉ service khác gọi, KHÔNG gắn prefix /api/v1, KHÔNG xuất hiện trong
 * Swagger công khai và api-gateway không được định tuyến tới đường dẫn này.
 * Gọi từ service khác bằng InternalHttpService:
 *   this.http.get<ExampleDto>(`${INTERNAL_X_URL}/internal/examples/${id}`)
 *
 * @Public(): tạm tin mạng nội bộ (docker network). Khi triển khai thật nên thêm xác thực
 * service-to-service (token nội bộ hoặc mTLS) thay vì để mở.
 */
@ApiExcludeController()
@Public()
@Controller('internal/examples')
export class ExampleInternalController {
  constructor(private readonly examples: ExampleService) {}

  @Get(':id')
  findOne(@Param('id', createUuidParamPipe('id')) id: string): ExampleDto {
    return this.examples.findOne(id);
  }
}
