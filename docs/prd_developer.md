# Paradox v2 ("HKMSoft Next") — Detailed Product Requirements Document (Developer Edition)

**A complete specification for rebuilding the legacy Paradox/HKMSoft desktop system as a modern web application. The MVP is the accounting and core commercial system (customers/suppliers, inventory, purchasing, invoicing, cash & payments); Point of Sale and Payroll are future work.**

| | |
|---|---|
| **Document** | Detailed PRD — Developer Edition |
| **Product** | Paradox v2 / HKMSoft Next |
| **Version** | 2.1 — Detailed |
| **Status** | For development |
| **Date** | June 2026 |
| **Replaces** | Corel Paradox 9 / ObjectPAL thick-client ("Paradox / HKMSoft") |
| **MVP scope** | Accounting + core commercial (sales, purchasing, inventory, cash & payments) |
| **Future work** | Point of Sale, HR/Payroll (§17) |
| **Audience** | Developers (frontend, backend, mobile), QA, project manager, accounting stakeholder |
| **Initial tenants** | LUMICA, SOLIGHT-DEVICE |

---

## How to read this document

- **Section 3** is a glossary of business/accounting terms — keep it open while reading.
- **Sections 7–16** are the functional requirements, written as numbered features (`FR-xxx`) each with **acceptance criteria** (a testable checklist QA will verify).
- **Section 17** lists future work (post-MVP).
- **Sections 18–19** describe user flows and screens.
- **Sections 20–26** are the technical spec: data model (with fields), exact calculation formulas, migration, integrations, non-functional requirements, architecture, and the API.
- Words written as `code` refer to a legacy table/field or a technical identifier.

**Conventions used throughout**

- **Currency rate convention:** an exchange rate is always stored and written as **"LBP per 1 USD"** (e.g. `89,500` means 1 USD = 89,500 LBP). To convert: `USD = LBP ÷ rate`, and `LBP = USD × rate`. This convention is used everywhere — do not invert it.
- **Base currency:** each company has one **base currency** (the currency its books are kept in). For both initial tenants assume **USD** unless configured otherwise.
- **Money storage:** every monetary value is stored together with its original currency, the rate used, and the equivalent in base currency (see §20).
- **"Post" / "posting":** to *post* a document means the system automatically creates the accounting journal entry for it. "Posted" records are final and cannot be edited, only reversed.

---

# PART A — ORIENTATION

## 1. Executive Summary

The business runs on a ~25-year-old Corel Paradox 9 desktop program (≈1,347 data tables, 1,069 screens, 2,838 reports). It manages a company's **sales, inventory, purchasing, cash, and full accounting**, in **Arabic / French / English**, in **two currencies (US Dollar and Lebanese Pound)**, for **multiple companies and branches**. It is a single-PC/LAN program with no internet capability; all "integrations" are done by scripts writing text files.

Paradox v2 rebuilds this as a secure, multi-user **web application** backed by a proper relational database, while preserving the **Lebanese accounting behaviour** that the current system already implements. The first release (MVP) focuses on the **accounting and core commercial workflow**; Point of Sale and Payroll are planned as later work (§17). This document specifies it in full.

## 2. What This Application Is (in plain words)

Think of it as the software that runs the back office of a trading company in Lebanon. Concretely, it lets staff:

- Keep a list of **customers and suppliers**, each with a running balance (how much they owe us / we owe them), in USD and LBP.
- Keep a catalogue of **products ("items")** with prices, barcodes, sizes/colours, and **how many are in stock** in each branch.
- **Buy** goods from suppliers (purchase orders → receive stock → supplier invoice).
- **Sell** goods to customers (quotation → invoice → delivery).
- Take **payments** (cash, card, cheque, bank transfer), including **currency exchange** between USD and LBP.
- Automatically keep the **accounting books** (every sale, purchase, and payment updates the general ledger using double-entry bookkeeping), calculate **VAT**, and produce financial reports (balance sheet, income statement, customer statements, VAT return).
- Do all of the above for **several companies/branches**, with **user accounts and permissions**, an **audit trail**, and **backups**.

The MVP covers the accounting and core commercial modules above. Additional capabilities such as **Point of Sale** and **Payroll** are planned as later work (§17).

## 3. Glossary of Business & Accounting Terms

| Term | Plain meaning |
|---|---|
| **Account (ledger account)** | A "bucket" the system tracks money in — e.g. "Cash", "Sales", "VAT". Every account has a running balance. Not to be confused with a user login. |
| **Customer / Supplier account** | A specific kind of ledger account representing one customer (who may owe us money) or one supplier (whom we may owe). |
| **Chart of accounts** | The full, organised list of all ledger accounts a company uses. |
| **Debit / Credit** | The two sides of every accounting entry. Not "good/bad" — just left/right. |
| **Journal entry** | One accounting record made of two or more lines whose debits equal credits. |
| **General ledger (GL)** | The complete history of all journal entries; the company's official books. |
| **Posting** | Automatically creating the journal entry for a sale/purchase/payment. |
| **Receivable (AR)** | Money customers owe us. |
| **Payable (AP)** | Money we owe suppliers. |
| **VAT / TVA** | Value Added Tax — a sales tax (currently 11% in Lebanon). |
| **Output VAT** | VAT we charge customers on sales (we owe it to the government). |
| **Input VAT** | VAT we pay suppliers on purchases (we can reclaim it). |
| **COGS** | Cost of Goods Sold — what the items we sold originally cost us. |
| **Stock / Inventory** | Goods we hold to sell. **Stock on hand** = how many units we currently have. |
| **Base currency** | The currency a company keeps its books in (USD for our tenants). |
| **Exchange rate** | How many LBP equal 1 USD (e.g. 89,500). |
| **FX gain / loss** | Profit or loss that appears purely because exchange rates changed. |
| **Trial balance** | A report listing every account's balance, used to check the books balance. |
| **Balance sheet** | Snapshot of what the company owns and owes at a date. |
| **Income statement (P&L)** | Report of revenue minus expenses over a period = profit/loss. |
| **Fiscal period / year** | The month/year the books are organised into; can be "locked". |
| **Company / tenant** | One business whose data is kept separate from others. |
| **Branch** | A physical location of a company. |
| **NSSF** | Lebanon's National Social Security Fund (payroll deductions). |
| **HISAB** (حساب) | Arabic for "account"; the legacy system's main account table. |
| **LL / DOL** | Legacy labels: LL = Lebanese pound (LBP), DOL = US dollar (USD). |

