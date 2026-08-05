-- Part 2 of 2: enforce NOT NULL + FK now that base_currency_code is backfilled.
-- Separate migration (own transaction) so no pending UPDATE leaves deferred
-- trigger events on journal_lines when the ALTERs run.

ALTER TABLE "journal_lines"   ALTER COLUMN "base_currency_code" SET NOT NULL;
ALTER TABLE "purchase_orders" ALTER COLUMN "base_currency_code" SET NOT NULL;
ALTER TABLE "vendor_bills"    ALTER COLUMN "base_currency_code" SET NOT NULL;

CREATE INDEX "journal_lines_base_currency_code_idx" ON "journal_lines"("base_currency_code");

ALTER TABLE "journal_lines"   ADD CONSTRAINT "journal_lines_base_currency_code_fkey"   FOREIGN KEY ("base_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_base_currency_code_fkey" FOREIGN KEY ("base_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_bills"    ADD CONSTRAINT "vendor_bills_base_currency_code_fkey"    FOREIGN KEY ("base_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
