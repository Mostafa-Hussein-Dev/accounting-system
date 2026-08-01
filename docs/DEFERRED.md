# Deferred Work

Features/wiring intentionally left incomplete because a module they depend on
does not exist yet. Revisit each when its blocking module is built so we don't
forget. Keep this list updated as modules land.

| # | Deferred item | Where | Blocked on | What to do when unblocked |
|---|---|---|---|---|
| 1 | ~~`Branch.stockLocationId` is a nullable UUID with **no foreign key**~~ — **RESOLVED (FR-402)**: FK to `locations` added and the column made **NOT NULL** (migration `20260801120000_add_stock`, which backfilled a default INTERNAL location per branch). `BranchesService.create` now provisions each new branch's default location. | `prisma/schema.prisma` (Branch), `src/modules/branches/` | — | — |
| 2 | ~~**Default VAT treatment per item**~~ — **RESOLVED (FR-401)**: `Item.vatTreatment` (STANDARD/ZERO/EXEMPT) + `Item.defaultTaxRateId` FK to `tax_rates` (migration `20260730140000_add_items`). Invoicing will default a sale/purchase line's VAT from these. | `prisma/schema.prisma` (Item) | — | — |
| 3 | ~~**Document numbers are not yet consumed**~~ — **RESOLVED (FR-901)**: the GL posting path now calls `SequencesService.nextNumber(...)` for `JOURNAL_ENTRY`. Still applies to invoicing/purchasing/payments when those are built. | Sequences module (FR-106) | Invoicing / Purchasing / Payments (FR-5xx/6xx/8xx) | When creating each document, call `nextNumber(companyId, branchId, docType, documentDate, tx)` inside its transaction (see `PostingService.post` for the reference pattern). |
| 4 | ~~**`JournalLine.partnerId`** has no FK~~ — **RESOLVED (FR-301)**: FK to `partners` added (migration `20260727130000_add_partners`). Partner balances/statements derive from `journalLine.partnerId`. **Still open:** no path yet WRITES partnerId onto a line (see "Partner postings" note below). | `prisma/schema.prisma` (JournalLine) | — | — |
| 5 | **`JournalLine.costCenterId`** is a nullable UUID with **no foreign key** | `prisma/schema.prisma` (JournalLine) | Cost-centre / analytic dimension model (not yet planned) | Add the FK once cost centres exist; expose it on the manual-JE line DTO then. |
| 6 | **`JournalEntry.sourceDocType` / `sourceDocId`** carry no FK — auto-posted entries can't yet link back to their source document | `prisma/schema.prisma` (JournalEntry) | Document models (FR-5xx/6xx/8xx) + posting rules (FR-902) | Add the FK to `documents` (or per-type) and set these when `PostingService.post` is invoked from a document's confirm flow. |

## Larger deferred features (need a design pass)

### FR-904 — Fiscal periods & period locking (deferred; GL hook left in place)
The GL engine (FR-901/906) enforces every ledger invariant **except period
locking**, because no `FiscalPeriod` model exists yet. `PostingService.post`
carries a `TODO(FR-904)` at the exact point the check belongs. When picked up:

- Add a `FiscalPeriod` model (company, start/end, status open/locked) and a
  year-end close (roll class 7 − class 6 into retained earnings; carry opening
  balances forward per currency).
- In `PostingService.post` **and** `reverse`, reject posting into a locked
  period unless a permissioned, audited unlock is present.
- Consider a DB-level guard mirroring the existing balance triggers.