---

# PART B — PRODUCT DEFINITION

## 4. Goals, Non-Goals & Success Metrics

### 4.1 Goals
- **G1.** Reproduce the legacy **Lebanese dual-currency (USD/LBP) double-entry accounting**, with VAT, a Lebanese chart of accounts, and statutory reports — correctly and automatically.
- **G2.** Deliver the full **core commercial workflow**: customers/suppliers, inventory with real stock tracking, purchasing, invoicing, cash & payments.
- **G3.** Be a **secure, multi-company, multi-branch web platform** with role-based permissions and a complete audit trail.
- **G4.** Be fully **trilingual (AR/FR/EN)** with right-to-left (RTL) support for Arabic.
- **G5.** **Migrate** legacy data accurately, with balances reconciled.

### 4.2 Non-Goals (MVP)
- **Point of Sale (POS)** and **Payroll** — planned as later work (§17), not in the MVP.
- One-to-one recreation of all 2,838 legacy reports / 1,069 screens (they will be rationalised to the distinct set in use).
- A public customer storefront (Shopify stays the e-commerce front; we sync with it).

### 4.3 Success Metrics
| Metric | Target |
|---|---|
| Accounting parity | Migrated trial balance reconciles to legacy per company, per currency (USD & LBP) at cut-over |
| Core workflow | 100% of daily core operations (invoice → payment → ledger → statement) work without the old system |
| Performance | Search < 300 ms p95; invoice post < 1 s p95; standard report < 5 s per period |
| Tax accuracy | VAT return matches the accountant's manual figures for a test period |

## 5. User Personas

> Personas describe *who* uses the system and what they need, so UI and permissions fit real users.

**5.1 Rana — Accountant / Finance (power user).** Age 38. Keeps the books for both companies. **Goal:** accurate ledgers, VAT returns, and month-end close with minimal manual entry. **Pain points:** the old system needs manual reindexing and produces dozens of near-identical reports; reconciling USD vs LBP is tedious. **Needs:** automatic posting, dual-currency statements, a clear trial balance, period locking, and the ability to make/reverse manual journal entries.

**5.2 Lina — Sales / Invoicing clerk.** Age 31. Handles wholesale customers. **Goal:** turn a quote into an invoice and delivery quickly, track who owes what. **Pain points:** re-keying data across documents. **Needs:** quotation→invoice→delivery flow, customer balances and statements, send invoice by email/WhatsApp/PDF.

**5.3 Sami — Warehouse / Inventory keeper.** Age 29. Receives goods, does stock counts. **Goal:** know exactly what's in stock at each branch. **Pain points:** stock numbers drift from reality. **Needs:** receive purchases, transfer between branches, do counts with a scanner, print barcode labels, see stock by branch.

**5.4 Nadia — Purchasing officer.** Age 35. Orders from local and foreign suppliers. **Goal:** place orders, receive them, match supplier invoices, including import costs. **Needs:** purchase orders, goods receipts, landed-cost allocation, supplier balances.

**5.5 Tony — Branch / Store Manager.** Age 42. Runs one branch. **Goal:** see today's sales, cash position, stock alerts; approve discounts and voids. **Needs:** branch dashboard, approvals, branch-scoped reports.

**5.6 George — Business Owner / System Administrator.** Age 50. Owns the companies (LUMICA, SOLIGHT-DEVICE). **Goal:** oversee everything, control users, ensure data is safe and tax-compliant. **Needs:** multi-company view, user/role management, audit trail, backups, configuration.

## 6. Roles & Permissions

The system uses **role-based access control (RBAC)** with optional per-permission overrides per user (the legacy system had very granular per-form permissions — `ACCPRIV`, `HISPRIV`, `ITMPRIV`, `PrintPermission`).

Default roles: **System Administrator, Accountant, Sales clerk, Purchasing officer, Inventory/Warehouse, Branch Manager, Read-only/Auditor.** (Roles for future modules, e.g. Cashier and HR/Payroll, are added when those modules are built — §17.)

Independently-permissioned sensitive actions: price override, discount beyond a threshold, void/refund, view item cost, post/reverse journal entries, unlock a period, manage users, run backups, see other branches/companies.

---

# PART C — FUNCTIONAL REQUIREMENTS

> Format: each feature has an ID (`FR-xxx`), a short description, and **Acceptance Criteria** — a checklist QA verifies. `[ ]` = a testable condition.

## 7. Module: Setup & Configuration

**FR-101 — Companies (tenants).**
Description: Create and manage companies whose data is isolated from each other (replaces the legacy `COMP` field on every table).
Acceptance Criteria:
- [ ] Create a company with: name, name in AR/FR/EN, logo, **base currency**, tax/VAT registration number (TIN), address, phone, email.
- [ ] All business data (accounts, items, documents, ledger) is scoped to a company.
- [ ] A user sees/acts only within companies they are assigned to.
- [ ] A company can be deactivated without deleting its data.

**FR-102 — Branches.**
Description: Define branches/locations per company (legacy `PosBranch`, `STATIONS`).
Acceptance Criteria:
- [ ] Create branches with name (AR/FR/EN), address, and stock location.
- [ ] Stock, sales, and reports can be filtered by branch.

**FR-103 — Currencies & exchange rates.**
Description: Manage currencies (USD, LBP, others) and dated exchange rates (legacy `SARFE`, `FOBRATE`, `BALBYRATE`).
Acceptance Criteria:
- [ ] Define currencies with code, symbol, and decimal places (USD 2 decimals; LBP 0).
- [ ] Maintain **multiple named rate types** (e.g. *Official*, *Market*, *Custom*) each as **LBP-per-1-USD**, with an **effective date** and full rate history.
- [ ] The system selects the rate in force on a document's date by default, and allows an **operator override** per document.
- [ ] Changing today's rate does **not** alter already-posted base-currency amounts.

