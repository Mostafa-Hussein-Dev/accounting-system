# Implementation Progress & Working Agreement

Living handoff doc so context survives across sessions. Update it as modules land.

## Where we are (as of 2026-08-14)

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
| FR-801 + FR-503 | **Cash & Payments** | `src/modules/payments` — customer **receipts** (DR cash/bank · CR AR) + supplier **payments** (DR AP · CR cash/bank), allocated against open sales invoices / vendor bills or taken **on-account**. **Realised FX gain/loss** line (new `ControlType.FX_GAIN`→775 / `FX_LOSS`→675) balances the entry when a foreign-currency document is settled at a rate other than booked (§21.4). Posts a POSTED JE directly (invoicing pattern); **void** reverses via `PostingService.reverse`. `cashAccountId` must be a CASH/BANK account (full Bank model FR-804 deferred). Endpoints: `POST /payments`, `GET /payments`, `GET /payments/:id`, `GET /payments/open-items`, `POST /payments/:id/void`. Perms `payment.{read,create,void}`. New `DocumentType.SUPPLIER_PAYMENT` (PAY-); customer receipts reuse `PAYMENT_RECEIPT` (REC-). **Merged to main via PR #18.** |
| FR-905 | **Financial Statements** | `LedgerService.generalLedger`/`incomeStatement`/`balanceSheet` + `GET /reports/{general-ledger,income-statement,balance-sheet}`. **General ledger** = one account's posted lines over a period with opening/running/closing balance. **Income statement** = revenue(7) − expenses(6) over a period = net result (`rollUp` by class). **Balance sheet** = assets vs liabilities + equity as of a date, with the period result folded into equity as a "Result for the period" line so it balances (`isBalanced`). Pure reads (no schema); currency-aware like the trial balance (per-`baseCurrencyCode` groups, `?presentIn`). Trial balance was already done. Perm `JournalEntry.read`; `REPORT_INVALID_RANGE` on from>to. Export + whole-ledger listing deferred. Branch `feature/financial-statements` (stacked on `feature/vat-return`). |
| FR-903 | **VAT Return** | `LedgerService.vatReturn` + `GET /reports/vat-return?from&to[&presentIn&rateType&branchId]`. Output VAT (net credit on VAT_OUT/4427) − input VAT (net debit on VAT_IN/4426) over a period = net VAT payable/recoverable. Pure read over posted journal lines (no schema); credit notes/reversals/voids net out automatically. **Currency-aware** like the trial balance (per-`baseCurrencyCode` groups, `?presentIn` conversion). Perm reuses `JournalEntry.read`. Taxable-base breakdown + PDF/Excel export deferred. Branch `feature/vat-return`. |
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
- **Cash & Payments (FR-801 / FR-503) — DONE**, merged to main (PR #18; see Done table). The invoice→payment→ledger→statement loop is now closed for both AR and AP.
- **VAT return (FR-903) — DONE** (`feature/vat-return`; `GET /reports/vat-return`).
- **Financial statements (FR-905) — DONE** (`feature/financial-statements`; general ledger + income statement + balance sheet, on top of the trial balance).
- **Fiscal periods & close (FR-904)** ← next: period lock (GL hook already left) + year-end close (roll P&L → retained earnings; the balance-sheet "Result for the period" line becomes retained earnings once closed).
- Then the **reporting engine (FR-1001/1002)**, and the MVP-scope **POS (FR-701–704)** / **HR/Payroll (§17.2)**; Payroll + platform session/device management FRs pending in docs/NEEDED.md.

### Path to a working invoice
GL engine ✅ → Partners ✅ → Items ✅ → Stock ledger ✅ → Purchasing ✅ → **Invoicing ✅** → **Payments ✅**. Invoice→payment→ledger→statement is closed; next is reporting (VAT return FR-903, financial statements FR-905).

### Remaining roadmap (build order)
Ordered list of what's left. Per-FR status is in the "Full FR roadmap status"
section below; this is the sequencing.

**A. Financial reporting & close (immediate)**
1. ~~**VAT Return** (FR-903)~~ ✅ DONE — output 4427 − input 4426 for a period (`GET /reports/vat-return`).
2. ~~**Financial Statements** (FR-905)~~ ✅ DONE — general ledger + income statement + balance sheet (`GET /reports/*`), currency-aware.
3. **Fiscal periods & close** (FR-904) ← next — period lock (GL hook already left) + year-end close.
4. **Reporting engine** (FR-1001/1002) — report runner + standard reports/dashboards (sales/inventory/cash/aged AR-AP).

**B. Commercial depth (gaps in built modules)**
5. **Auto-posting rule engine** (FR-902) — configurable per-company mapping (`PostingService` core built).
6. **Stock counts & inter-branch transfers** (FR-403/404).
7. **Landed cost** (FR-502).
8. **Payments follow-ups** (FR-802 cheque lifecycle, FR-803 exchange desk, FR-804 Bank + reconciliation).
9. **Credit control enforcement** (FR-302), **pricing discount rules** (FR-405), **document-flow conversions** quote→order→delivery (FR-601), **barcode/label print** (FR-406), **serial/expiry capture** (FR-407).

**C. New MVP modules (reclassified in 2026-08-14)**
10. **Point of Sale** (FR-701–704, §17.1) — fully specced.
11. **HR & Payroll** (§17.2) — **FRs pending** → `docs/NEEDED.md`.
12. **Platform Session Management** + **Device Management** (FR-2xx) — **FRs pending** → `docs/NEEDED.md`.

**D. Admin / ops & cross-cutting**
13. **Admin panel + platform stats** (FR-1101), **Backups** (FR-1103).
14. **Exports** — PDF/print/email/WhatsApp (FR-604 + statement/invoice exports); needs mail/WhatsApp provider.
15. **Backend i18n** (FR-107) — translation catalogue (design decision parked).
16. **Data migration** (§22) — legacy Paradox → v2.

**Blocked on product-owner input:** Payroll, Session Management, Device Management (see `docs/NEEDED.md`).

### Remaining roadmap — combined with FR status
Same build order as above, annotated with each step's specific FRs and status.
Legend: ⚠ partial · ❌ not started · ✅ done (shown only where it clarifies a dependency).

**A. Financial reporting & close (immediate)**
| # | Step | FRs (status) |
|---|---|---|
| 1 | **VAT Return** | FR-903 ✅ (`GET /reports/vat-return`, currency-aware; base breakdown + export deferred) |
| 2 | **Financial Statements** | FR-905 ✅ (trial balance + general ledger + income statement + balance sheet; export deferred) |
| 3 | **Fiscal periods & close** ← next | FR-904 ❌ → also completes the last piece of FR-906 ✅ (period-locking) |
| 4 | **Reporting engine** | FR-1001 ❌ · FR-1002 ⚠ (only trial balance today) |

**B. Commercial depth (gaps in built modules)**
| # | Step | FRs (status) |
|---|---|---|
| 5 | **Auto-posting rule engine** | FR-902 ⚠ (`PostingService` core built; mapping engine ❌) |
| 6 | **Stock counts & inter-branch transfers** | FR-403 ❌ · FR-404 ❌ |
| 7 | **Landed cost** | FR-502 ❌ |
| 8 | **Payments follow-ups** | FR-802 ⚠ (cheque lifecycle) · FR-803 ❌ (exchange desk) · FR-804 ❌ (Bank + reconciliation) |
| 9 | **Credit control enforcement** | FR-302 ⚠ (limit stored; warn/block ❌) |
| 10 | **Pricing discount rules + bulk tools** | FR-405 ⚠ (price lists ✅; qty/total/period rules ❌) |
| 11 | **Document-flow conversions** (quote→order→delivery) | FR-601 ⚠ (invoice ✅; conversions ❌) |
| 12 | **Barcode & label printing** | FR-406 ❌ |
| 13 | **Serial/expiry capture** | FR-407 ❌ |

**C. New MVP modules (reclassified 2026-08-14)**
| # | Step | FRs (status) |
|---|---|---|
| 14 | **Point of Sale** | FR-701–704 ❌ (fully specced §17.1) |
| 15 | **HR & Payroll** | §17.2 — FRs **pending** (`NEEDED.md`) |
| 16 | **Platform Session Management** | FR-2xx — FRs **pending** (`NEEDED.md`) |
| 17 | **Platform Device Management** | FR-2xx — FRs **pending** (`NEEDED.md`) |

**D. Admin / ops & cross-cutting**
| # | Step | FRs (status) |
|---|---|---|
| 18 | **Admin panel + platform stats** | FR-1101 ⚠ (backend CRUD exists; panel + stats ❌) |
| 19 | **Backups** | FR-1103 ❌ |
| 20 | **Exports** (PDF/print/email/WhatsApp) | FR-604 ❌ + statement/invoice exports; needs mail/WhatsApp provider |
| 21 | **Backend i18n** | FR-107 ❌ (design parked) |
| 22 | **Data migration** | §22 ❌ |

**Every remaining FR at a glance**
- **Partial (⚠):** FR-302, FR-405, FR-601, FR-802, FR-902, FR-1002, FR-1101
- **Not started (❌):** FR-403, FR-404, FR-406, FR-407, FR-502, FR-604, FR-803, FR-804, FR-904, FR-1001, FR-1103, FR-107, FR-701–704, §22
- **Newly done (✅):** FR-903 (VAT return), FR-905 (financial statements)
- **Pending your FRs:** §17.2 Payroll, FR-2xx Session Management, FR-2xx Device Management

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
→ Purchasing (FR-501) ✅ → **Invoicing (FR-6xx) ✅** → **Payments (FR-801) ✅**.
Each document module posts via `PostingService`. The invoice-to-cash cycle is
closed; next is reporting (FR-903 VAT return, FR-905 financial statements).

## Full FR roadmap status (as of 2026-08-14)

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
| FR-302 | Credit control | 🟡 | Limit **stored**; warn/block on a new invoice not yet enforced |
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
| FR-503 | Supplier balances & payments | ✅ | Balance done; supplier payment built in Cash & Payments (FR-801) |

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
| FR-801 | Receipts & payments | ✅ | Receipts + supplier payments + allocation + on-account + realised FX gain/loss; void reverses. Merged (PR #18) |
| FR-802 | Cheque management | 🟡 | `method=CHEQUE` accepted (posts like cash); cheque lifecycle (pending/cleared/bounced/print) deferred |
| FR-803 | Currency exchange (USD↔LBP) | ⬜ | Standalone exchange desk deferred (FX gain/loss on settlement IS handled by FR-801) |
| FR-804 | Banks & reconciliation | ⬜ | Payment posts to a CASH/BANK account directly; Bank model + reconciliation deferred |

### §14 Accounting / General Ledger
| FR | Feature | Status | Note |
|---|---|---|---|
| FR-901 | Manual journal entries | ✅ | Draft→post→reverse, balanced, immutable |
| FR-902 | Automatic posting | 🟡 | PostingService core built + used by purchasing; configurable per-company rule engine deferred |
| FR-903 | VAT return | ✅ | `GET /reports/vat-return` — output − input VAT per period, currency-aware (`?presentIn`); ledger-derived. Taxable-base breakdown + export deferred |
| FR-904 | Fiscal periods & close | ⬜ | Deferred; hook left at post path |
| FR-905 | Financial statements | ✅ | Trial balance + **general ledger** + **income statement** + **balance sheet** (`GET /reports/*`), all currency-aware (byBaseCurrency + `?presentIn`). PDF/Excel export + whole-ledger listing deferred |
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

### §17 Point of Sale & HR/Payroll — **now in MVP** (scope change 2026-08-14)
| FR | Feature | Status | Note |
|---|---|---|---|
| FR-701 | POS sale screen | ⬜ | Touch sale; barcode/search/grid; line+total discount; USD/LBP running total; hold/recall; mixed-currency tender; posts like a cash invoice |
| FR-702 | Cash session (drawer) | ⬜ | Open float per station/cashier; track; close with denomination count + Z-report (variance) |
| FR-703 | POS offline mode | ⬜ | Cached catalogue, offline sales, station-prefixed numbers, auto-sync + deterministic conflict resolution |
| FR-704 | POS peripherals | ⬜ | ESC/POS receipt printer (WebUSB/Serial), HID scanner, WebSerial scale — Chromium+HTTPS only |
| FR-7xx | HR & Payroll | ⬜ | Employee records, attendance, Lebanese payroll (NSSF + income-tax withholding), MoF forms. **Detailed FRs pending — see docs/NEEDED.md** |
| FR-2xx | **User session management** (platform-wide) | ⬜ | Active-sessions view, revoke/logout-everywhere, idle/concurrent policy. **Detailed FRs pending — see docs/NEEDED.md** |
| FR-2xx | **Device management** (platform-wide) | ⬜ | Registered sign-in devices (web/mobile/POS-as-client), trust/approve/revoke. **Detailed FRs pending — see docs/NEEDED.md** |

> **Scope note (2026-08-14):** Point of Sale, HR/Payroll, and platform-wide
> **user session management + device management** were reclassified into the
> **MVP** (PRD §17). Financial statements (FR-905) and VAT return (FR-903) were
> already MVP (§14). POS is fully specified (FR-701–704); Payroll, session
> management, and device management FRs are still to be supplied by the owner
> (`docs/NEEDED.md`). NOTE: FR-702 (POS cash drawer) and FR-704 (POS peripherals)
> are POS-internal and are **not** the platform session/device modules.

### Big picture
- **Phase 0 (Foundations)** — essentially complete ✅ (tenancy, auth/RBAC,
  company/branch, chart, currencies/rates, numbering, audit; migration tooling is
  the open ops piece).
- **Phase 1 (Core commercial MVP)** — nearly complete: GL ✅, Partners ✅, Items ✅,
  Stock ✅, Purchasing ✅, **Invoicing ✅**, **Payments ✅**. Remaining: VAT return
  (FR-903) → financial statements (FR-905) → reporting.
- **Phase 2/3 (POS + HR/Payroll)** — now **in MVP** (scope change 2026-08-14),
  built after core commercial closes. POS spec is FR-701–704 (§17.1); Payroll FRs
  pending. Neither started.
- **Currency model** is now the full 3-layer standard (transaction currency per
  line · frozen + **locked** base currency · display-only `?presentIn`),
  consistent across account/partner balances, trial balance, statements and stock
  valuation (base-currency integrity Fix A/B/C).
- **Critical path to a working invoice-to-cash cycle:** Invoicing ✅ → **Payments
  (FR-801) ✅** → **next: FR-903/905 VAT return & financial statements**.
- **Cross-cutting items still open** on many done modules: PDF/Excel/WhatsApp
  exports, period locking (FR-904), and the configurable posting-rule engine
  (FR-902).
