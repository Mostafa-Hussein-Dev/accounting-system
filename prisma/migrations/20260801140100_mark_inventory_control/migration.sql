-- FR-501: mark each company's Merchandise account (number '37') as the
-- INVENTORY control account, so vendor bills can resolve where to DEBIT
-- inventory. Separate migration because Postgres forbids USING the newly-added
-- 'INVENTORY' enum value in the same transaction that adds it. Idempotent.
-- New companies get this from account-defaults.ts (DEFAULT_CHART).

UPDATE "accounts"
SET "is_control" = true, "control_type" = 'INVENTORY'
WHERE "number" = '37' AND "control_type" IS NULL;
