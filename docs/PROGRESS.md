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
| FR-6xx | **Invoicing (sales invoices + credit notes)** | Outbound mirror of Purchasing. Confirm posts a balanced GL entry — **DR AR (customer) · CR revenue (70) · CR output VAT (4427)** — and, for stock items, relieves inventory + posts **COGS (60) / inventory (37)** at moving-average (perpetual) via `StockService.postMovementInTx`. **Credit note** reverses the accounting + restocks. **Layered revenue/COGS account resolution** (item → category → company default; new optional `revenue/cogsAccountId` on Item + Category, defaults on accounts 70/60). `trackInventory` flag → services post revenue+VAT only. Posted = immutable. Merged via PR (`feature/invoicing`). Covers FR-602/603/605 + the AR/stock half of FR-601. |
| FR-1102 | **Audit trail** | `AuditModule` wired (cross-cutting change log). |
| URGENT | **Base-currency self-describing money** | See dedicated section below. Each posted amount records **which** base currency it was frozen in; balances report it and never mislabel or silently sum across currencies; optional `?presentIn=` presentation currency. Merged both backend + frontend. |
| — | **Base-currency integrity (Fix A/B/C)** | Completes the 3-layer currency model. **A:** base currency is **locked** once postings exist (`BASE_CURRENCY_LOCKED` on both company-update paths). **B:** trial balance is currency-aware (never sums across base currencies — per-currency `byBaseCurrency[]` groups + `?presentIn`); partner statement refuses a mixed-base partner (`STATEMENT_MIXED_BASE`). **C:** stock valuation/on-hand self-describe from the ledger `costCurrency` and refuse a mixed stream (`STOCK_MIXED_COST_CURRENCY`). Branch `fix/base-currency-integrity` — pushed, **pending PR/merge**. |
| — | Auth / Users / Roles / CASL RBAC | JWT access+refresh, password reset, platform-admin, seeded roles |
| — | **Multi-company membership** | A user belongs to many companies (`UserCompany`); per-company roles (`UserRole.companyId`); `User.isPlatformAdmin` flag (replaces "null company = admin"). Active company is token-scoped — auto for single-company, else `POST /auth/switch-company`; `CompanyMembershipGuard` re-verifies membership per request. `GET /companies` lists own; `POST /companies` = owner self-service (gated on `company.create`, auto-provisioned). `GET /auth/me` returns `activeCompanyId` + `companies`. CASL scopes permissions to the active company. |
| — | **User management + Invitations** | `/users` gated by `user.{create,read,update,delete}` (Member gets `user.read`). `GET /permissions` (permission.read) for the role builder. **Invitations** (consent-based): `POST /invitations` (admin, `user.create`) emails an accept link + temp password; `POST /invitations/accept` (public, token) creates the user on acceptance + grants membership/roles; list/revoke; `GET /invitations/durations`. `InvitationDuration` enum sets expiry. **Temp-password one-time use:** invited users get `User.mustChangePassword` — `JwtAuthGuard` blocks every route except `change-password`/`me`/logout with 403 `PASSWORD_CHANGE_REQUIRED` until `POST /auth/change-password` clears it (flag also in login/`me` response for the frontend). |

### Deferred (see docs/DEFERRED.md)
- **FR-904** Fiscal periods & period locking — GL leaves a `TODO(FR-904)` hook at the post path.
- **FR-902** Auto-posting rules — `PostingService` core is built; the per-company mapping engine is deferred.
- **FR-107** i18n / translations — parked (backend catalogue vs frontend-bundled — design decision needed).
- Smaller: `Branch.stockLocationId` FK, item/category default VAT, `JournalLine.partnerId`/`costCenterId` FKs, `JournalEntry.sourceDoc*` FK.

### Next
- **Cash & Payments (FR-8xx / FR-503)** — receipts from customers (DR cash/bank · CR AR) and payments to suppliers (DR AP · CR cash/bank), against invoices or on-account, with FX gain/loss when rates moved; posts via `PostingService`. This closes the invoice→payment→ledger→statement loop.
- Then **VAT return (FR-903)** and the remaining **financial statements (FR-905)** — both must follow the currency-aware reporting pattern (see docs/DEFERRED.md).

