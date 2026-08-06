# Implementation Progress & Working Agreement

Living handoff doc so context survives across sessions. Update it as modules land.

## Where we are (as of 2026-08-06)

Backend for a multi-tenant, dual-currency (USD/LBP) Lebanese ERP (NestJS 11 +
Prisma 7 + PostgreSQL). We build **one FR module at a time**, in dependency
order, each on its own `feature/*` branch merged via PR to `main`.

### Done (merged to main)
| FR | Module | Notes |
|---|---|---|
| FR-101 | Companies | + **FR-108** settings/feature flags (baseCurrencyCode, fiscalYearStartMonth, `settings` JSON; GET/PATCH `/companies/:id/settings`) |
| FR-102 | Branches | trilingual names; `stockLocationId` nullable/no-FK (deferred) |
| FR-103 | Currencies & exchange rates | global `Currency`; tenant `ExchangeRate` + `/current` resolver |
| FR-104 | Chart of accounts | **full official 759-account Plan Comptable Libanais** (AR+EN); common subset auto-seeded at register, rest via `POST /accounts/import-official` (once per company) |
| FR-105 | Taxes / VAT | `TaxRate` (standard/zero/exempt), `/tax-rates/current`; default 11% auto-seeded, mapped to 4426/4427 |
| FR-106 | Document numbering | `DocumentSequence`; gap-controlled `nextNumber()` (SELECT…FOR UPDATE); 8 default series auto-seeded; preview endpoint |
| FR-901 + FR-906 | GL / Journal engine | `JournalEntry`+`JournalLine`; draft→post→reverse; server-computed 4-field Money (`common/money`); balanced-entry enforcement at service **and** DB (deferred constraint triggers); posted=immutable; derived `GET /accounts/:id/balance` + `GET /reports/trial-balance`; `journal.{read,create,update,delete,post,reverse}` perms (post/reverse independent). Reusable `PostingService` for future auto-posting. |
| FR-301 | **Partners** | Unified customer/supplier `Partner` (trilingual, addresses, VIP, credit limit, per-partner AR/AP account overrides). Balances are **derived** from posted GL lines: `GET /partners/:id/balance` (per-original-currency `byCurrency` **and** per-base-currency `byBaseCurrency`, plus `?presentIn=` conversion — see base-currency fix below), `GET /partners/:id/statement`, `GET /partners/:id/transactions`. |
| FR-401 | **Items / Catalog / UoM** | `Item` (+ variants) with unit-of-measure (`UomModule`) and moving-average cost (`costPrice`). `CatalogModule` groups items/categories. Cost feeds Stock (AVCO) and Purchasing (default unit cost). |
| FR-4xx | **Pricing / price lists** | `PricingModule` — price lists + lines, currency-aware. |
| FR-402 | **Stock ledger** | `StockMovement` sub-ledger, **moving-average (AVCO)** valuation per item/variant; `StockService.postMovementInTx()` is the reusable in-transaction entry point (inbound/outbound); negative-stock blocked; seeded internal locations (Inventory Adjustment, etc.). Valuation reports as-of a date. The stock ledger is the sub-ledger behind inventory account **37** (`ControlType.INVENTORY`). |
| FR-501 | **Purchasing** | `PurchaseOrder` → `GoodsReceipt` (posts an **inbound** `StockMovement` via `StockService`, AVCO) → `VendorBill` (posts GL via `PostingService`: **DR inventory 37** + DR input VAT 4426 + **CR AP** partner). PO unit cost is **optional**, defaulting from `item.costPrice`. **Over-billing guard**: a PO line can't be billed beyond its ordered qty/amount — counts non-cancelled (DRAFT+POSTED) bill lines, excluding the bill being confirmed. Merged via PR #14. |
| FR-1102 | **Audit trail** | `AuditModule` wired (cross-cutting change log). |
| URGENT | **Base-currency self-describing money** | See dedicated section below. Each posted amount now records **which** base currency it was frozen in; balances report it and never mislabel or silently sum across currencies; optional `?presentIn=` presentation currency. Merged both backend + frontend. |
| — | Auth / Users / Roles / CASL RBAC | JWT access+refresh, password reset, platform-admin, seeded roles |
| — | **Multi-company membership** | A user belongs to many companies (`UserCompany`); per-company roles (`UserRole.companyId`); `User.isPlatformAdmin` flag (replaces "null company = admin"). Active company is token-scoped — auto for single-company, else `POST /auth/switch-company`; `CompanyMembershipGuard` re-verifies membership per request. `GET /companies` lists own; `POST /companies` = owner self-service (gated on `company.create`, auto-provisioned). `GET /auth/me` returns `activeCompanyId` + `companies`. CASL scopes permissions to the active company. |
| — | **User management + Invitations** | `/users` gated by `user.{create,read,update,delete}` (Member gets `user.read`). `GET /permissions` (permission.read) for the role builder. **Invitations** (consent-based): `POST /invitations` (admin, `user.create`) emails an accept link + temp password; `POST /invitations/accept` (public, token) creates the user on acceptance + grants membership/roles; list/revoke; `GET /invitations/durations`. `InvitationDuration` enum sets expiry. **Temp-password one-time use:** invited users get `User.mustChangePassword` — `JwtAuthGuard` blocks every route except `change-password`/`me`/logout with 403 `PASSWORD_CHANGE_REQUIRED` until `POST /auth/change-password` clears it (flag also in login/`me` response for the frontend). |

