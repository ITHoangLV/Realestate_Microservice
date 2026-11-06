import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { bigintToNumber } from '../transformers';

/**
 * Entity MẪU để minh họa quy ước (xóa cùng migration mẫu khi copy template sang service thật;
 * không file nào khác tham chiếu tới nó):
 * - id UUID; tiền là bigint VND; thời gian là timestamptz (lưu UTC, ISO-8601 khi ra JSON).
 * - Để dùng: `TypeOrmModule.forFeature([ExampleItem])` trong module của bạn.
 */
@Entity({ name: 'example_item' })
export class ExampleItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'price_vnd', type: 'bigint', default: 0, transformer: bigintToNumber })
  priceVnd!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
