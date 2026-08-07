-- CreateEnum
CREATE TYPE "SalesInvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ControlType" ADD VALUE 'REVENUE';
ALTER TYPE "ControlType" ADD VALUE 'COGS';

-- AlterTable
ALTER TABLE "item_categories" ADD COLUMN     "cogs_account_id" UUID,
ADD COLUMN     "revenue_account_id" UUID;

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "cogs_account_id" UUID,
ADD COLUMN     "revenue_account_id" UUID,
ADD COLUMN     "track_inventory" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "status" "SalesInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "customer_id" UUID NOT NULL,
    "branch_id" UUID,
    "location_id" UUID,
    "currency_code" TEXT NOT NULL,
    "rate" DECIMAL(20,6) NOT NULL,
    "base_currency_code" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE,
    "customer_ref" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "vat_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "subtotal_base" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "vat_total_base" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "grand_total_base" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "cogs_total_base" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "journal_entry_id" UUID,
    "posted_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "sales_invoice_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_id" UUID NOT NULL,
    "variant_id" UUID,
    "uom_id" UUID NOT NULL,
    "qty" DECIMAL(20,3) NOT NULL,
    "unit_price" DECIMAL(20,4) NOT NULL,
    "line_discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_rate_id" UUID,
    "vat_treatment" "TaxTreatment" NOT NULL DEFAULT 'STANDARD',
    "rate_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(20,2) NOT NULL,
    "vat_amount" DECIMAL(20,2) NOT NULL,
    "total_amount" DECIMAL(20,2) NOT NULL,
    "cost_base" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "stock_movement_id" UUID,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "credit_note_no" TEXT NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "customer_id" UUID NOT NULL,
    "sales_invoice_id" UUID,
    "branch_id" UUID,
    "location_id" UUID,
    "currency_code" TEXT NOT NULL,
    "rate" DECIMAL(20,6) NOT NULL,
    "base_currency_code" TEXT NOT NULL,
    "credit_note_date" DATE NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "vat_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "subtotal_base" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "vat_total_base" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "grand_total_base" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "cogs_total_base" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "journal_entry_id" UUID,
    "posted_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "credit_note_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_id" UUID NOT NULL,
    "variant_id" UUID,
    "uom_id" UUID NOT NULL,
    "qty" DECIMAL(20,3) NOT NULL,
    "unit_price" DECIMAL(20,4) NOT NULL,
    "line_discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_rate_id" UUID,
    "vat_treatment" "TaxTreatment" NOT NULL DEFAULT 'STANDARD',
    "rate_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(20,2) NOT NULL,
    "vat_amount" DECIMAL(20,2) NOT NULL,
    "total_amount" DECIMAL(20,2) NOT NULL,
    "cost_base" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "stock_movement_id" UUID,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_journal_entry_id_key" ON "sales_invoices"("journal_entry_id");

-- CreateIndex
CREATE INDEX "sales_invoices_company_id_idx" ON "sales_invoices"("company_id");

-- CreateIndex
CREATE INDEX "sales_invoices_customer_id_idx" ON "sales_invoices"("customer_id");

-- CreateIndex
CREATE INDEX "sales_invoices_status_idx" ON "sales_invoices"("status");

-- CreateIndex
CREATE INDEX "sales_invoices_deleted_at_idx" ON "sales_invoices"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_company_id_invoice_no_key" ON "sales_invoices"("company_id", "invoice_no");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_lines_stock_movement_id_key" ON "sales_invoice_lines"("stock_movement_id");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_company_id_idx" ON "sales_invoice_lines"("company_id");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_sales_invoice_id_idx" ON "sales_invoice_lines"("sales_invoice_id");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_item_id_idx" ON "sales_invoice_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_journal_entry_id_key" ON "credit_notes"("journal_entry_id");

-- CreateIndex
CREATE INDEX "credit_notes_company_id_idx" ON "credit_notes"("company_id");

-- CreateIndex
CREATE INDEX "credit_notes_customer_id_idx" ON "credit_notes"("customer_id");

-- CreateIndex
CREATE INDEX "credit_notes_status_idx" ON "credit_notes"("status");

-- CreateIndex
CREATE INDEX "credit_notes_deleted_at_idx" ON "credit_notes"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_company_id_credit_note_no_key" ON "credit_notes"("company_id", "credit_note_no");

-- CreateIndex
CREATE UNIQUE INDEX "credit_note_lines_stock_movement_id_key" ON "credit_note_lines"("stock_movement_id");

-- CreateIndex
CREATE INDEX "credit_note_lines_company_id_idx" ON "credit_note_lines"("company_id");

-- CreateIndex
CREATE INDEX "credit_note_lines_credit_note_id_idx" ON "credit_note_lines"("credit_note_id");

-- CreateIndex
CREATE INDEX "credit_note_lines_item_id_idx" ON "credit_note_lines"("item_id");

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_revenue_account_id_fkey" FOREIGN KEY ("revenue_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_cogs_account_id_fkey" FOREIGN KEY ("cogs_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_revenue_account_id_fkey" FOREIGN KEY ("revenue_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_cogs_account_id_fkey" FOREIGN KEY ("cogs_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_base_currency_code_fkey" FOREIGN KEY ("base_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "item_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_stock_movement_id_fkey" FOREIGN KEY ("stock_movement_id") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_base_currency_code_fkey" FOREIGN KEY ("base_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "item_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_stock_movement_id_fkey" FOREIGN KEY ("stock_movement_id") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

