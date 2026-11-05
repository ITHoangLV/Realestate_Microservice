import { Module } from '@nestjs/common';
import { ExampleInternalController } from './example-internal.controller';
import { ExampleController } from './example.controller';
import { ExampleService } from './example.service';

/** Module MẪU: controller công khai + controller nội bộ + service. Xóa/đổi tên khi copy template. */
@Module({
  controllers: [ExampleController, ExampleInternalController],
  providers: [ExampleService],
  exports: [ExampleService],
})
export class ExampleModule {}
