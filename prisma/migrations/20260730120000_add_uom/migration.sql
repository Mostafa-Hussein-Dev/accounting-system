-- CreateEnum
CREATE TYPE "UomType" AS ENUM ('REFERENCE', 'BIGGER', 'SMALLER');

-- CreateTable
CREATE TABLE "uom_categories" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "name_fr" TEXT,
    "name_en" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uom_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uoms" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "name_fr" TEXT,
    "name_en" TEXT,
    "type" "UomType" NOT NULL,
    "factor" DECIMAL(20,6) NOT NULL DEFAULT 1,
    "rounding" DECIMAL(20,6) NOT NULL DEFAULT 0.01,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uoms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uom_categories_company_id_idx" ON "uom_categories"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uom_categories_company_id_name_key" ON "uom_categories"("company_id", "name");

-- CreateIndex
CREATE INDEX "uoms_company_id_idx" ON "uoms"("company_id");

-- CreateIndex
CREATE INDEX "uoms_category_id_idx" ON "uoms"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "uoms_company_id_name_key" ON "uoms"("company_id", "name");

-- AddForeignKey
ALTER TABLE "uom_categories" ADD CONSTRAINT "uom_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uoms" ADD CONSTRAINT "uoms_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uoms" ADD CONSTRAINT "uoms_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "uom_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

