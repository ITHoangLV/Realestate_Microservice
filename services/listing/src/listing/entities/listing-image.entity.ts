import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Ảnh của tin: chỉ lưu key S3, không lưu URL (URL presigned hết hạn). `object_key` duy nhất.
 * Khóa ngoại `listing_id` có ở migration (cùng service, được phép).
 */
@Entity('listing_images')
export class ListingImage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'listing_id', type: 'uuid' })
  listingId!: string;

  /** `listings/{listingId}/{uuid}.{ext}`, do service đặt (`listing-image.rules.ts`). */
  @Column({ name: 'object_key', type: 'varchar', length: 300, unique: true })
  objectKey!: string;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
