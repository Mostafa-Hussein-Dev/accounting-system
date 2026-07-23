-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateEnum
CREATE TYPE "JournalSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_id" UUID,
    "entry_number" TEXT,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "reversal_of_id" UUID,
    "source_doc_type" "DocumentType",
    "source_doc_id" UUID,
    "posted_at" TIMESTAMP(3),
    "posted_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "account_id" UUID NOT NULL,
    "side" "JournalSide" NOT NULL,
    "amount_original" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" DECIMAL(20,6) NOT NULL,
    "amount_base" DECIMAL(20,2) NOT NULL,
    "partner_id" UUID,
    "cost_center_id" UUID,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversal_of_id_key" ON "journal_entries"("reversal_of_id");

-- CreateIndex
CREATE INDEX "journal_entries_company_id_idx" ON "journal_entries"("company_id");

-- CreateIndex
CREATE INDEX "journal_entries_company_id_status_idx" ON "journal_entries"("company_id", "status");

-- CreateIndex
CREATE INDEX "journal_entries_company_id_date_idx" ON "journal_entries"("company_id", "date");

-- CreateIndex
CREATE INDEX "journal_entries_deleted_at_idx" ON "journal_entries"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_company_id_entry_number_key" ON "journal_entries"("company_id", "entry_number");

-- CreateIndex
CREATE INDEX "journal_lines_company_id_idx" ON "journal_lines"("company_id");

-- CreateIndex
CREATE INDEX "journal_lines_journal_entry_id_idx" ON "journal_lines"("journal_entry_id");

-- CreateIndex
CREATE INDEX "journal_lines_account_id_idx" ON "journal_lines"("account_id");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Accounting integrity (FR-906 / docs/MODELS.md invariant #1), enforced at the
-- DATABASE level in addition to the service level: a POSTED journal entry must
-- have Σ debit_base == Σ credit_base, and must have at least one line. The
-- checks run as DEFERRABLE INITIALLY DEFERRED constraint triggers, so they fire
-- once at COMMIT — the posting transaction can insert lines and flip the status
-- in any order and is validated only once everything is in place.
-- ============================================================================

-- Checks the entry a set of lines belongs to (guards against mutating the lines
-- of an already-posted entry into an unbalanced state).
CREATE OR REPLACE FUNCTION assert_journal_balanced_from_line() RETURNS trigger AS $$
DECLARE
  v_entry uuid;
  v_status "JournalStatus";
  v_debit numeric;
  v_credit numeric;
BEGIN
  v_entry := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  SELECT status INTO v_status FROM journal_entries WHERE id = v_entry;
  -- Entry deleted (cascade) or still a draft: nothing to enforce.
  IF v_status IS DISTINCT FROM 'POSTED' THEN
    RETURN NULL;
  END IF;
  SELECT
    COALESCE(SUM(amount_base) FILTER (WHERE side = 'DEBIT'), 0),
    COALESCE(SUM(amount_base) FILTER (WHERE side = 'CREDIT'), 0)
  INTO v_debit, v_credit
  FROM journal_lines WHERE journal_entry_id = v_entry;
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'journal entry % is not balanced: debit_base=%, credit_base=%', v_entry, v_debit, v_credit;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Checks an entry when it is inserted/updated as POSTED (the main path: posting
-- flips status DRAFT -> POSTED).
CREATE OR REPLACE FUNCTION assert_journal_balanced_from_entry() RETURNS trigger AS $$
DECLARE
  v_debit numeric;
  v_credit numeric;
BEGIN
  IF NEW.status IS DISTINCT FROM 'POSTED' THEN
    RETURN NULL;
  END IF;
  SELECT
    COALESCE(SUM(amount_base) FILTER (WHERE side = 'DEBIT'), 0),
    COALESCE(SUM(amount_base) FILTER (WHERE side = 'CREDIT'), 0)
  INTO v_debit, v_credit
  FROM journal_lines WHERE journal_entry_id = NEW.id;
  IF v_debit = 0 AND v_credit = 0 THEN
    RAISE EXCEPTION 'journal entry % cannot be posted with no lines', NEW.id;
  END IF;
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'journal entry % is not balanced: debit_base=%, credit_base=%', NEW.id, v_debit, v_credit;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_lines_balanced
  AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_journal_balanced_from_line();

CREATE CONSTRAINT TRIGGER journal_entries_balanced
  AFTER INSERT OR UPDATE ON journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_journal_balanced_from_entry();