### Deferred (see docs/DEFERRED.md)
- **FR-904** Fiscal periods & period locking — GL leaves a `TODO(FR-904)` hook at the post path.
- **FR-902** Auto-posting rules — `PostingService` core is built; the per-company mapping engine is deferred.
- **FR-107** i18n / translations — parked (backend catalogue vs frontend-bundled — design decision needed).
- Smaller: `Branch.stockLocationId` FK, item/category default VAT, `JournalLine.partnerId`/`costCenterId` FKs, `JournalEntry.sourceDoc*` FK.

### Next
- **Invoicing (FR-6xx)** — the sales side, mirror of Purchasing: customer invoice posts DR AR (partner) · CR revenue · CR output VAT (4427), and for stock items also an **outbound** `StockMovement` (AVCO cost-out) + COGS/inventory leg via `StockService`/`PostingService`. Then **Payments** (receipts against AR) follows.

### Path to a working invoice
GL engine ✅ → Partners ✅ → Items ✅ → Stock ledger ✅ → **Invoicing (FR-6xx, next)**.

## Working agreement (the rules the user has set)
1. **Requirements** from `docs/PRD.md` (FR-xxx + acceptance criteria).
2. **Conventions** from `docs/` — CONVENTIONS, ARCHITECTURE, MODELS, API-DESIGN. "When in doubt, follow the convention — don't invent."
3. **Dependency order** — build modules in correct order.
4. **Plan first** — short plan (how + technicalities + full module structure: API → service → relations → migration) *before* implementing; wait for go-ahead. For modules with a business angle, explain the business too.
5. **Full module structure** mirroring existing modules (dto/, controller, service, module, index, spec).
6. **Reuse NestJS elements** (guards/decorators/interfaces); no redundant new ones.
7. **Placeholder/nullable FKs** get a `TODO(FR-xxx)` at the code site **and** a row in docs/DEFERRED.md.
8. **Full testing** — a `*.service.spec.ts` **and** live end-to-end against the running server, before declaring done.
9. **Postman** — update `postman/collections/...` in the same change (forbidden to skip).
10. **Don't commit until told** — wait for explicit "commit and push"; feature branch → PR → main.
11. **Naming** — platform is "Accounting System"; never "Paradox"/"HKMSoft" (only "Corel Paradox 9" for the legacy system); neutral `example.com` emails.
12. **Idempotent seed data.**

