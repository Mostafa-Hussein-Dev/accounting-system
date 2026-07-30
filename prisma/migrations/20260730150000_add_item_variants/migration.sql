-- CreateTable
CREATE TABLE "item_variants" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "size_id" UUID,
    "colour_id" UUID,
    "sku" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_variants_item_id_idx" ON "item_variants"("item_id");

-- CreateIndex
CREATE INDEX "item_variants_company_id_idx" ON "item_variants"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_variants_item_id_size_id_colour_id_key" ON "item_variants"("item_id", "size_id", "colour_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_variants_company_id_sku_key" ON "item_variants"("company_id", "sku");

-- AddForeignKey
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "sizes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_colour_id_fkey" FOREIGN KEY ("colour_id") REFERENCES "colours"("id") ON DELETE SET NULL ON UPDATE CASCADE;

