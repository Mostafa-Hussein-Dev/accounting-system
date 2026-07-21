# Implementation Progress & Working Agreement

Living handoff doc so context survives across sessions. Update it as modules land.

## Where we are (as of 2026-07-21)

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
| — | Auth / Users / Roles / CASL RBAC | JWT access+refresh, password reset, platform-admin, seeded roles |

### Deferred (see docs/DEFERRED.md)
- **FR-107** i18n / translations — parked (backend catalogue vs frontend-bundled — design decision needed).
- **FR-1102** Audit trail — to build before financial modules write heavily; cross-cutting, doesn't block GL.
- Smaller: `Branch.stockLocationId` FK, item/category default VAT, document-number consumption.

### Next
- **FR-901 + FR-906 — GL / Journal engine** (the ledger core everything posts into). Then Partners (FR-301) → Items (FR-401) → Stock (FR-402) → Invoicing (FR-6xx).

### Path to a working invoice
GL engine → Partners → Items → Stock ledger → Invoicing.

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

## Next module sketch — FR-901 + FR-906 GL engine
Core accounting invariants to enforce (docs/MODELS.md): balanced entries
(Σdebit_base == Σcredit_base), posted=immutable (reverse-only), server-computed
money (4-field Money), derived balances (never stored). Likely shape:
`JournalEntry` + `JournalLine` (debit **or** credit), `POST /journal-entries`
(draft, balanced), `/:id/post`, `/:id/reverse`, `GET /accounts/:id/balance`
(derived), `GET /reports/trial-balance`. Money value object + a posting service
other modules will call. Plan it in detail before building.
