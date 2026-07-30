-- CreateTable
CREATE TABLE "pricelists" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricelists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricelist_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "pricelist_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "variant_id" UUID,
    "price" DECIMAL(20,4) NOT NULL,
    "min_qty" DECIMAL(20,3) NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricelist_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricelists_company_id_idx" ON "pricelists"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "pricelists_company_id_name_key" ON "pricelists"("company_id", "name");

-- CreateIndex
CREATE INDEX "pricelist_lines_pricelist_id_idx" ON "pricelist_lines"("pricelist_id");

-- CreateIndex
CREATE INDEX "pricelist_lines_item_id_idx" ON "pricelist_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "pricelist_lines_pricelist_id_item_id_variant_id_min_qty_key" ON "pricelist_lines"("pricelist_id", "item_id", "variant_id", "min_qty");

-- AddForeignKey
ALTER TABLE "pricelists" ADD CONSTRAINT "pricelists_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricelists" ADD CONSTRAINT "pricelists_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricelist_lines" ADD CONSTRAINT "pricelist_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricelist_lines" ADD CONSTRAINT "pricelist_lines_pricelist_id_fkey" FOREIGN KEY ("pricelist_id") REFERENCES "pricelists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricelist_lines" ADD CONSTRAINT "pricelist_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricelist_lines" ADD CONSTRAINT "pricelist_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "item_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

