import { MigrationInterface, QueryRunner } from 'typeorm';

/** Migration MẪU tương ứng entity ExampleItem (xóa khi copy template sang service thật). */
export class CreateExampleItem1730000000000 implements MigrationInterface {
  name = 'CreateExampleItem1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // gen_random_uuid() có sẵn từ PostgreSQL 13, không cần extension
    await queryRunner.query(`
      CREATE TABLE "example_item" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" text NOT NULL,
        "price_vnd" bigint NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_example_item" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "example_item"`);
  }
}
