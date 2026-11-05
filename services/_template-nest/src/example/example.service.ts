import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppException } from '../common/errors/app.exception';
import { CreateExampleDto } from './dto/create-example.dto';
import { ExampleDto } from './dto/example.dto';
import { ExampleErrorCode } from './example.errors';

/**
 * Service MẪU lưu trong bộ nhớ để template chạy được không cần DB.
 * Service thật: thay Map bằng repository TypeORM (xem src/database/entities/example-item.entity.ts).
 */
@Injectable()
export class ExampleService {
  private readonly items = new Map<string, ExampleDto>();

  create(dto: CreateExampleDto): ExampleDto {
    const taken = [...this.items.values()].some(
      (item) => item.name.toLowerCase() === dto.name.toLowerCase(),
    );
    if (taken) {
      // Lỗi nghiệp vụ có nghĩa: 409 + mã riêng + details để client hiển thị đúng
      throw new AppException(ExampleErrorCode.NAME_TAKEN, `Tên "${dto.name}" đã tồn tại`, 409, {
        name: dto.name,
      });
    }
    const item: ExampleDto = {
      id: randomUUID(),
      name: dto.name,
      priceVnd: dto.priceVnd,
      createdAt: new Date().toISOString(), // UTC, ISO-8601
    };
    this.items.set(item.id, item);
    return item;
  }

  findAll(): ExampleDto[] {
    return [...this.items.values()];
  }

  findOne(id: string): ExampleDto {
    const item = this.items.get(id);
    if (!item) {
      throw new AppException(ExampleErrorCode.NOT_FOUND, 'Không tìm thấy bản ghi', 404, { id });
    }
    return item;
  }
}
