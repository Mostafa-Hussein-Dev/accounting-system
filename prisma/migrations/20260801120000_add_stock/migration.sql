-- FR-402 stock ledger: locations + stock movements + moving-average cost, and
-- resolves deferred #1 (Branch.stockLocationId gets an FK and becomes NOT NULL).
--
-- Hand-authored (not `migrate dev`, per the Prisma-7 shadow-DB workflow) so the
-- Branch.stock_location_id NOT-NULL flip is backfilled first: every company gets
-- its virtual counterparty locations and every branch a default INTERNAL
-- location. Seeding the STOCK_MOVEMENT document sequence is a SEPARATE migration
-- because Postgres cannot USE a newly-added enum value in the same transaction.

-- gen_random_uuid() for the backfill (built-in on PG13+; extension is a safety).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('INTERNAL', 'CUSTOMER', 'SUPPLIER', 'ADJUSTMENT', 'TRANSIT');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT', 'OPENING');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'STOCK_MOVEMENT';

-- AlterTable (moving-average cost caches; total value stays derived from movements)
ALTER TABLE "item_variants" ADD COLUMN     "avg_cost" DECIMAL(20,4) NOT NULL DEFAULT 0;
ALTER TABLE "items" ADD COLUMN     "avg_cost" DECIMAL(20,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "name_fr" TEXT,
    "name_en" TEXT,
    "type" "LocationType" NOT NULL,
    "branch_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "movement_no" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "movement_date" DATE NOT NULL,
    "item_id" UUID NOT NULL,
    "variant_id" UUID,
    "from_location_id" UUID NOT NULL,
    "to_location_id" UUID NOT NULL,
    "qty" DECIMAL(20,3) NOT NULL,
    "unit_cost" DECIMAL(20,4) NOT NULL,
    "value" DECIMAL(20,4) NOT NULL,
    "cost_currency" TEXT NOT NULL,
    "reason" TEXT,
    "reference" TEXT,
    "branch_id" UUID,
    "source_doc_type" TEXT,
    "source_doc_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "locations_company_id_idx" ON "locations"("company_id");
CREATE INDEX "locations_branch_id_idx" ON "locations"("branch_id");
CREATE INDEX "locations_deleted_at_idx" ON "locations"("deleted_at");
CREATE UNIQUE INDEX "locations_company_id_code_key" ON "locations"("company_id", "code");

-- CreateIndex
CREATE INDEX "stock_movements_company_id_idx" ON "stock_movements"("company_id");
CREATE INDEX "stock_movements_item_id_variant_id_idx" ON "stock_movements"("item_id", "variant_id");
CREATE INDEX "stock_movements_from_location_id_idx" ON "stock_movements"("from_location_id");
CREATE INDEX "stock_movements_to_location_id_idx" ON "stock_movements"("to_location_id");
CREATE INDEX "stock_movements_movement_date_idx" ON "stock_movements"("movement_date");

-- AddForeignKey (location FKs; the Branch default-location FK is added AFTER backfill)
ALTER TABLE "locations" ADD CONSTRAINT "locations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "item_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill: virtual counterparty locations per company, one INTERNAL location
-- per branch, and point every branch at its default location.
-- ---------------------------------------------------------------------------

-- Virtual (company-level, branch-less) counterparties every movement posts against.
INSERT INTO "locations" ("id", "company_id", "code", "name", "type", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), c."id", v."code", v."name", v."type"::"LocationType", true, now(), now()
FROM "companies" c
CROSS JOIN (VALUES
    ('CUSTOMERS', 'Customers', 'CUSTOMER'),
    ('SUPPLIERS', 'Suppliers', 'SUPPLIER'),
    ('ADJUSTMENT', 'Inventory Adjustment', 'ADJUSTMENT'),
    ('TRANSIT', 'Transit', 'TRANSIT')
) AS v("code", "name", "type");

-- One INTERNAL stock location per branch (code unique per company via the branch id).
INSERT INTO "locations" ("id", "company_id", "code", "name", "type", "branch_id", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), b."company_id", 'STOCK-' || left(b."id"::text, 8), 'Stock - ' || b."name", 'INTERNAL', b."id", true, now(), now()
FROM "branches" b;

-- Point every branch at the internal location just created for it.
UPDATE "branches" b
SET "stock_location_id" = l."id"
FROM "locations" l
WHERE l."branch_id" = b."id" AND l."type" = 'INTERNAL';

-- Now that every row is backfilled, enforce the NOT-NULL + FK (resolves deferred #1).
ALTER TABLE "branches" ALTER COLUMN "stock_location_id" SET NOT NULL;
ALTER TABLE "branches" ADD CONSTRAINT "branches_stock_location_id_fkey" FOREIGN KEY ("stock_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
