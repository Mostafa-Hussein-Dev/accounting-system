-- CreateEnum
CREATE TYPE "ResetPeriod" AS ENUM ('NONE', 'YEARLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('SALES_INVOICE', 'SALES_ORDER', 'QUOTATION', 'DELIVERY_NOTE', 'CREDIT_NOTE', 'PURCHASE_ORDER', 'PAYMENT_RECEIPT', 'JOURNAL_ENTRY');

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_id" UUID,
    "doc_type" "DocumentType" NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "pad_width" INTEGER NOT NULL DEFAULT 4,
    "reset_period" "ResetPeriod" NOT NULL DEFAULT 'YEARLY',
    "next_number" INTEGER NOT NULL DEFAULT 1,
    "period_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_sequences_company_id_idx" ON "document_sequences"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_company_id_branch_id_doc_type_key" ON "document_sequences"("company_id", "branch_id", "doc_type");

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