## Key implementation patterns (how this codebase does things)
- **Tenant scoping:** tenant-scoped services use `clientFor(caller)` — platform admin (`companyId === null`) → bare `PrismaService` (targets a company via DTO/`?companyId`); company user → `prisma.forTenant(companyId)` (a Prisma extension that forces `company_id` into every read/write). `TENANT_SCOPED_MODELS` in `src/prisma/prisma.service.ts` lists the models. Add new tenant models there + as a CASL `Subjects` entry in `src/modules/casl/casl-ability.types.ts`.
- **Response envelope:** `{ data, meta }` / `{ data:null, error:{code,message,field} }` via global interceptor/filter. Errors thrown as Nest HttpExceptions with a `{code,message,field}` body; codes are SCREAMING_SNAKE_CASE, domain-prefixed.
- **RBAC:** `@RequirePermissions({action,subject})` + `PermissionsGuard`; permissions seeded in `prisma/seed.ts` (Company Admin gets all; Company Member gets `*.read` + reads). Platform admin passes everything via CASL `manage all`.
- **Config tables** (currencies, tax rates, sequences) → **hard delete**; financial/master records → soft delete (`deletedAt`).
- **Migrations:** the local DB user can't create Prisma's shadow DB, so generate migrations with `npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script > migration.sql` then `npx prisma migrate deploy`. (Not `migrate dev`.)
- **Prettier/churn caution:** never run repo-wide `npm run format` (it reformats ~130 pre-existing files that aren't prettier-clean). Format only the module you touched: `npx prettier --write "src/modules/<mod>/**/*.ts"`, and stage only your feature's files.
- **Auto-seed on register:** `AuthService.register` (one transaction) creates company+owner, assigns Company Admin, then seeds chart (`applyDefaultChart`), default VAT (`applyDefaultVatRate`), and default sequences (`applyDefaultSequences`). New tenant modules that need starter data hook in here.
- **Control accounts** (official numbers): 40 suppliers (AP), 41 customers (AR), 512 banks (BANK), 531 cash (CASH), 4426 input VAT (VAT_IN), 4427 output VAT (VAT_OUT).

## Seeded demo data (local)
- 1 super admin: `admin@example.com` / `Admin@12345` (companyId null).
- 2 tenants (Demo Company / Second Company), each with full 759 chart + VAT + 8 sequences:
  - `owner@demo.example.com` / `owner2@demo.example.com` — Company Admin (`Owner@12345`)
  - `member@demo.example.com` / `member2@demo.example.com` — Company Member (`Member@12345`)

## GL engine — BUILT (FR-901 + FR-906)
Module `src/modules/gl` + shared `src/common/money`. Enforces the ledger
invariants: balanced entries (Σdebit_base == Σcredit_base) at service **and** DB
(deferred constraint triggers in the migration), posted=immutable (reverse-only),
server-computed 4-field Money, derived balances (never stored). Endpoints:
`POST /journal-entries` (draft, balanced), `PATCH`/`DELETE` (draft only),
`/:id/post`, `/:id/reverse`, `GET /accounts/:id/balance`, `GET /reports/trial-balance`.
`PostingService.post()`/`reverse()` are the reusable core future document
modules call. Not done here (deferred): period locking (FR-904), auto-posting
rules (FR-902) — hooks/TODOs left in place.

## Base-currency self-describing money — BUILT (URGENT fix)
Closes the mislabel defect in `docs/URGENT.md`: `amountBase` was frozen at
posting but nothing recorded **which** currency it was in, so changing the
mutable `Company.baseCurrencyCode` silently relabelled all historical amounts
(100 USD shown as "100 LBP").

- **Schema:** every posted amount now carries its base currency next to the
  frozen figure — `baseCurrencyCode` on `JournalLine`, `PurchaseOrder`,
  `VendorBill` (FK → `Currency`, indexed). Stamped at posting from the company
  base at that moment and **never rewritten** (like the rest of the Money 4-tuple).
- **Tier 1 — self-describing reads:** `GET /accounts/:id/balance`,
  `GET /partners/:id/balance`, `GET /reports/trial-balance` report the stored
  base currency and **group by it**. Uniform base → scalar totals + `currency`;
  **mixed base** (company changed its base over the record's life) → scalar
  totals are `null` and a `byBaseCurrency[]` breakdown is returned, **never
  summed across currencies**.
- **Tier 2 — presentation currency:** optional `?presentIn=XXX` (+ `?rateType=`)
  converts a balance into a chosen currency via a **USD-pivot** exchange-rate
  lookup (`src/common/money/present-currency.ts`, `resolvePresentationRate`);
  returns the rate + rateDate, and figures are **null when a rate is missing**
  (never a silent fallback of 1). Only the account + partner balance endpoints
  accept it (not trial balance).
- **Frontend:** balance cards read the currency straight from the payload;
  present a single figure in the active company currency via `?presentIn=`, with
  the frozen per-currency components shown beneath a converted total and the rate
  named — falling back to the per-currency breakdown when no rate exists. The old
  `useBaseCurrency` (which labelled amounts from the mutable setting) is deleted.

## Path to a working invoice (updated)
GL engine ✅ → Partners (FR-301) ✅ → Items (FR-401) ✅ → Stock ledger (FR-402) ✅
→ **Invoicing (FR-6xx, next)**. Each document module posts via `PostingService.post()`.
