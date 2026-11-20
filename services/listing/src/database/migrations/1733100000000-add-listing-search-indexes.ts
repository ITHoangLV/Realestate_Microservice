import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index cho cột lọc và sắp xếp của tìm kiếm (`GET /listings`, `RE.LISTING/API_Spec.md §1.3, §6` v1.4).
 * `non-functional-standards.md §1`: MUST có index cho cột lọc, sắp xếp trong truy vấn danh sách.
 *
 * - `ix_listings_amenities` GIN: `amenities @> $1` (mọi tiện ích phải có).
 * - `ix_listings_created` `(created_at DESC, id DESC) WHERE deleted_at IS NULL`: `sort=newest` (mặc định).
 * - `ix_listings_area`: `minArea`, `maxArea`.
 *
 * Giá (`ix_listings_price`), quận (`ix_listings_search`), bán kính (`ix_listings_location`) đã có từ
 * migration tạo bảng. Không sửa migration đã merge, nên thêm migration mới.
 */
export class AddListingSearchIndexes1733100000000 implements MigrationInterface {
  name = 'AddListingSearchIndexes1733100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "ix_listings_amenities" ON "listings" USING GIN ("amenities")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_listings_created" ON "listings" ("created_at" DESC, "id" DESC) WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX "ix_listings_area" ON "listings" ("area_m2")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "ix_listings_area"`);
    await queryRunner.query(`DROP INDEX "ix_listings_created"`);
    await queryRunner.query(`DROP INDEX "ix_listings_amenities"`);
  }
}
