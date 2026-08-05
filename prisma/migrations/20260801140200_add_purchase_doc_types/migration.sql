-- FR-501: document types for goods-receipt and vendor-bill numbering. Added as
-- their own migration so the values are committed before any runtime code
-- (register/seed sequence provisioning) uses them.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'GOODS_RECEIPT';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'PURCHASE_INVOICE';