**FR-104 — Chart of accounts.**
Description: The list of ledger accounts, pre-seeded with a standard Lebanese chart and fully customisable (legacy `chart`, `MenuAccount`, `GroupAccount`).
Acceptance Criteria:
- [ ] Ship a default **Plan Comptable Libanais** (classes 1–7) the company can edit.
- [ ] Each account has: number, names in AR/FR/EN, class, **type** (asset/liability/equity/revenue/expense), **normal balance** (debit/credit), optional currency restriction (USD-only / LBP-only / multi), parent account, active flag.
- [ ] Accounts can be nested (parent/child) and rolled up for reporting.
- [ ] **Control accounts** (AR, AP, VAT, cash, bank) are flagged and cannot be posted to directly except via their sub-ledger.

**FR-105 — Taxes (VAT).**
Description: Configure VAT rates and treatments.
Acceptance Criteria:
- [ ] Define VAT rates per company with effective dates: standard (default **11%**, editable to 12%+), zero-rated (0%), exempt.
- [ ] Assign a default VAT treatment to each item/category.
- [ ] Map output-VAT and input-VAT accounts (class 44).

**FR-106 — Document numbering.**
Description: Configurable sequences per document type, per company/branch (legacy `docnum`, `DOCNUM_ADD`).
Acceptance Criteria:
- [ ] Define sequences with prefix, next number, suffix, and reset period (none/yearly/monthly) per document type.
- [ ] Numbers are gap-controlled and never reused.

**FR-107 — Languages & translations.**
Description: Trilingual UI and data (legacy `Language`).
Acceptance Criteria:
- [ ] All UI strings come from a translatable catalogue (AR/FR/EN; TR optional).
- [ ] Master data (account, item, category names) has translatable name fields.
- [ ] Switching language flips the UI and **Arabic renders RTL**.

**FR-108 — Company settings & feature flags.**
Description: Per-company defaults, branding, and module/field visibility toggles (legacy `OptionVisible`, `HEADER`, `options`).
Acceptance Criteria:
- [ ] Per-company: default templates, rounding rules, fiscal-year start, enabled modules.
- [ ] Features/fields can be shown/hidden per company.

## 8. Module: Authentication & Users

**FR-201 — Login & sessions.**
Acceptance Criteria:
- [ ] Log in with username/email + password (hashed); issue short-lived access token + refresh token.
- [ ] "Forgot password" reset flow.
- [ ] Optional 2FA for privileged roles; configurable password policy; idle-session logout.
- [ ] Live "connected users" view for admins (legacy `ConnectedUsers`).

**FR-202 — Users & roles.**
Acceptance Criteria:
- [ ] Admin creates users, assigns to company/branch(es) and one or more roles.
- [ ] Per-user permission overrides (grant/revoke individual permissions).
- [ ] Deactivate users without deleting history.

## 9. Module: Accounts (Customers, Suppliers, Ledger)

**FR-301 — Customer/supplier master.**
Description: One master record per customer or supplier, which is also a ledger account (legacy `HISAB` and its language variants consolidated into one with translations).
Acceptance Criteria:
- [ ] Create accounts with: code, names (AR/FR/EN), type (customer/supplier/both), classification/category, TIN, contact name, phone(s), email, region, assigned salesman, VIP flag, credit limit, active.
- [ ] An account shows its **balance in USD and LBP**, open invoices, and full transaction history.
- [ ] Multiple **addresses** per account (billing/shipping/branch) with a default (legacy `ADDRESS`, `PADDRESS`, `AddressBranch`).

**FR-302 — Credit control.**
Acceptance Criteria:
- [ ] Configurable credit limit; on a new invoice/sale, **warn or block** when the limit would be exceeded (permissioned override).

**FR-303 — Account statement.**
Acceptance Criteria:
- [ ] Produce a statement (relevé) for any account over a date range: each entry with debit/credit and **running balance**, in USD, LBP, or both, in any language; export PDF/Excel; send by email/WhatsApp.

## 10. Module: Inventory & Items (with Stock Ledger)

**FR-401 — Item master.**
Description: Product catalogue (legacy `GOODS` + related).
Acceptance Criteria:
- [ ] Create items with: code, names (AR/FR/EN), category, brand, family, unit(s) of measure, **cost price** and **sale price** (per currency), VAT treatment, image(s), barcode(s), flags: has size, has colour, track serial, track expiry, active.
- [ ] Support **size × colour variants**, each with its own barcode (legacy `GoodsSizeBar`, `GOODSCOLOR`).
- [ ] Multiple barcodes per item/variant (legacy `GoodsBarCode`, `barcodes`).

**FR-402 — Stock ledger (movements) & on-hand.**
Description: Track stock as immutable movements; derive on-hand and value (replaces the legacy `QTYINOUT`/`INVQTY`/`goidqty` apparatus).
Acceptance Criteria:
- [ ] Every stock-affecting action posts a movement: item/variant, branch/location, quantity in/out, unit cost, reason (purchase/sale/return/transfer/adjustment), source document, timestamp, user.
- [ ] **On-hand quantity is derived** (`Σ in − Σ out`) per item/variant/branch — never directly edited.
- [ ] **Valuation by weighted-average cost** is maintained and produces the **COGS** number used in sales posting.
- [ ] Negative-stock selling is configurable (allow/warn/block) per company.

**FR-403 — Stock counts & adjustments.**
Acceptance Criteria:
- [ ] Perform a stock count (optionally via handheld scanner import — legacy `DATACOLL`); the system posts adjustment movements for variances and a journal entry to the inventory/adjustment accounts.

**FR-404 — Inter-branch transfers.**
Acceptance Criteria:
- [ ] Transfer stock from one branch to another (legacy `TRANSFERITEMS`): posts an out-movement at source and an in-movement at destination, with optional approval.

**FR-405 — Pricing & discounts.**
Description: Price lists and discount rules (legacy `DiscByQty`, `DiscByTotal`, `DiscountByPeriode`, `Discounts`).
Acceptance Criteria:
- [ ] Discounts by quantity, by order total, by period (date range), by item, by category, by customer.
- [ ] Bulk **sale-price modification** tools (legacy `SalePriceModification`).