### Path to a working invoice
GL engine ✅ → Partners ✅ → Items ✅ → Stock ledger ✅ → Purchasing ✅ → **Invoicing ✅** → Payments (next).

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

## Base-currency self-describing money — BUILT (the former URGENT fix)
Closes the base-currency mislabel defect (originally tracked in `docs/URGENT.md`,
now removed since it is fully resolved — this section is the record). `amountBase`
was frozen at posting but nothing recorded **which** currency it was in, so
changing the mutable `Company.baseCurrencyCode` silently relabelled all historical
amounts (100 USD shown as "100 LBP"). Fixed by stamping `baseCurrencyCode` per
line, self-describing/`?presentIn` reads, and the integrity fixes A/B/C (lock +
currency-aware trial balance/statement + stock valuation).

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

## Full FR roadmap status (as of 2026-08-06)

Status against every PRD functional requirement (`docs/PRD.md` §7–§17).
Legend: ✅ Done · 🟡 Partial · ⬜ Not started. **Partial** usually means the
backend primitive exists but the full acceptance criteria depend on an unbuilt
module (invoicing/payments/reports) or a frontend/export piece.

### §7 Setup & Configuration
| FR | Feature | Status | Note |
|---|---|---|---|
| FR-101 | Companies (tenants) | ✅ | Multi-tenant, trilingual, base currency, TIN, deactivate |
| FR-102 | Branches | 🟡 | Entity + trilingual done; `stockLocationId` FK deferred; branch-scoped sales/reports pending those modules |
| FR-103 | Currencies & exchange rates | ✅ | Rate types, effective dates, `/current`, override; posted base amounts protected |
| FR-104 | Chart of accounts | ✅ | Full 759-account Plan Comptable Libanais, control accounts, nesting |
| FR-105 | Taxes (VAT) | 🟡 | Rates + 4426/4427 mapping + default 11% done; per-item/category default VAT deferred |
| FR-106 | Document numbering | ✅ | Gap-controlled sequences, 8 seeded series |
| FR-107 | Languages & translations | 🟡 | Master-data trilingual fields done; UI i18n is frontend; backend translation catalogue parked |
| FR-108 | Company settings & flags | ✅ | settings JSON, base currency, fiscal year, enabled modules |

### §8 Authentication & Users
| FR | Feature | Status | Note |
|---|---|---|---|
| FR-201 | Login & sessions | 🟡 | Login/refresh/forgot-password done; 2FA, password policy, idle logout, live "connected users" not done |
| FR-202 | Users & roles | 🟡 | Users, roles, CASL RBAC, invitations done; per-user permission overrides + branch assignment not complete |

### §9 Accounts (Customers/Suppliers/Ledger)
| FR | Feature | Status | Note |
|---|---|---|---|
| FR-301 | Customer/supplier master | ✅ | Partners + addresses + balances (USD/LBP, self-describing); "open invoices" tab awaits invoicing |
| FR-302 | Credit control | 🟡 | Limit stored; warn/block on sale needs invoicing |
| FR-303 | Account statement | 🟡 | Statement + running balance endpoint done; PDF/Excel/WhatsApp export not |

### §10 Inventory & Items
| FR | Feature | Status | Note |
|---|---|---|---|
| FR-401 | Item master | ✅ | Items, variants, barcodes, UoM, cost/sale, VAT treatment |
| FR-402 | Stock ledger & on-hand | ✅ | AVCO movements, derived on-hand, negative-stock block |
| FR-403 | Stock counts & adjustments | ⬜ | Adjustment movement primitive exists; count workflow + journal not |
| FR-404 | Inter-branch transfers | ⬜ | transfer_in/out reasons in enum only; no workflow |
| FR-405 | Pricing & discounts | 🟡 | Price lists/lines done; qty/total/period/customer discount rules + bulk price tools not |
| FR-406 | Barcode & label printing | ⬜ | Frontend label engine |
| FR-407 | Expiry & serial tracking | ⬜ | Flags may exist; capture + reporting not |

