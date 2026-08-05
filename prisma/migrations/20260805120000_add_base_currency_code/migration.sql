-- URGENT fix (docs/URGENT.md): make base-currency amounts self-describing.
-- Store the base currency WITH the frozen base amount on journal_lines (and on
-- the purchasing document totals) so a later Company.baseCurrencyCode change can
-- never relabel historical numbers.
--
-- Part 1 of 2: add the column NULLABLE and backfill from each row's company.
-- The NOT NULL + FK are a SEPARATE migration because journal_lines carries
-- DEFERRED balance-check constraint triggers: an UPDATE queues trigger events,
-- and Postgres then refuses to ALTER the table in the same transaction
-- ("pending trigger events", 55006). The backfill is the best available answer
-- (correct for any company that never changed its base currency); non-USD
-- companies with postings are logged as review candidates.

-- Add nullable.
ALTER TABLE "journal_lines"   ADD COLUMN "base_currency_code" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "base_currency_code" TEXT;
ALTER TABLE "vendor_bills"    ADD COLUMN "base_currency_code" TEXT;

-- Backfill from the owning company's current base currency.
UPDATE "journal_lines" jl
  SET "base_currency_code" = c."base_currency_code"
  FROM "companies" c WHERE jl."company_id" = c."id";
UPDATE "purchase_orders" po
  SET "base_currency_code" = c."base_currency_code"
  FROM "companies" c WHERE po."company_id" = c."id";
UPDATE "vendor_bills" vb
  SET "base_currency_code" = c."base_currency_code"
  FROM "companies" c WHERE vb."company_id" = c."id";

-- Flag review candidates (non-USD companies with postings; their pre-change
-- history, if any, may now carry a wrong base label the backfill cannot recover).
DO $$
DECLARE
  affected TEXT;
BEGIN
  SELECT string_agg(id::text || ' (' || base_currency_code || ')', ', ')
    INTO affected
  FROM "companies"
  WHERE base_currency_code <> 'USD'
    AND EXISTS (SELECT 1 FROM "journal_lines" jl WHERE jl.company_id = companies.id);
  IF affected IS NOT NULL THEN
    RAISE NOTICE 'BASE-CURRENCY REVIEW: non-USD companies with postings (verify history was not mislabelled by a base-currency change): %', affected;
  END IF;
END $$;
