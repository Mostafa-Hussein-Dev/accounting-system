# Data Models and Business Rules

This file defines the core data patterns and business rules that Claude
must enforce in every relevant file. These are non-negotiable constraints
derived from the system's accounting requirements.

## The Money type
Every monetary value in this system is represented as a Money object.
Never use a plain number for a monetary field.

type Money = {
  amountOriginal: number;  // amount in the original transaction currency
  currency: string;        // ISO 4217: 'USD' or 'LBP'
  rate: number;            // exchange rate: LBP per 1 USD (e.g. 89500)
  amountBase: number;      // equivalent in company base currency (USD)
}

Conversion rules (rate = LBP per 1 USD):
- USD to LBP: amountLBP = amountUSD x rate
- LBP to USD: amountUSD = amountLBP / rate

Changing today's exchange rate must NEVER alter already-posted
amountBase values. Posted amounts are frozen at the rate used
at the time of posting.

## The 8 accounting invariants — enforced in every relevant service

These rules are absolute. Any service that touches financial data
must enforce them:

1. BALANCED ENTRIES
   For every journal_entry: sum(debit_base) must equal sum(credit_base).
   Reject any journal entry where this is not true. Enforce at both
   the service level and the database constraint level.

2. POSTED = IMMUTABLE
   Once a document or journal entry is posted (status = confirmed/posted),
   it cannot be edited or hard-deleted. The only correction mechanism is
   a reversing entry or a credit note. Enforce with a guard check at the
   start of every update/delete operation.

3. SERVER-COMPUTED MONEY
   All totals, VAT, discounts, FX conversions, and COGS are computed
   on the server exclusively. Never trust monetary values sent by
   the client. Recompute everything on the server before saving.

4. DERIVED BALANCES
   Account balances are never stored. They are always derived:
   balance = sum(debit_base) - sum(credit_base) over journal_line
   for that account. Never add a balance column to the accounts table.

5. DERIVED STOCK
   Stock on-hand is never stored. Always derived:
   on_hand = sum(qty_in) - sum(qty_out) over stock_movement
   for that item and location. Never add an on_hand column to items.

6. PERIOD LOCKING
   No posting is allowed into a locked fiscal period. Every posting
   operation must check the fiscal_period status before writing.
   Unlocking a period requires explicit permission and is audited.

7. CURRENCY INTEGRITY
   Every monetary DB column stores all 4 Money fields together.
   Never store just an amount without its currency, rate, and base amount.

8. TENANT ISOLATION
   Every record belongs to a company. Company-scoped data must be read and
   written through PrismaService.forTenant(companyId) (src/prisma/prisma.service.ts),
   a Prisma Client Extension that forces company_id into every where clause and
   every write for tenant-scoped models — a query through it cannot omit or
   override company_id, even by accident. The bare PrismaService (no
   .forTenant()) stays unscoped and is used deliberately for cross-tenant
   admin operations (e.g. platform admin views across companies). This is an
   application-level guarantee, not a database-level one — there is no
   Postgres RLS in this system. A query that bypasses forTenant() by mistake
   on a tenant-scoped model is trusted, not blocked by the database.

## Core entity relationships (plain language)

- A Company has many Branches
- A Branch has many POS Stations
- A User can belong to MANY Companies (via UserCompany membership), each fully
  independent — an owner may run several companies from one login. A platform
  admin/support user (`isPlatformAdmin`) has no membership and sees across
  tenants. A user acts within ONE active company at a time (chosen at login or
  via POST /auth/switch-company; carried in the JWT). Roles are held PER company
  (UserRole.companyId): a user can be Company Admin in one and Company Member in
  another. A Role is composed of Permissions; effective permissions are the
  union across the user's roles IN THE ACTIVE COMPANY. Every company-scoped
  request re-verifies membership (CompanyMembershipGuard)
- A Partner (customer or supplier) is also a ledger Account in the
  chart of accounts — they are the same entity
- A Document (invoice, purchase order, quotation, credit note) has
  many Document Lines
- A confirmed Document generates exactly one Journal Entry
- A Journal Entry has many Journal Lines (debit or credit, never both)
- A Stock Movement is created for every inventory change —
  never update a quantity directly
- A Payment is allocated to one or more Documents

## Soft delete rule
Tables that use soft delete (deleted_at column):
- documents (invoices, orders, quotations, credit notes)
- journal_entries
- payments
- stock_movements
- partners
- items

Hard delete is permitted only on:
- Configuration tables (currencies, tax rates, sequences)
- Draft documents that have never been confirmed

## Posting status machine
Documents follow this exact status flow:
draft -> confirmed -> partially_paid -> paid -> void

- draft: editable, no journal entry, no stock movement
- confirmed: posted, journal entry created, stock movement created,
  immutable
- partially_paid: one or more payments allocated, balance remaining
- paid: fully settled, balance = 0
- void: cancelled after posting, reversing journal entry created,
  stock movement reversed, audited and permissioned

No status can go backwards except via void (which creates a reversal,
it does not undo the original).

## PasswordResetToken
One row per issued password-reset code (`POST /auth/forgot-password` /
`POST /auth/verify-reset-code` / `POST /auth/reset-password`, see
`docs/API-DESIGN.md` → Password reset).
Same lifecycle shape as `RefreshToken` — short-lived, revocable
independent of anything else — but for a one-time 6-digit code instead of
a JWT.

- `code_hash` — bcrypt hash of the code, same as `User.password_hash`. The
  raw code is never stored, only ever held in memory long enough to email
  it once.
- A 6-digit code has low entropy on its own (1,000,000 possibilities) —
  hashing it protects against a database leak, but is not what makes the
  code safe to guess online. That's the combination of three things
  `AuthService` enforces together: a 15-minute `expires_at`, an `attempts`
  ceiling (5) before the row is treated as dead, and at most one live
  (unconsumed, unexpired) row per user at a time — requesting a new code
  immediately supersedes any earlier one.
- A successful reset revokes every `RefreshToken` for that user — a
  password reset ends every other existing session, not just future
  logins.
- `POST /auth/forgot-password` always returns the same response whether or
  not the email belongs to a real account; nothing about this table's
  state is ever observable from the response.
