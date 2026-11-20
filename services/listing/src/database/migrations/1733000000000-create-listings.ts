import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bảng sản phẩm/tin đăng và ảnh (`RE.LISTING/API_Spec.md §6`, ADR-0010).
 *
 * Không `CREATE EXTENSION`: `listing_user` không phải superuser, `postgis`, `pgcrypto` đã được bật ở
 * `infra/compose/postgres/init/01-create-databases.sh`. Thiếu extension thì migration báo lỗi ở
 * `geography`, đó là việc của hạ tầng (xem gotchas.md "Script init DB không chạy lại").
 *
 * `listing_images.listing_id` có khóa ngoại vì cùng service. `owner_id`, `reviewed_by`,
 * `held_by_deposit_id` tham chiếu service khác nên KHÔNG có khóa ngoại (ADR-0005).
 */
export class CreateListings1733000000000 implements MigrationInterface {
  name = 'CreateListings1733000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "listings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "title" character varying(200) NOT NULL,
        "description" text,
        "property_type" character varying(20) NOT NULL,
        "price_vnd" bigint NOT NULL,
        "deposit_amount_vnd" bigint NOT NULL,
        "area_m2" numeric(8,2) NOT NULL,
        "address" character varying(300),
        "district" character varying(100),
        "city" character varying(100),
        "location" geography(Point, 4326) NOT NULL,
        "amenities" text[] NOT NULL DEFAULT '{}',
        "status" character varying(20) NOT NULL DEFAULT 'AVAILABLE',
        "approval_status" character varying(20) NOT NULL DEFAULT 'PENDING_REVIEW',
        "reject_reason" character varying(500),
        "reviewed_by" uuid,
        "reviewed_at" TIMESTAMPTZ,
        "held_until" TIMESTAMPTZ,
        "held_by_deposit_id" uuid,
        "version" integer NOT NULL DEFAULT 0,
        "deleted_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_listings" PRIMARY KEY ("id"),
        CONSTRAINT "CK_listings_property_type" CHECK ("property_type" IN ('ROOM','APARTMENT','HOUSE')),
        CONSTRAINT "CK_listings_price_vnd" CHECK ("price_vnd" > 0),
        CONSTRAINT "CK_listings_deposit_amount_vnd" CHECK ("deposit_amount_vnd" > 0),
        CONSTRAINT "CK_listings_status" CHECK ("status" IN ('AVAILABLE','HELD','DEPOSITED','RENTED','HIDDEN')),
        CONSTRAINT "CK_listings_approval_status" CHECK ("approval_status" IN ('PENDING_REVIEW','APPROVED','REJECTED'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_listings_location" ON "listings" USING GIST ("location")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_listings_search" ON "listings" ("approval_status", "status", "district") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX "ix_listings_price" ON "listings" ("price_vnd")`);
    await queryRunner.query(
      `CREATE INDEX "ix_listings_owner" ON "listings" ("owner_id", "created_at" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE "listing_images" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "listing_id" uuid NOT NULL,
        "object_key" character varying(300) NOT NULL,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_listing_images" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_listing_images_object_key" UNIQUE ("object_key"),
        CONSTRAINT "FK_listing_images_listing" FOREIGN KEY ("listing_id") REFERENCES "listings" ("id")
      )
    `);
    // Đọc ảnh theo tin (`listing_id = ANY($1)`) và xếp theo sort_order: index theo NFR §1 (không có trong DDL §6 v1.1)
    await queryRunner.query(
      `CREATE INDEX "ix_listing_images_listing" ON "listing_images" ("listing_id", "sort_order")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "listing_images"`);
    await queryRunner.query(`DROP TABLE "listings"`);
  }
}
