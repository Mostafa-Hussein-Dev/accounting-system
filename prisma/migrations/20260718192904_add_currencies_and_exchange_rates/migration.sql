-- CreateTable
CREATE TABLE "currencies" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "name_fr" TEXT,
    "name_en" TEXT,
    "symbol" TEXT NOT NULL,
    "decimal_places" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "currency_code" TEXT NOT NULL,
    "rate_type" TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "rate" DECIMAL(20,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rates_company_id_currency_code_rate_type_effective_idx" ON "exchange_rates"("company_id", "currency_code", "rate_type", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_company_id_currency_code_rate_type_effective_key" ON "exchange_rates"("company_id", "currency_code", "rate_type", "effective_date");

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
