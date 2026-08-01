-- FR-402: the external counterparty on a stock movement (Odoo stock.move
-- partner_id). Nullable column; the service REQUIRES it for receipts/issues
-- (any movement touching a SUPPLIER/CUSTOMER location) and REJECTS it for
-- internal transfers/adjustments — the same conditional rule as
-- JournalLine.partnerId on AR/AP postings. Lets stock history roll up per
-- supplier/customer without needing a location per partner.

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN "partner_id" UUID;

-- CreateIndex
CREATE INDEX "stock_movements_partner_id_idx" ON "stock_movements"("partner_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
