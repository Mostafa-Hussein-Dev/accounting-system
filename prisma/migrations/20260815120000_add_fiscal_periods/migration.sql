-- CreateEnum
CREATE TYPE "FiscalPeriodStatus" AS ENUM ('OPEN', 'LOCKED');

-- AlterEnum
ALTER TYPE "ControlType" ADD VALUE 'RETAINED_EARNINGS';

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "locked_at" TIMESTAMP(3),
    "locked_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_periods_company_id_idx" ON "fiscal_periods"("company_id");

-- CreateIndex
CREATE INDEX "fiscal_periods_company_id_status_idx" ON "fiscal_periods"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_periods_company_id_year_month_key" ON "fiscal_periods"("company_id", "year", "month");

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- FR-904: hard guarantee that no POSTED journal entry can land in a LOCKED
-- fiscal period, on ANY posting path (mirrors the balanced-entry triggers).
-- An absent period row = open. Services also check this first for a clean 409.
CREATE OR REPLACE FUNCTION assert_fiscal_period_open() RETURNS trigger AS $$
DECLARE is_locked boolean;
BEGIN
  IF NEW.status = 'POSTED' THEN
    SELECT EXISTS(
      SELECT 1 FROM fiscal_periods fp
      WHERE fp.company_id = NEW.company_id
        AND fp.year = EXTRACT(YEAR FROM NEW.date)::int
        AND fp.month = EXTRACT(MONTH FROM NEW.date)::int
        AND fp.status = 'LOCKED'
    ) INTO is_locked;
    IF is_locked THEN
      RAISE EXCEPTION 'PERIOD_LOCKED: cannot post into locked fiscal period %', to_char(NEW.date, 'YYYY-MM');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_period_lock
  BEFORE INSERT OR UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION assert_fiscal_period_open();
