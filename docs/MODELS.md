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
   Every record belongs to a company. Every query includes
   where: { company_id: user.companyId }. RLS enforces this
   at the DB level. No query may return data across company boundaries.

## Core entity relationships (plain language)

- A Company has many Branches
- A Branch has many POS Stations
- A User is assigned to one or more Companies, with a Role per Company
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
