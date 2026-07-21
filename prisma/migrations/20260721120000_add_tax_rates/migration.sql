-- CreateEnum
CREATE TYPE "TaxTreatment" AS ENUM ('STANDARD', 'ZERO', 'EXEMPT');

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rate_pct" DECIMAL(5,2) NOT NULL,
    "treatment" "TaxTreatment" NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "vat_out_account_id" UUID,
    "vat_in_account_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_rates_company_id_idx" ON "tax_rates"("company_id");

-- CreateIndex
CREATE INDEX "tax_rates_company_id_treatment_effective_date_idx" ON "tax_rates"("company_id", "treatment", "effective_date");

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_vat_out_account_id_fkey" FOREIGN KEY ("vat_out_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_vat_in_account_id_fkey" FOREIGN KEY ("vat_in_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