**FR-406 — Barcode & label printing.**
Description: Replace BarTender `.btw` with an in-app label engine.
Acceptance Criteria:
- [ ] Design/select label templates showing price, name (AR/FR/EN), barcode/QR, size variants.
- [ ] Print to label printers; batch-print labels for received goods.

**FR-407 — Expiry & serial tracking.**
Acceptance Criteria:
- [ ] For flagged items, capture expiry dates / serial numbers on receipt and sale; report items near expiry (legacy `expdate`, `serialno`).

## 11. Module: Purchasing

**FR-501 — Purchase order → goods receipt → purchase invoice.**
Acceptance Criteria:
- [ ] Create a purchase order to a supplier (multi-currency).
- [ ] Receive goods against the order (full/partial) → posts **stock-in movements** and updates average cost.
- [ ] Record the supplier (purchase) invoice → posts **DEBIT inventory + DEBIT input VAT + CREDIT supplier payable**.

**FR-502 — Landed cost (imports).**
Description: Foreign/imported purchases with extra costs (legacy `forinv`, `FORINV_EXPENSES`, `FORINV_OTHER`).
Acceptance Criteria:
- [ ] Allocate freight, customs, and the applicable additional customs fee across received items so item cost reflects true landed cost.

**FR-503 — Supplier balances & payments.**
Acceptance Criteria:
- [ ] View supplier balance (USD/LBP) and pay via Cash & Payments (§13); payment posts DEBIT payable / CREDIT cash-bank (+ FX line if needed).

## 12. Module: Invoicing & Sales

**FR-601 — Document flow.**
Description: Quotation → sales order → invoice → delivery note, with conversion and partial fulfilment. All invoice variants are one model with a `type` (legacy `INVNUM` and its variants).
Acceptance Criteria:
- [ ] Create a quotation; convert to order; convert to invoice; generate delivery note.
- [ ] Invoice `type` supports: standard, proforma, order, foreign, **credit note/return**, split.

**FR-602 — Invoice content & calculation.**
Acceptance Criteria:
- [ ] Header: customer, date, due date, currency + rate, salesman, branch, notes.
- [ ] Lines: item/variant, quantity, unit price, line discount %, VAT, optional serial/expiry; line total computed per §21.
- [ ] Totals: subtotal, header discount, VAT, grand total, paid, balance, status — all computed **server-side**.
- [ ] Multi-currency: totals available in document currency and base currency.

**FR-603 — Confirm & post.**
Acceptance Criteria:
- [ ] Confirming an invoice posts the **accounting entry** and the **stock-out movements**.
- [ ] A draft can be edited; a posted invoice cannot — corrections via credit note or reversal.

**FR-604 — Deliver / print / send.**
Acceptance Criteria:
- [ ] Generate a trilingual invoice PDF (A4 and receipt formats); print, email, or send by WhatsApp.
- [ ] Capture ship-to per invoice (legacy `InvnumShipTo`).

**FR-605 — Credit notes / returns / void.**
Acceptance Criteria:
- [ ] Create a credit note/return that posts reversing accounting and stock-in movements; void is permissioned and audited; soft-delete keeps the record (legacy `INVNUM_Deleted`).

## 13. Module: Cash & Payments

**FR-801 — Receipts & payments.**
Acceptance Criteria:
- [ ] Record money received from customers / paid to suppliers, against specific invoices or on-account.
- [ ] Method: cash, card, cheque, bank transfer, prepaid; with reference, bank, **currency + rate**.
- [ ] Posts the correct journal entry and updates the invoice's paid/balance status; adds **FX gain/loss** when rates moved.

**FR-802 — Cheque management.**
Acceptance Criteria:
- [ ] Track incoming/outgoing cheques with due date and status (pending/cleared/bounced); print cheques (legacy `CHQPRT`).

**FR-803 — Currency exchange.**
Acceptance Criteria:
- [ ] Record USD↔LBP exchange transactions (legacy `SARFE`), posting any FX gain/loss.

**FR-804 — Banks & reconciliation.**
Acceptance Criteria:
- [ ] Maintain bank accounts; basic bank reconciliation; petty cash (class 53).

## 14. Module: Accounting / General Ledger

**FR-901 — Manual journal entries.**
Acceptance Criteria:
- [ ] Accountant can create a manual journal entry with multiple debit/credit lines; the system **rejects it unless debits == credits** in base currency.
- [ ] Lines carry account, debit or credit, currency, rate, base amount, optional cost-centre/job, description.
- [ ] Posted entries are immutable; provide a **reverse** action that creates the opposite entry.

**FR-902 — Automatic posting.**
Acceptance Criteria:
- [ ] All documents (sales, purchase, payment) post via configurable **posting rules** (the account mapping is editable per company; replaces the legacy `DBLPOLICY` tables).

**FR-903 — VAT return.**
Acceptance Criteria:
- [ ] For a chosen period, compute total output VAT, total input VAT, and **net VAT payable/recoverable**; produce a filing-ready report/export (legacy `BALANLLTVA*`); designed so MoF **electronic submission** can be added.

**FR-904 — Fiscal periods & close.**
Acceptance Criteria:
- [ ] Open/lock periods to block back-dated posting (legacy `CHECKPRD`).
- [ ] **Year-end close** rolls P&L (class 7 − class 6) into retained earnings (class 1) and carries opening balances forward per currency.
- [ ] Unlocking a closed period is permissioned and audited.

**FR-905 — Financial statements.**
Acceptance Criteria:
- [ ] Produce **trial balance, balance sheet, income statement, general ledger**, each in USD, LBP, or both, and in any language; export PDF/Excel (legacy `BAL*` family).

**FR-906 — Accounting integrity (must be enforced).**
Acceptance Criteria:
- [ ] **Balanced entries:** every journal entry has `Σ debits == Σ credits` in base currency, or it is rejected.
- [ ] **Posted = immutable:** posted documents/entries cannot be edited or hard-deleted; corrections are made only by a reversing entry or credit note.
- [ ] **Server-computed money:** all totals, VAT, discounts, FX conversions, and COGS are computed on the server, never trusted from the client.
- [ ] **Derived balances & stock:** account balances and stock-on-hand are derived from their ledgers, never directly editable.
- [ ] **Period locking:** no posting into a locked fiscal period without a permissioned, audited unlock.
- [ ] **Currency integrity:** every amount carries original amount + currency + rate + base amount; changing today's rate never alters already-posted base amounts.
- [ ] **Tenant isolation:** every record belongs to a company; users only see/act within permitted companies.
- [ ] **Audit trail:** every create/update/delete (and login, void, price override, period unlock) is logged with user, timestamp, and before/after values; financial deletes are soft.

