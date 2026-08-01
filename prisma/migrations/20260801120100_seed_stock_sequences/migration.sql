-- FR-402: give every existing company a STOCK_MOVEMENT document sequence (prefix
-- "STK-") so stock movements can draw a gap-controlled number immediately. This
-- is a SEPARATE migration from 20260801120000 because Postgres forbids USING a
-- newly-added enum value ('STOCK_MOVEMENT') in the same transaction that adds it.
-- New companies get this series from SequencesService.DEFAULT_SEQUENCES at
-- registration; this only backfills companies that already existed.

INSERT INTO "document_sequences" ("id", "company_id", "branch_id", "doc_type", "prefix", "suffix", "pad_width", "reset_period", "next_number", "period_key", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), c."id", NULL, 'STOCK_MOVEMENT', 'STK-', '', 4, 'YEARLY', 1, NULL, true, now(), now()
FROM "companies" c
WHERE NOT EXISTS (
    SELECT 1 FROM "document_sequences" ds
    WHERE ds."company_id" = c."id" AND ds."branch_id" IS NULL AND ds."doc_type" = 'STOCK_MOVEMENT'
);
