-- FR-904: mark each company's account 121 (retained earnings carried forward)
-- as the RETAINED_EARNINGS control account, so the year-end close can resolve
-- where to roll the net result. Separate migration because Postgres forbids
-- USING the newly-added enum value in the same transaction that adds it.
-- Idempotent. New companies get this from account-defaults.ts (DEFAULT_CHART).

UPDATE "accounts"
SET "is_control" = true, "control_type" = 'RETAINED_EARNINGS'
WHERE "number" = '121' AND "control_type" IS NULL;
