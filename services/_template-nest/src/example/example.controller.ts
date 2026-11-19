import { Body, Controller, Get, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthUser } from '../common/auth/authenticated-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Public } from '../common/auth/public.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ErrorResponseDto } from '../common/errors/error-response.dto';
import { createUuidParamPipe } from '../common/errors/uuid-param.pipe';
import { ApiEnvelope } from '../common/response/api-envelope.decorator';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import { CreateExampleDto } from './dto/create-example.dto';
import { ExampleDto } from './dto/example.dto';
import { ExampleService } from './example.service';

/**
 * Controller MẪU cho API công khai (/api/v1/examples). Xóa khi copy template sang service thật,
 * giữ lại làm tham chiếu cách dùng @Public, @Roles, @CurrentUser, @Idempotent và lỗi nghiệp vụ.
 */
@ApiTags('examples')
@Controller('examples')
export class ExampleController {
  constructor(private readonly examples: ExampleService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Tạo bản ghi (lỗi 409 EXAMPLE_NAME_TAKEN nếu trùng tên)' })
  @ApiEnvelope(ExampleDto, { status: HttpStatus.CREATED })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'EXAMPLE_NAME_TAKEN' })
  create(@Body() dto: CreateExampleDto): ExampleDto {
    return this.examples.create(dto);
  }

  /** Cần REDIS_URL: gửi header Idempotency-Key, gửi lại cùng key + cùng body sẽ nhận lại response cũ. */
  @Public()
  @Post('idempotent')
  @Idempotent()
  @ApiOperation({ summary: 'Tạo bản ghi idempotent (cần Redis + header Idempotency-Key)' })
  @ApiEnvelope(ExampleDto, { status: HttpStatus.CREATED })
  createIdempotent(@Body() dto: CreateExampleDto): ExampleDto {
    return this.examples.create(dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Danh sách bản ghi' })
  @ApiEnvelope(ExampleDto, { isArray: true })
  findAll(): ExampleDto[] {
    return this.examples.findAll();
  }

  // Các route cố định (me, admin-only) PHẢI khai báo trước ':id' để không bị ':id' nuốt mất

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin người dùng đang đăng nhập (cần JWT)' })
  @ApiOkResponse({ description: '{ sub, roles, exp }' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Get('admin-only')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chỉ vai trò ADMIN' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'FORBIDDEN_ROLE' })
  adminOnly(@CurrentUser('sub') sub: string): { message: string } {
    return { message: `Xin chào quản trị viên ${sub}` };
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một bản ghi' })
  @ApiEnvelope(ExampleDto)
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'EXAMPLE_NOT_FOUND' })
  findOne(@Param('id', createUuidParamPipe('id')) id: string): ExampleDto {
    return this.examples.findOne(id);
  }
}
