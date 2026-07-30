-- CreateTable
CREATE TABLE "item_categories" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "name_fr" TEXT,
    "name_en" TEXT,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "name_fr" TEXT,
    "name_en" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "families" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "name_fr" TEXT,
    "name_en" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sizes" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "name_fr" TEXT,
    "name_en" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colours" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "name_fr" TEXT,
    "name_en" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_categories_company_id_idx" ON "item_categories"("company_id");

-- CreateIndex
CREATE INDEX "item_categories_parent_id_idx" ON "item_categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_categories_company_id_name_key" ON "item_categories"("company_id", "name");

-- CreateIndex
CREATE INDEX "brands_company_id_idx" ON "brands"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "brands_company_id_name_key" ON "brands"("company_id", "name");

-- CreateIndex
CREATE INDEX "families_company_id_idx" ON "families"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "families_company_id_name_key" ON "families"("company_id", "name");

-- CreateIndex
CREATE INDEX "sizes_company_id_idx" ON "sizes"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sizes_company_id_name_key" ON "sizes"("company_id", "name");

-- CreateIndex
CREATE INDEX "colours_company_id_idx" ON "colours"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "colours_company_id_name_key" ON "colours"("company_id", "name");

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "item_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "families" ADD CONSTRAINT "families_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sizes" ADD CONSTRAINT "sizes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colours" ADD CONSTRAINT "colours_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