## 15. Module: Reporting

**FR-1001 — Report runner.**
Acceptance Criteria:
- [ ] Choose a report → set parameters (period, company/branch, currency, language) → preview → export PDF/Excel.
- [ ] Reports honour permissions (e.g. hide cost, restrict to branch).

**FR-1002 — Standard reports.**
Acceptance Criteria:
- [ ] Cover the distinct families: financial statements (§14), **sales** (by period/item/salesman/region), **inventory** (stock on hand, value, movement), **cash** (daily cash position), **purchasing**, **aged receivables/payables**.
- [ ] Role dashboards: sales, cash position, stock alerts, AR/AP aging.

## 16. Module: Admin & Audit

**FR-1101 — Admin panel (web).**
Acceptance Criteria:
- [ ] Manage companies, branches, users/roles, currencies/rates, chart of accounts, taxes, numbering, settings.
- [ ] View platform-wide statistics across companies.

**FR-1102 — Audit trail.**
Acceptance Criteria:
- [ ] Every create/update/delete and sensitive action (login, void, price override, period unlock) is logged with user, timestamp, before/after values (replaces legacy `*_DELETED` logs).
- [ ] Financial records are **soft-deleted**; posted entries can't be hard-deleted.

**FR-1103 — Backups.**
Acceptance Criteria:
- [ ] Scheduled automatic database backups to off-site/object storage (replaces `BackupReindexData.BAT`); tested restore procedure.

## 17. Future Work (Post-MVP)

The following are planned for **after the MVP** and are intentionally kept high-level (no detailed functional requirements yet):

- **Point of Sale (POS):** a fast, touch-friendly counter-sales module with barcode scanning, receipt printing, cash-drawer sessions, offline operation with automatic sync, and POS hardware (receipt printer, scanner, weighing scale). POS sales will post to accounting and stock exactly like a cash sale. To be specified in a later phase.
- **HR & Payroll:** employee records, attendance, and Lebanese payroll (NSSF contributions and income-tax withholding), posting to accounting and producing the statutory Ministry of Finance forms. Rates and ceilings will be configurable and dated. To be specified in a later phase.

Additional modules may be scoped later based on business need.

---

# PART D — USER EXPERIENCE

## 18. User Flows

> Step-by-step paths through the main tasks. Arrows show sequence; indented branches show choices.

**18.1 Log in**
```
1. Open app -> Login screen
2. Enter email + password -> Log In
3. (If multiple companies) choose company/branch
4. Land on role-appropriate dashboard
```

**18.2 Create & post a sales invoice (Lina)**
```
1. Sales -> New Invoice
2. Pick customer (see their balance + credit limit)
3. Set currency + rate (default = today's official rate; can override)
4. Add lines: scan/search item -> qty -> (discount %)  [repeat]
5. System shows subtotal, VAT, total in document currency + base
6. (Optional) header discount, notes, ship-to
7. Save as Draft  OR  Confirm
      Draft  -> editable later
      Confirm-> posts accounting entry + stock-out; gets a number; becomes read-only
8. Print / Email / WhatsApp the invoice PDF
9. Customer balance increases by the invoice total
```

**18.3 Receive a customer payment (Lina/Rana)**
```
1. Payments -> New Receipt
2. Pick customer -> see open invoices + balance
3. Choose method (cash/card/cheque/transfer), currency + rate
4. Allocate to invoice(s) or leave on-account
5. Save -> posts DEBIT cash/bank, CREDIT receivable (+ FX line if rate moved)
6. Invoice paid/balance status updates
```

**18.4 Purchase: order -> receive -> invoice (Nadia/Sami)**
```
1. Purchasing -> New Purchase Order -> pick supplier, add items, currency
2. Goods arrive -> open the PO -> Receive (full/partial)
      -> stock-in movements created; average cost updated
3. (Imports) add landed costs (freight/customs) -> allocated to item cost
4. Enter supplier invoice -> posts DEBIT inventory + DEBIT input VAT + CREDIT payable
5. Later: pay supplier via Payments
```

**18.5 Inter-branch stock transfer (Sami)**
```
1. Inventory -> New Transfer -> from branch A to branch B
2. Add items + quantities -> Submit (optional approval)
3. Out-movement at A, In-movement at B -> on-hand updates at both
```

**18.6 Month-end VAT & close (Rana)**
```
1. Reports -> VAT Return -> pick quarter
2. Review output VAT, input VAT, net payable/recoverable -> export
3. Accounting -> Periods -> lock the month
4. (Year end) Run Year-End Close -> P&L rolled to retained earnings; opening balances carried forward
```

**18.7 Admin creates a user (George)**
```
1. Admin -> Users -> New
2. Enter name, email, temp password; assign company/branch + role(s)
3. (Optional) override individual permissions
4. Save -> user can log in
```

## 19. Screen Specifications

> For each screen: its purpose, the key elements/fields, and the actions available. (Mobile = Flutter app; Web = React for admin + back-office.)

**19.1 Login** — *Purpose:* authenticate. *Elements:* email, password, "Forgot password", language switch. *Actions:* Log In.