### FR-902 — Automatic posting rules (deferred; posting core already built)
`PostingService.post()`/`reverse()` are the reusable core that documents will
call to create + post their journal entries. The **configurable per-company
account mapping** (legacy `DBLPOLICY`) is not built. When picked up: a posting-
rules table + a service that turns a confirmed document into balanced lines, then
calls `PostingService.post()` inside the document's transaction, stamping
`sourceDocType`/`sourceDocId` (deferred item #6).


### FR-1102 — Audit trail — BUILT (migration `20260727120000_add_audit_logs`)
Implemented as a hybrid (src/modules/audit): an `AuditLog` append-only model +
`AuditAction` enum; a global `AuditInterceptor` (APP_INTERCEPTOR) that best-
effort logs every authenticated mutating request (actor, action, entity, id,
after-state, IP, status — `before` null); and `AuditService.record()` for rich
before/after domain events, wired into `PostingService.post()`/`reverse()`
(and login, as an explicit LOGIN event). `GET /audit-logs` (paginated,
filterable) gated by the new `audit.read` perm (Company Admin only). Secrets
are redacted before write; `@Audit()`/`@NoAudit()` override or opt routes out.

**Remaining audit follow-ups (deferred):**
- **Public-route auditing** — the interceptor only logs *authenticated*
  mutations, so self-service `register` (creates a company + owner) and other
  public routes aren't captured. Add an explicit AuditService call in
  `AuthService.register` (like the LOGIN event) when wanted.
- **Rich before/after on non-financial modules** — they're covered coarsely by
  the interceptor (after-state only). Adopt `AuditService.record()` with
  before/after in each service's update/delete as those modules are next
  touched (companies, accounts, taxes, …).
- **Document domain events** — future invoicing/payments/void flows should emit
  CONFIRM/VOID via `AuditService.record()` inside their transactions, mirroring
  the GL post/reverse pattern, and carry `@NoAudit()` on the route.
- **Retention / archival policy** for the (unbounded, append-only) `audit_logs`
  table.

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

### Auth enhancements (deferred by decision, not blocked on a module)
Reviewed during an auth pass and intentionally postponed — the current auth
module (login, register, refresh, switch-company, logout, forgot/verify/reset
password, me, change-password, temp-password gate, multi-company) is considered
complete for now. A `/validate` endpoint was **declined** (GET `/auth/me`
already validates the token and returns the user + company context). Email
verification on self-service `register` was **declined**. Revisit these when
hardening auth for production:

- **Login OTP / 2FA (MFA):** a second factor on `/auth/login`. Large scope —
  TOTP secret storage, backup codes, "remember this device", enrolment/disenrol
  flows. Deferred; decide whether MFA is a product requirement first.
- **Rate-limit `/auth/login`:** the password-reset endpoints are throttled but
  login itself is not, leaving password brute-force unblunted. Apply a
  `ThrottlerGuard` + `@Throttle` per-route (mirror `RESET_THROTTLE` in
  `auth.controller.ts`), ideally keyed per email/account as well as per IP.
- **Session management:** no "list active sessions" or "logout everywhere"
  endpoint. `change-password` revokes other sessions, but there's no standalone
  revoke-all or session listing. Add `GET /auth/sessions` + `POST
  /auth/logout-all` over the existing refresh-token store.
- **Resend endpoints:** no resend-invitation / resend-verification. Add when
  the corresponding flows need it (e.g. an invitation email that got lost).
- **Admin disable user:** `User.isActive` exists on the model but no endpoint
  toggles it. Add an admin-gated activate/deactivate on the Users module so an
  account can be disabled without deletion (and have login/JWT validation reject
  inactive users).

### FR-301 — Partners (customers/suppliers) master — PLANNED (not blocking anything)
Full plan drafted and parked to build later. Next in the roadmap after this:
Items (FR-401) → Stock (FR-402) → Invoicing (FR-6xx).

**Key design decision (unresolved):** how a partner links to the ledger.
- **Option A — subsidiary ledger (recommended):** all customers post to the
  shared AR control account (41), all suppliers to AP (40); each journal line
  carries `partnerId`. Partner balance is **derived** = `Σ(debit−credit) where
  partnerId = X`. `Partner.ledgerAccountId` records *which* control account
  governs them (default by kind, overridable). Consistent with the built GL
  (control accounts are non-postable, balances derived — invariant #4) and it
  activates deferred item #4. **Adopt this unless there's a reason not to.**
- **Option B — account-per-partner (legacy HISAB literal):** each partner gets
  its own postable child account; balance = that account's balance. Contradicts
  the non-postable-control-account GL design and makes deferred #4 pointless.
  Not recommended.

**Also undecided:** (1) partner `code` — auto via Sequences (new PARTNER doc
type) vs user-supplied-unique vs optional-user-code-auto-if-blank; (2) whether
to include `PartnerAddress` in the first round or defer it.

**Scope when built (assuming Option A):**
- **Schema:** `Partner` (`id, companyId, code, name, nameAr/Fr/En, kind
  [CUSTOMER/SUPPLIER/BOTH], category, tin, contactName, phone, phone2, email,
  vip, creditLimit, creditCurrency, ledgerAccountId→account, isActive,
  timestamps, deletedAt` — soft-delete per MODELS.md). `PartnerAddress` (`id,
  partnerId, type [BILLING/SHIPPING/BRANCH], line1, city, country, region,
  phone, isDefault`). New enums `PartnerKind`, `AddressType`. **Add the FK on
  `JournalLine.partnerId → partners` → resolves deferred item #4.** Keep
  `regionId`/`salesmanId` as nullable no-FK columns (see deferred notes below).
- **Migration:** hand-written SQL per the Prisma-7 shadow-DB workflow, then
  `migrate deploy`.
- **Module** (`src/modules/partners/`, mirror the accounts module):
  controller/service/module/dto/index/spec. CRUD gated by new
  `partner.{create,read,update,delete}` perms (CASL `Partner` subject). On
  create, default `ledgerAccountId` from `kind` (customer→41, supplier→40),
  overridable. Addresses managed inline with one-default enforcement.
- **Ledger-derived reads (FR-303 foundation):** `GET /partners/:id/balance`
  (USD+LBP) and `GET /partners/:id/transactions` — aggregate `journal_lines` by
  `partnerId` (reuse `LedgerService` patterns).
- **Seed:** add `partner.*` to Company Admin, `partner.read` to Member.
- **Postman + Swagger + tests** in the same change.

**Deferred within/around FR-301 (record as their own rows/notes when built):**
- **Statement export** (PDF/Excel/email/WhatsApp — FR-303 AC) → needs a
  reporting/export layer.
- **Credit control enforcement** (FR-302 warn/block on invoice) → belongs to
  Invoicing; only **store** `creditLimit`/`creditCurrency` in FR-301.
- **Opening balances** → belong in the data-migration / GL opening-balance flow,
  not master-data CRUD.
- **`Partner.regionId`** → no `Region` model exists yet; nullable no-FK column.
- **`Partner.salesmanId`** → likely a future `User` FK; nullable no-FK column.

### Partner postings — how `partnerId` gets onto a journal line — RESOLVED (FR-301)
The manual journal-entry line now accepts an optional `partnerId` (validated: the
partner exists in the company), and the GL control-account rule changed from
"never postable" to **"a control-account (AR/AP/…) line MUST carry a partnerId"**
(a sub-ledger posting; error `CONTROL_ACCOUNT_REQUIRES_PARTNER`). Non-control lines
may optionally carry a partnerId. This is Odoo-aligned (receivable/payable move
lines always carry a partner) and makes `GET /partners/:id/balance` and
`/transactions` derive real balances. `PostingService.reverse` already copies
partnerId, so reversals stay attributed. Future documents/invoicing (FR-6xx) will
set partnerId automatically via `PostingService`.

### FR-303 — Partner statement (relevé) — mostly BUILT
`GET /partners/:id/statement?from&to` returns the full relevé: opening balance,
each posted transaction with a **role-oriented running balance**, closing balance
and totals — in **base USD and converted to LBP** (rate in force on `to`,
rateType default Official; null columns when no rate). `GET
/partners/:id/statement/export?format=pdf|excel` downloads it (pdfkit / exceljs).
`GET /partners/:id/transactions` still returns the raw paginated lines.
**Deferred (tied to other foundations):** emailing the statement (no mail server
yet — MailerService logs in dev; nodemailer already supports attachments),
WhatsApp delivery (needs a provider e.g. Twilio), and translated statement labels
(AR/FR/EN — tied to FR-107 i18n).

### FR-401 — Item master / catalogue — BUILT
Delivered across `src/modules/uom`, `src/modules/catalog`, `src/modules/items`,
`src/modules/pricing` (migrations `20260730120000`–`20260730170000`):
- **UoM** (uom_categories + uoms) with category-scoped conversion (Odoo uom).
- **Lookups**: item categories (self-nesting), brands, families, sizes, colours.
- **Item** master: code, trilingual names, category/brand/family, base + sales/
  purchase UoM (same-category enforced), cost/sale price in a priceCurrency,
  `vatTreatment` + `defaultTaxRateId` (resolves deferred #2), the size/colour/
  serial/expiry flags, image URLs; tenant-scoped, soft-deleted.
- **Variants** (size×colour, matrix generation), **barcodes** (multiple, primary,
  scanner lookup), **multi-currency pricelists** + a price resolver.

**Deferred (agreed with the user, tied to other foundations):**
- ~~**FR-402 stock ledger**~~ — **BUILT** (see the FR-402 section below).
- **Image upload/cloud storage** — items store image **URLs** only; actual
  upload/object storage is out of scope.
- **FR-406 barcode/label printing** — design + print templates.
- **Serial/expiry tracking DATA** — the item flags (`trackSerial`/`trackExpiry`)
  are stored; capturing actual serials/expiries happens at stock/invoice time.
- **Pricelist formula/percentage rules** — pricelists do FIXED prices only
  (Odoo's discount/formula rule types are not built).

### FR-402 — Stock ledger — BUILT
Delivered in `src/modules/stock` (migrations `20260801120000_add_stock`,
`20260801120100_seed_stock_sequences`):
- **Location** model — INTERNAL locations (per branch) + virtual counterparties
  (CUSTOMER/SUPPLIER/ADJUSTMENT/TRANSIT), Odoo `stock.location`. CRUD for
  INTERNAL only; virtual ones are seeded and read-only.
- **StockMovement** — append-only, double-entry (from/to location), qty in the
  item base UoM. **Moving-average (AVCO) valuation** per **(item, variant)**
  stream: inbound sets cost + recomputes the average, outbound/transfer valued
  at the current average; `avgCost` cached on Item/ItemVariant, total value =
  Σ movement value. Row-locked per stream for concurrency; **negative stock
  blocked** on internal locations.
- Endpoints: `POST /stock/movements`, `/stock/adjustments` (count-based),
  `/stock/transfers`; reads `GET /stock/movements`, `/stock/on-hand`,
  `/items/:id/stock`, `/stock/valuation?asOf=`. Resolves deferred #1.

**Deferred within/around FR-402 (revisit when the blocking work lands):**
- **GL valuation postings** — stock movements do **not** post to the general
  ledger yet. Real-time inventory valuation (stock interim/valuation accounts,
  COGS on issue) belongs to the document confirm flows (goods receipt / goods
  issue) via `PostingService` + posting rules (**FR-902**). Same pattern as
  partners: data now, GL wiring when documents exist. Stamp
  `StockMovement.sourceDocType`/`sourceDocId` then (they carry no FK yet).
- **FIFO / standard-cost** methods — only moving-average is implemented.
- **Lot / serial / expiry capture at movement time** — `Item.trackSerial`/
  `trackExpiry` flags exist; capturing actual serials/expiries on a movement is
  not built.
- **Reservations / delivery-order workflow, reorder rules, multi-step routes,
  landed costs** — out of scope for the ledger.

## Conventions
- When you add a placeholder/nullable FK because the target model doesn't exist
  yet, add a row here **and** a `NOTE`/`TODO(FR-xxx)` comment at the code site.
- When you build the blocking module, resolve the row here and remove it.
