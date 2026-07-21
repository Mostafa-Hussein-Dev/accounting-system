# Deferred Work

Features/wiring intentionally left incomplete because a module they depend on
does not exist yet. Revisit each when its blocking module is built so we don't
forget. Keep this list updated as modules land.

| # | Deferred item | Where | Blocked on | What to do when unblocked |
|---|---|---|---|---|
| 1 | `Branch.stockLocationId` is a nullable UUID with **no foreign key** | `prisma/schema.prisma` (Branch), `src/modules/branches/` | Inventory `Location` model (FR-401 / FR-404) | Add the FK to `locations`, backfill, and change the column from nullable to **NOT NULL** in the same migration. |
| 2 | **Default VAT treatment per item / category** (FR-105 acceptance criterion #2) is not implemented | Taxes module (FR-105) | Item master (FR-401) | Add a `defaultTaxRateId` / VAT-treatment field to `Item` (and/or category) referencing `tax_rates`, and default a sales/purchase line's VAT from it. |
| 3 | **Document numbers are not yet consumed** — `SequencesService.nextNumber()` exists and is gap-controlled but nothing calls it | Sequences module (FR-106) | Invoicing / Purchasing / Payments / GL (FR-5xx/6xx/8xx/9xx) | When creating a document, call `SequencesService.nextNumber(companyId, branchId, docType, documentDate, tx)` inside the document's transaction to assign its number. |

## Larger deferred features (need a design pass)

### FR-1102 — Audit trail (deferred, to be built before financial modules write heavily)
Not yet implemented. CONVENTIONS.md ("Audit log pattern") already specifies it,
but there is no `audit_log` table or interceptor. Scope when picked up:

- An `AuditLog` model: `user_id, company_id, action (CREATE/UPDATE/DELETE/
  CONFIRM/VOID/REVERSE), entity, entity_id, before (JSON), after (JSON), ip,
  timestamp`.
- A global **`AuditInterceptor`** that logs every mutating request (POST/PATCH/
  DELETE) on financial entities, plus sensitive actions (login, void, price
  override, period unlock).
- `GET /audit-log` (admin, filterable).

**Best landed before/alongside the GL + document modules** so every financial
mutation is captured from the start rather than retrofitted. It is cross-cutting
and does not block the GL engine, so building GL first is fine — but wire the
interceptor in before invoicing/payments go live.

### FR-107 — Languages & translations (left for further exploration)
Deliberately **not implemented** — parked to decide *how* it should work before
building. Open questions and scope:

- **UI-string catalogue (AC1):** "All UI strings come from a translatable
  catalogue (AR/FR/EN; TR optional)." Undecided whether this is **backend-owned**
  (a `Translation` table + API the frontends fetch, editable by admins without a
  redeploy) or **frontend-owned** (i18n string files bundled in the React/Flutter
  apps). If backend: a global (non-tenant) `Translation { locale, namespace, key,
  value }` with a bulk import endpoint, platform-admin managed.
- **Master-data translatable names (AC2):** Account / Branch / Currency already
  have `nameAr/nameFr/nameEn`. Still missing: **`Company.nameAr/nameFr/nameEn`**
  (add when this is picked up), and item/category names — which wait on Items
  (FR-401).
- **RTL + language switching (AC3):** pure frontend; `User.preferredLanguage`
  already exists to drive it.

Decision needed: backend catalogue vs frontend-bundled strings. Revisit as its
own task.

## Conventions
- When you add a placeholder/nullable FK because the target model doesn't exist
  yet, add a row here **and** a `NOTE`/`TODO(FR-xxx)` comment at the code site.
- When you build the blocking module, resolve the row here and remove it.
