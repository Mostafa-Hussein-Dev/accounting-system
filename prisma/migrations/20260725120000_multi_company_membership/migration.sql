-- Multi-company membership: a user can belong to many independent companies.
-- Replaces the single User.company_id with a UserCompany membership table and
-- moves a user's company off the user onto per-company role assignments.
-- This migration MIGRATES EXISTING DATA before dropping the old column.

-- 1. Platform-admin flag (replaces the "company_id IS NULL means admin" overload).
ALTER TABLE "users" ADD COLUMN "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;
UPDATE "users" SET "is_platform_admin" = true WHERE "company_id" IS NULL;

-- 2. Membership table.
CREATE TABLE "user_companies" (
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_companies_pkey" PRIMARY KEY ("user_id","company_id")
);
CREATE INDEX "user_companies_company_id_idx" ON "user_companies"("company_id");
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Backfill memberships from the existing single company.
INSERT INTO "user_companies" ("user_id", "company_id", "created_at")
SELECT "id", "company_id", CURRENT_TIMESTAMP FROM "users" WHERE "company_id" IS NOT NULL;

-- 4. Add user_roles.company_id NULLABLE first, backfill it from the user's company.
ALTER TABLE "user_roles" ADD COLUMN "company_id" UUID;
UPDATE "user_roles" ur SET "company_id" = u."company_id" FROM "users" u WHERE ur."user_id" = u."id";

-- Any role assignments belonging to a company-less (platform-admin) user cannot
-- be represented per-company and are dropped; platform admins get manage-all in
-- code, not via a role row.
DELETE FROM "user_roles" WHERE "company_id" IS NULL;

-- 5. Now make it NOT NULL and re-key the table on (user, role, company).
ALTER TABLE "user_roles" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_pkey",
ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id", "role_id", "company_id");
CREATE INDEX "user_roles_company_id_idx" ON "user_roles"("company_id");
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Finally drop the old single-company column off users.
ALTER TABLE "users" DROP CONSTRAINT "users_company_id_fkey";
DROP INDEX "users_company_id_idx";
ALTER TABLE "users" DROP COLUMN "company_id";
