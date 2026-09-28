-- FR-403: seed the inventory-variance control account (PCL 603) for every
-- existing company that does not already have it, parented to that company's
-- account 60, and mark it as the INVENTORY_ADJUSTMENT control account. New
-- companies get it from the chart defaults at registration. This is split from
-- the table migration because a newly added enum value ('INVENTORY_ADJUSTMENT')
-- cannot be USED in the same transaction that adds it (Postgres restriction).

INSERT INTO "accounts" (
  "id", "company_id", "number", "name", "name_ar", "name_fr", "name_en",
  "account_class", "type", "normal_balance", "parent_id",
  "is_control", "control_type", "is_active", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), c."id", '603',
  'Inventory variances (stock count adjustments)',
  'فروقات الجرد (تسويات جرد المخزون)',
  'Écarts d''inventaire (ajustements de comptage)',
  'Inventory variances (stock count adjustments)',
  6, 'EXPENSE', 'DEBIT', p."id",
  true, 'INVENTORY_ADJUSTMENT', true, now(), now()
FROM "companies" c
JOIN "accounts" p ON p."company_id" = c."id" AND p."number" = '60'
WHERE NOT EXISTS (
  SELECT 1 FROM "accounts" a WHERE a."company_id" = c."id" AND a."number" = '603'
);

-- If a 603 already exists (e.g. from the official chart import) but was never
-- marked as a control account, promote it now.
UPDATE "accounts"
SET "is_control" = true, "control_type" = 'INVENTORY_ADJUSTMENT'
WHERE "number" = '603' AND "control_type" IS NULL;
