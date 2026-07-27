-- CreateEnum
CREATE TYPE "PartnerAddressType" AS ENUM ('BILLING', 'SHIPPING', 'BRANCH');

-- CreateTable
CREATE TABLE "partners" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "ref" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "name_fr" TEXT,
    "name_en" TEXT,
    "is_customer" BOOLEAN NOT NULL DEFAULT false,
    "is_supplier" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "tin" TEXT,
    "contact_name" TEXT,
    "phone" TEXT,
    "phone_2" TEXT,
    "email" TEXT,
    "vip" BOOLEAN NOT NULL DEFAULT false,
    "credit_limit" DECIMAL(20,2),
    "credit_currency" TEXT,
    "receivable_account_id" UUID,
    "payable_account_id" UUID,
    "region_id" UUID,
    "salesman_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_addresses" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "type" "PartnerAddressType" NOT NULL,
    "line1" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "region" TEXT,
    "phone" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partners_company_id_idx" ON "partners"("company_id");

-- CreateIndex
CREATE INDEX "partners_company_id_is_customer_idx" ON "partners"("company_id", "is_customer");

-- CreateIndex
CREATE INDEX "partners_company_id_is_supplier_idx" ON "partners"("company_id", "is_supplier");

-- CreateIndex
CREATE INDEX "partners_deleted_at_idx" ON "partners"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "partners_company_id_ref_key" ON "partners"("company_id", "ref");

-- CreateIndex
CREATE INDEX "partner_addresses_partner_id_idx" ON "partner_addresses"("partner_id");

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_credit_currency_fkey" FOREIGN KEY ("credit_currency") REFERENCES "currencies"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_receivable_account_id_fkey" FOREIGN KEY ("receivable_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_payable_account_id_fkey" FOREIGN KEY ("payable_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_addresses" ADD CONSTRAINT "partner_addresses_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