**19.2 Dashboard (role-based)** — *Purpose:* at-a-glance overview. *Elements:* KPI cards (today's sales, cash position, AR/AP totals, stock alerts), shortcuts, notifications. *Actions:* drill into reports; quick-create.

**19.3 Customer/Supplier list** — *Elements:* search, filters (type, category, region, has-balance), table (code, name, phone, balance USD, balance LBP, status). *Actions:* open, create, export.

**19.4 Customer/Supplier detail** — *Elements:* header (name, code, TIN, contact, credit limit), balance (USD/LBP), tabs: Info, Addresses, Transactions, Open invoices, Statement. *Actions:* edit, new invoice, new payment, print/send statement.

**19.5 Item list** — *Elements:* search, filters (category/brand/family/stock status), grid/table (image, name, barcode, sale price, **stock on hand by branch**). *Actions:* open, create, print labels, bulk price update.

**19.6 Item detail** — *Elements:* names (AR/FR/EN), category/brand/family, unit, cost & sale prices (per currency), VAT treatment, flags (size/colour/serial/expiry), images, barcodes, variant matrix, stock-by-branch, movement history. *Actions:* edit, add variant, print label.

**19.7 Sales Invoice screen** — *Elements:* customer picker (+ balance/limit), date, due date, currency + rate (editable), salesman, branch; **line grid** (item, qty, unit price, disc %, VAT, line total); totals panel (subtotal, discount, VAT, total — in document & base currency); notes, ship-to. *Actions:* add/remove line, save draft, **confirm/post**, print, email, WhatsApp, create credit note.

**19.8 Purchase Order / Receipt / Invoice** — *Elements:* supplier, currency + rate, line grid (item, qty ordered/received, unit cost), landed-cost section, totals. *Actions:* save, receive (full/partial), enter invoice, post.

**19.9 Payment/Receipt screen** — *Elements:* party (customer/supplier), method, currency + rate, amount, open-invoice allocation list, reference/bank/cheque fields. *Actions:* save & post.

**19.10 Chart of Accounts** — *Elements:* tree of accounts (number, name, class, type, balance). *Actions:* add/edit account, set control-account flags.

**19.11 Journal Entry screen** — *Elements:* date, reference, description; **line grid** (account, debit, credit, currency, rate, base amount, cost-centre); **live debit/credit totals with balance indicator**. *Actions:* add line, save (blocked if unbalanced), post, reverse.

**19.12 Reports screen** — *Elements:* report picker, parameter panel (period, company/branch, **currency: USD/LBP/both**, language), preview pane. *Actions:* run, export PDF/Excel, print.

**19.13 Admin — Users / Companies / Branches / Currencies / Taxes / Numbering** — *Elements:* CRUD lists and forms per entity as specified in §7–§8. *Actions:* create/edit/deactivate.

---

# PART E — TECHNICAL SPECIFICATION

## 20. Data Model (entities & key fields)

> Target: PostgreSQL, UTF-8, ACID. Field lists are indicative; finalise once the **full legacy schema export** (all 1,347 tables with field lists) is available (§28). **Money pattern:** wherever an amount appears, store `amount_original`, `currency`, `rate` (LBP-per-USD), `amount_base`.

**company** — id, name, name_ar, name_fr, name_en, logo_url, base_currency, tax_number, address, phone, email, fiscal_year_start, settings_json, active.

**branch** — id, company_id→company, name(+ar/fr/en), address, stock_location_id, active.

**user** — id, username, email, password_hash, full_name, active, created_at. **user_company_role** — user_id, company_id, branch_id (nullable), role_id. **role** — id, name, permissions_json. **user_permission_override** — user_id, permission_key, allow(bool).

**currency** — code (PK, e.g. USD/LBP), symbol, decimals. **exchange_rate** — id, company_id, rate_type (official/market/custom), base=USD, quote=LBP, rate (LBP per 1 USD), effective_date.

**account (chart of accounts)** — id, company_id, number, name(+ar/fr/en), class (1–7), type (asset/liability/equity/revenue/expense), normal_balance (D/C), parent_id (nullable), currency_restriction (null/USD/LBP), is_control (bool), control_type (AR/AP/VAT_OUT/VAT_IN/CASH/BANK/null), active.

**partner (customer/supplier)** — id, company_id, code, name(+ar/fr/en), kind (customer/supplier/both), category, tin, contact_name, phones, email, region_id, salesman_id, vip(bool), credit_limit, credit_currency, **ledger_account_id→account**, active, created_at. **partner_address** — id, partner_id, type (billing/shipping/branch), line1, city, country, region, phone, is_default.

**item** — id, company_id, code, name(+ar/fr/en), description, category_id, brand_id, family_id, base_unit_id, cost_price, sale_price, price_currency, vat_treatment (standard/zero/exempt), has_size, has_color, track_serial, track_expiry, image_urls, active. **item_variant** — id, item_id, size_id, color_id, sku. **item_barcode** — id, item_id, variant_id (nullable), barcode, is_primary. Lookups: **category, brand, family, size, color, unit** — id, company_id, name(+ar/fr/en), parent_id (category), sort_order.

**location** — id, company_id, branch_id, name. **stock_movement** — id, company_id, item_id, variant_id, location_id, qty_in, qty_out, unit_cost, reason (purchase/sale/return/transfer_in/transfer_out/adjustment), source_doc_type, source_doc_id, moved_at, user_id. *(On-hand & value are derived views over this table.)*

**document (sales/purchase/quote/order/credit note)** — id, company_id, branch_id, doc_type (sales_invoice/purchase_invoice/quotation/sales_order/purchase_order/credit_note/proforma), doc_number, partner_id, date, due_date, currency, rate, subtotal_base, discount_base, vat_base, total_base, paid_base, status (draft/confirmed/partially_paid/paid/void), salesman_id, notes, ship_to_json, created_by, created_at, posted_journal_id (nullable). **document_line** — id, document_id, item_id, variant_id, description, qty, unit_price, unit_price_currency, line_discount_pct, vat_rate, line_total_base, serial_no, expiry_date, cost_at_sale.

**journal_entry** — id, company_id, date, reference, description, source_doc_type, source_doc_id, period_id, is_reversal_of (nullable), created_by, created_at, posted(bool). **journal_line** — id, journal_id, account_id, debit_base, credit_base, currency, rate, amount_original, partner_id (nullable), cost_center_id (nullable), description. *(Invariant: per journal, Σ debit_base = Σ credit_base.)*

**payment** — id, company_id, partner_id, direction (in/out), method (cash/card/cheque/transfer/prepaid), currency, rate, amount_original, amount_base, reference, bank_id, cheque_id, date, created_by, posted_journal_id. **payment_allocation** — payment_id, document_id, amount_base. **cheque** — id, company_id, partner_id, direction, amount, currency, due_date, status (pending/cleared/bounced), bank_id.

**tax_rate** — id, company_id, name, rate_pct, treatment (standard/zero/exempt), effective_date, vat_out_account_id, vat_in_account_id.

**document_sequence** — id, company_id, branch_id (nullable), doc_type, prefix, next_number, suffix, reset_period.

**fiscal_period** — id, company_id, year, month, status (open/locked).

**audit_log** — id, company_id, user_id, action, entity, entity_id, before_json, after_json, ip, timestamp.

**translation** — id, namespace, key, ar, fr, en, tr.

**Key relationships:** company 1—N branch/user/account/partner/item/document/journal_entry; partner 1—1 account (ledger); document 1—N document_line; document 1—1 journal_entry (when posted); item 1—N variant/barcode/stock_movement; journal_entry 1—N journal_line; payment N—N document (via allocation).

## 21. Business Rules & Calculations (exact formulas)

> All computed **server-side**. Rate convention: `rate` = LBP per 1 USD; `USD = LBP ÷ rate`, `LBP = USD × rate`. Base currency = USD for our tenants.

**21.1 Invoice line total**
```
line_net      = qty × unit_price × (1 − line_discount_pct/100)
line_vat      = line_net × (vat_rate/100)        # 0 if zero-rated/exempt
line_total    = line_net + line_vat
```

**21.2 Document totals**
```
subtotal      = Σ line_net
header_disc   = subtotal × (header_discount_pct/100)   # or a fixed amount
taxable_base  = subtotal − header_disc
vat_total     = Σ line_vat  (recompute on taxable_base if header discount applies pro-rata)
grand_total   = taxable_base + vat_total
balance_due   = grand_total − paid
```

**21.3 Currency conversion**
```
amount_base (USD) = amount_LBP ÷ rate
amount_LBP        = amount_USD × rate
```

**21.4 Realised FX gain/loss (on settling a foreign-currency balance)**
```
booked_base   = original receivable/payable in base currency
settled_base  = amount actually received/paid, converted at settlement rate
fx_result     = settled_base − booked_base
   receivable: fx_result < 0 -> FX LOSS ; > 0 -> FX GAIN
   payable:    reverse the sign
```

**21.5 Weighted-average cost & COGS**
```
on receipt:  new_avg = (old_qty×old_avg + recv_qty×recv_cost) ÷ (old_qty + recv_qty)
on sale:     cogs    = sold_qty × current_avg_cost
```

**21.6 Stock on hand**
```
on_hand(item, location) = Σ qty_in − Σ qty_out   (over stock_movement)
```

**21.7 VAT return (period)**
```
output_vat = Σ VAT on sales (posted)        # liability we collected
input_vat  = Σ VAT on purchases (posted)     # recoverable
net_vat    = output_vat − input_vat          # >0 pay govt ; <0 carry/recover
```

**21.8 Account balance**
```
balance(account) = Σ debit_base − Σ credit_base   (over journal_line)
# display sign per account's normal balance
```

**21.9 Rounding**
```
USD: round to 2 decimals (banker's or standard, fixed per company)
LBP: round to 0 decimals (whole pounds)
```

## 22. Data Migration (from legacy Paradox)

- **R-MIG-1 Extract:** export in-scope `.DB` tables via the BDE data pump / Paradox export; use the legacy `Tablelst` registry for keys/indexes.
- **R-MIG-2 Encoding:** convert legacy Arabic/French text from its Windows/OEM code page (e.g. CP1256) to **UTF-8**; visually validate. *(Primary risk — budget a dedicated pass.)*
- **R-MIG-3 Transform:** consolidate language/variant tables (e.g. `HISAB`/`HISABENG`/`HISABFR` → one `partner`/`account` with translations); map `COMP` → company; split header/line docs into `document`/`document_line`; derive `stock_movement` from legacy movement tables; convert posted history into `journal_entry`/`journal_line`.
- **R-MIG-4 Validate:** detect/resolve orphans, duplicate keys, broken references (flat files have no FKs); produce a **reconciliation report** (counts in/out, rejects with reasons).
- **R-MIG-5 Reconcile:** migrated **trial balance must match legacy per company and per currency** at cut-over; document differences and get sign-off.
- **R-MIG-6 Strategy:** iterative runs (config → masters → balances → open documents → history); dry-run + cut-over rehearsal.

## 23. Integrations

| Capability | Legacy | v2 |
|---|---|---|
| Email | CDO/SMTP + Outlook COM | Server-side SMTP (Nodemailer-style) |
| WhatsApp | WhatsMate v3 (plain HTTP) | **WhatsApp Business API / Twilio** (HTTPS, templates) |
| SMS | SMS module | SMS gateway |
| Excel export | VBScript → Excel COM | Server-side library (e.g. ExcelJS) |
| PDF | Paradox/Crystal | Server-side HTML→PDF (trilingual, RTL) |
| Barcode labels | BarTender `.btw` | In-app label engine (bwip-js + print) |
| Barcode scanner | HID | HID keyboard (no driver) |
| E-commerce | Shopify import | Shopify API sync (orders in; catalog/stock out optional) |
| Cloud backup | Dropbox/Yandex/MEGA | Object storage + scheduled DB dumps (encrypted, off-site) |
| Caller ID | CallerID tables | Optional softphone/SIP webhook (pop customer on call) |

## 24. Non-Functional Requirements

- **NFR-1 Performance:** search < 300 ms p95; invoice post < 1 s p95; standard report < 5 s/period.
- **NFR-2 Concurrency:** safe multi-user concurrent posting (ACID; no lost updates) — a core improvement over the flat-file system.
- **NFR-3 Availability:** single-server for one branch; horizontally scalable for multi-branch; documented backup/restore (RTO/RPO).
- **NFR-4 Security:** hashed passwords, RBAC, encrypted secrets, HTTPS/TLS everywhere, encrypted backups, audit logging, row-level tenant isolation.
- **NFR-5 i18n/RTL:** full AR/FR/EN (+TR optional), RTL for Arabic, locale-aware date/number/currency formatting, no hardcoded user strings.
- **NFR-6 Usability:** simple, consistent navigation; clear error messages; loading indicators.
- **NFR-7 Auditability/compliance:** immutable financial audit trail; retention per Lebanese statutory rules; e-filing-ready outputs.
- **NFR-8 Maintainability:** one consolidated codebase; configuration over per-customer code forks (avoid legacy variant sprawl).
- **NFR-9 Devices:** responsive web for desktop back-office; mobile app (Flutter) for on-the-go access.

## 25. Technical Architecture (summary)

- **Mobile:** Flutter app for on-the-go access to back-office functions.
- **Web (admin + back-office):** React SPA, RTL + i18n, data grids, print templates.
- **Backend:** API service (Laravel/PHP per current team skill, or Node) exposing a **REST API**; JWT + refresh auth with RBAC; server-side PDF/Excel/barcode generation; posting-rule engine; FX and costing services.
- **Database:** **PostgreSQL** (UTF-8, ACID, constraints/triggers protecting ledger integrity); migrations; **Redis** cache (sessions, lookups); object storage (Firebase/S3-compatible) for images/PDF/backups; full-text search for items/partners.
- **Ops:** containerised deploy, reverse proxy, scheduled DB backups, monitoring/error tracking, CI/CD.

*(Note: the team's stated stack is Flutter + React + Laravel + PostgreSQL/MySQL + Firebase. PostgreSQL is strongly recommended over MySQL for the accounting integrity and dual-currency needs.)*

## 26. API Overview (indicative)

Grouped by domain; all require auth and are company-scoped.
```
auth:        POST /auth/login, /auth/refresh, /auth/logout, GET /auth/me
partners:    GET/POST /partners, GET/PUT/DELETE /partners/:id,
             GET /partners/:id/statement, /balance, /transactions
items:       GET/POST /items, GET/PUT/DELETE /items/:id,
             GET /items/search, /items/barcode/:code, /items/:id/stock
stock:       POST /stock/movements, /stock/transfers, /stock/counts, GET /stock/on-hand
purchasing:  GET/POST /purchase-orders, /goods-receipts, /purchase-invoices
sales:       GET/POST /quotations, /orders, /invoices,
             POST /invoices/:id/confirm, /pay, /credit-note, GET /invoices/:id/pdf
payments:    GET/POST /payments, /cheques, /exchange
accounting:  GET/POST /journal-entries, POST /journal-entries/:id/reverse,
             GET /reports/trial-balance|balance-sheet|income-statement,
             GET /vat/return, POST /periods/:id/lock
admin:       /companies, /branches, /users, /roles, /currencies, /exchange-rates,
             /accounts (chart), /taxes, /sequences, /settings, /audit-log, /backup
```

---

# PART F — DELIVERY

## 27. Roadmap & Milestones

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 Foundations** | Tenancy, auth/RBAC, company/branch, **chart of accounts**, currencies/rates, i18n, numbering, audit, migration tooling | A company can be set up; chart seeded; login/roles work; migration dry-run runs end-to-end |
| **1 Core commercial (MVP)** | Partners, Items + **stock ledger**, Purchasing, Invoicing, **journal/posting**, Cash & Payments, financial reports + **VAT** | Invoice→payment→ledger→statement works; trial balance & VAT correct (USD/LBP); migrated balances reconcile |
| **Future (post-MVP)** | Point of Sale, then HR/Payroll; further modules as needed (§17) | Scoped and prioritised after MVP go-live |

## 28. Open Questions & Decisions Needed

1. **Post-MVP priority:** after the accounting MVP, which comes first — **Point of Sale** or **HR/Payroll**? (§17)
2. **Base currency per company:** USD (recommended) or LBP; standard rate type(s).
3. **VAT rate at go-live:** 11% or the proposed 12% (per parliamentary status); confirm exempt/zero-rated cases relevant to the business.
4. **E-filing depth required now:** VAT, and (later) payroll forms / e-invoicing?
5. **Full schema export:** can we get all 1,347 tables with field lists + `Tablelst` index metadata?
6. **Languages at launch:** AR/FR/EN enough, or is Turkish needed immediately?
7. **Deployment:** cloud (multi-branch consolidation) vs on-premise per site for v1.
8. **Cut-over:** big-bang vs parallel run for one period.

## 29. Appendix — Legacy → v2 Mapping (summary)

| Legacy | v2 |
|---|---|
| `HISAB`/`HISABENG`/`HISABFR` (+variants) | one `partner` + `account` with translations |
| `TRANS`/`TRANSSUB`/`DBCR` + `DBLPOLICY*` | `journal_entry`/`journal_line` + posting-rule engine |
| `hisbal`/`sumhbal`/`BalYear` | derived balances + period/year snapshots |
| `INVNUM` (+ variants) + `inv` | `document` (typed) + `document_line` |
| `QTYINOUT`/`INVQTY`/`goidqty`/`TRANSFERITEMS` | `stock_movement` + derived on-hand view |
| `GOODS` (+barcode/size/colour/location) | `item`/`item_variant`/`item_barcode`/`location` |
| `chart`/`MenuAccount`/`GroupAccount` | `account` (Plan Comptable Libanais) |
| `SARFE`/`FOBRATE`/`BALBYRATE` | `currency`/`exchange_rate` + FX gain/loss |
| `TAX`/`TaxTable`/`Provinces`/`BALANLLTVA` | `tax_rate` + VAT return |
| `docnum`/`DOCNUM_ADD` | `document_sequence` (per type/branch) |
| `*_DELETED` / deletion logs | `audit_log` + soft delete |
| `Language` | `translation` + i18n master fields |
| `PASSWORD`/`ACCPRIV`/`HISPRIV`/`ITMPRIV` | `user`/`role`/`permission` (RBAC + overrides) |
| `PosBranch` / `STATIONS*` | `branch` |
| VBScript + BarTender + COM + `.txt` files | server-side services + web integrations (§23) |
| 2,838 `.rsl` reports | consolidated distinct-report set, parameterised |

---

*End of Detailed PRD (Developer Edition), v2.1. The MVP scope is the accounting and core commercial system (§7–§16); Point of Sale and Payroll are future work (§17). Pending the §28 decisions, the next deliverables are the distinct-report inventory and a finalised physical schema once the full legacy export is available.*
