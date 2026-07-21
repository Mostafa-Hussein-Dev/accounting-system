-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "base_currency_code" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "fiscal_year_start_month" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}';

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_base_currency_code_fkey" FOREIGN KEY ("base_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

