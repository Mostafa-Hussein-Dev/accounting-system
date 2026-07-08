-- DropIndex
DROP INDEX "roles_name_key";

-- AlterTable
ALTER TABLE "roles" DROP COLUMN "scope",
ADD COLUMN     "company_id" UUID,
ADD COLUMN     "is_system" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "RoleScope";

-- CreateIndex
CREATE INDEX "roles_company_id_idx" ON "roles"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_company_id_name_key" ON "roles"("company_id", "name");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

