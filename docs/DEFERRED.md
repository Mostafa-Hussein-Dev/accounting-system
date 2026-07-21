# Deferred Work

Features/wiring intentionally left incomplete because a module they depend on
does not exist yet. Revisit each when its blocking module is built so we don't
forget. Keep this list updated as modules land.

| # | Deferred item | Where | Blocked on | What to do when unblocked |
|---|---|---|---|---|
| 1 | `Branch.stockLocationId` is a nullable UUID with **no foreign key** | `prisma/schema.prisma` (Branch), `src/modules/branches/` | Inventory `Location` model (FR-401 / FR-404) | Add the FK to `locations`, backfill, and change the column from nullable to **NOT NULL** in the same migration. |
| 2 | **Default VAT treatment per item / category** (FR-105 acceptance criterion #2) is not implemented | Taxes module (FR-105) | Item master (FR-401) | Add a `defaultTaxRateId` / VAT-treatment field to `Item` (and/or category) referencing `tax_rates`, and default a sales/purchase line's VAT from it. |
| 3 | **Document numbers are not yet consumed** — `SequencesService.nextNumber()` exists and is gap-controlled but nothing calls it | Sequences module (FR-106) | Invoicing / Purchasing / Payments / GL (FR-5xx/6xx/8xx/9xx) | When creating a document, call `SequencesService.nextNumber(companyId, branchId, docType, documentDate, tx)` inside the document's transaction to assign its number. |

## Conventions
- When you add a placeholder/nullable FK because the target model doesn't exist
  yet, add a row here **and** a `NOTE`/`TODO(FR-xxx)` comment at the code site.
- When you build the blocking module, resolve the row here and remove it.
