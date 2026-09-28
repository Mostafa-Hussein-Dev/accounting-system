-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'APPROVED', 'POSTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ControlType" ADD VALUE 'INVENTORY_ADJUSTMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'STOCK_COUNT';
ALTER TYPE "DocumentType" ADD VALUE 'STOCK_TRANSFER';

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "count_no" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "count_date" DATE NOT NULL,
    "branch_id" UUID,
    "location_id" UUID NOT NULL,
    "notes" TEXT,
    "variance_value_base" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "journal_entry_id" UUID,
    "posted_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "stock_count_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_id" UUID NOT NULL,
    "variant_id" UUID,
    "uom_id" UUID,
    "system_qty" DECIMAL(20,3) NOT NULL,
    "counted_qty" DECIMAL(20,3) NOT NULL,
    "unit_cost" DECIMAL(20,4),
    "variance_qty" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "variance_value_base" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "stock_movement_id" UUID,

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "transfer_no" TEXT NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "transfer_date" DATE NOT NULL,
    "from_location_id" UUID NOT NULL,
    "to_location_id" UUID NOT NULL,
    "from_branch_id" UUID,
    "to_branch_id" UUID,
    "notes" TEXT,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "posted_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "stock_transfer_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_id" UUID NOT NULL,
    "variant_id" UUID,
    "uom_id" UUID,
    "qty" DECIMAL(20,3) NOT NULL,
    "stock_movement_id" UUID,

    CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_journal_entry_id_key" ON "stock_counts"("journal_entry_id");

-- CreateIndex
CREATE INDEX "stock_counts_company_id_idx" ON "stock_counts"("company_id");

-- CreateIndex
CREATE INDEX "stock_counts_status_idx" ON "stock_counts"("status");

-- CreateIndex
CREATE INDEX "stock_counts_deleted_at_idx" ON "stock_counts"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_company_id_count_no_key" ON "stock_counts"("company_id", "count_no");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_lines_stock_movement_id_key" ON "stock_count_lines"("stock_movement_id");

-- CreateIndex
CREATE INDEX "stock_count_lines_stock_count_id_idx" ON "stock_count_lines"("stock_count_id");

-- CreateIndex
CREATE INDEX "stock_count_lines_item_id_variant_id_idx" ON "stock_count_lines"("item_id", "variant_id");

-- CreateIndex
CREATE INDEX "stock_transfers_company_id_idx" ON "stock_transfers"("company_id");

-- CreateIndex
CREATE INDEX "stock_transfers_status_idx" ON "stock_transfers"("status");

-- CreateIndex
CREATE INDEX "stock_transfers_deleted_at_idx" ON "stock_transfers"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_company_id_transfer_no_key" ON "stock_transfers"("company_id", "transfer_no");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_lines_stock_movement_id_key" ON "stock_transfer_lines"("stock_movement_id");

-- CreateIndex
CREATE INDEX "stock_transfer_lines_stock_transfer_id_idx" ON "stock_transfer_lines"("stock_transfer_id");

-- CreateIndex
CREATE INDEX "stock_transfer_lines_item_id_variant_id_idx" ON "stock_transfer_lines"("item_id", "variant_id");

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "item_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stock_movement_id_fkey" FOREIGN KEY ("stock_movement_id") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_branch_id_fkey" FOREIGN KEY ("from_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_branch_id_fkey" FOREIGN KEY ("to_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_stock_transfer_id_fkey" FOREIGN KEY ("stock_transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "item_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_stock_movement_id_fkey" FOREIGN KEY ("stock_movement_id") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

