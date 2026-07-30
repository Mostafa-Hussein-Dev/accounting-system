-- CreateTable
CREATE TABLE "item_barcodes" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "variant_id" UUID,
    "barcode" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_barcodes_item_id_idx" ON "item_barcodes"("item_id");

-- CreateIndex
CREATE INDEX "item_barcodes_variant_id_idx" ON "item_barcodes"("variant_id");

-- CreateIndex
CREATE INDEX "item_barcodes_company_id_idx" ON "item_barcodes"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_barcodes_company_id_barcode_key" ON "item_barcodes"("company_id", "barcode");

-- AddForeignKey
ALTER TABLE "item_barcodes" ADD CONSTRAINT "item_barcodes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_barcodes" ADD CONSTRAINT "item_barcodes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_barcodes" ADD CONSTRAINT "item_barcodes_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "item_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

