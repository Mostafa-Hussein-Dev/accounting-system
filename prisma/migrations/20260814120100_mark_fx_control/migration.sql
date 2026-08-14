-- FR-801: mark each company's exchange-difference accounts as the realised FX
-- control accounts, so payment settlement can resolve where to post a foreign-
-- currency gain/loss. 775 = positive exchange differences (FX_GAIN, class 7),
-- 675 = negative exchange differences (FX_LOSS, class 6). Separate migration
-- because Postgres forbids USING the newly-added enum values in the same
-- transaction that adds them (see 20260814120000_add_payments). Idempotent.
-- New companies get this from account-defaults.ts (DEFAULT_CHART).

UPDATE "accounts"
SET "is_control" = true, "control_type" = 'FX_GAIN'
WHERE "number" = '775' AND "control_type" IS NULL;

UPDATE "accounts"
SET "is_control" = true, "control_type" = 'FX_LOSS'
WHERE "number" = '675' AND "control_type" IS NULL;