### §11 Purchasing
| FR | Feature | Status | Note |
|---|---|---|---|
| FR-501 | PO → receipt → purchase invoice | ✅ | Full flow + AVCO + GL posting + over-billing guard (PR #14) |
| FR-502 | Landed cost (imports) | ⬜ | Not started |
| FR-503 | Supplier balances & payments | 🟡 | Balance done; supplier payment needs Cash & Payments |

### §12 Invoicing & Sales
| FR | Feature | Status | Note |
|---|---|---|---|
| FR-601 | Document flow (quote→order→invoice→delivery) | 🟡 | Invoice built + balances/posts + stock-out; quotation→order→delivery-note conversion deferred |
| FR-602 | Invoice content & calculation | ✅ | Server-computed lines/totals, line discount, VAT snapshot, multi-currency (base + doc) |
| FR-603 | Confirm & post | ✅ | Draft→confirm posts AR/revenue/VAT + COGS/inventory; posted immutable |
| FR-604 | Deliver / print / send | ⬜ | PDF/print/email/WhatsApp — deferred (frontend/integrations) |
| FR-605 | Credit notes / returns | ✅ | Credit note reverses accounting + restocks (void/soft-delete of drafts) |

### §13 Cash & Payments
| FR | Feature | Status | Note |
|---|---|---|---|
| FR-801 | Receipts & payments | ⬜ | Scaffold only |
| FR-802 | Cheque management | ⬜ | |
| FR-803 | Currency exchange (USD↔LBP) | ⬜ | |
| FR-804 | Banks & reconciliation | ⬜ | |

### §14 Accounting / General Ledger
| FR | Feature | Status | Note |
|---|---|---|---|
| FR-901 | Manual journal entries | ✅ | Draft→post→reverse, balanced, immutable |
| FR-902 | Automatic posting | 🟡 | PostingService core built + used by purchasing; configurable per-company rule engine deferred |
| FR-903 | VAT return | ⬜ | Accounts mapped; report not built |
| FR-904 | Fiscal periods & close | ⬜ | Deferred; hook left at post path |
| FR-905 | Financial statements | 🟡 | Trial balance done + **currency-aware** (byBaseCurrency groups + `?presentIn`); balance sheet / income statement / GL report + export not (must follow the same pattern — docs/DEFERRED.md) |
| FR-906 | Accounting integrity | 🟡 | Balanced/immutable/server-money/derived/currency/tenant/audit enforced; period-locking pending FR-904 |

### §15 Reporting
| FR | Feature | Status | Note |
|---|---|---|---|
| FR-1001 | Report runner | ⬜ | Scaffold only |
| FR-1002 | Standard reports + dashboards | 🟡 | Only trial balance exists today |

### §16 Admin & Audit
| FR | Feature | Status | Note |
|---|---|---|---|
| FR-1101 | Admin panel (web) | 🟡 | Backend CRUD endpoints exist; web panel + platform-wide stats partial |
| FR-1102 | Audit trail | 🟡 | Module wired; full create/update/delete + before/after coverage not verified |
| FR-1103 | Backups | ⬜ | Ops task |

### §17 Future (post-MVP)
| Item | Status |
|---|---|
| Point of Sale | ⬜ Out of MVP scope |
| HR / Payroll | ⬜ Out of MVP scope |

### Big picture
- **Phase 0 (Foundations)** — essentially complete ✅ (tenancy, auth/RBAC,
  company/branch, chart, currencies/rates, numbering, audit; migration tooling is
  the open ops piece).
- **Phase 1 (Core commercial MVP)** — well past half: GL ✅, Partners ✅, Items ✅,
  Stock ✅, Purchasing ✅, **Invoicing ✅**. Remaining: **Payments**, then VAT
  return → financial statements → reporting.
- **Currency model** is now the full 3-layer standard (transaction currency per
  line · frozen + **locked** base currency · display-only `?presentIn`),
  consistent across account/partner balances, trial balance, statements and stock
  valuation (base-currency integrity Fix A/B/C).
- **Critical path to a working invoice-to-cash cycle:** Invoicing ✅ → **FR-8xx
  Payments (next)** → FR-903/905 VAT & statements.
- **Cross-cutting items still open** on many done modules: PDF/Excel/WhatsApp
  exports, period locking (FR-904), and the configurable posting-rule engine
  (FR-902).
