# URGENT — base-currency amounts are not self-describing

**Status:** open, not yet fixed. Documented after a real incident on a dev
company on 2026-08-03.

**Severity:** high. It silently misstates money. There is no error, no failed
request and no log line — a balance simply reports a number that is wrong by
the FX rate between two currencies (in the observed case, ~90,000×). Nothing in
the system detects it.

**Scope:** general ledger, partner balances and statements, and every current
and future frontend screen that renders a base-currency amount.

This document is the single source of truth for the problem. Read it before
touching balance/reporting responses, and before adding any presentation-
currency feature.

---

## 1. The incident

A dev company (Demo Company) had one posted journal entry:

```
40  Suppliers                debit  100
70  Sales of merchandise     credit 100
```

Those were posted while the company's `baseCurrencyCode` was `USD`, so
`amountBase = 100` means **100 US dollars**.

Someone then changed the company's base currency to `LBP` in the UI. The
frontend account-balance screen immediately displayed:

```
100 LBP
```

Nothing converted. Nothing failed. The stored number stayed `100`, and the
label changed from USD to LBP, because the label was derived from the company
setting rather than from the data. 100 USD was reported as 100 LBP — off by
roughly the USD/LBP rate.

The frontend was blamed first; it was not the cause. See §4.

---

## 2. How money is stored today

`JournalLine` (`prisma/schema.prisma`) holds the project's 4-field Money:

```prisma
amountOriginal Decimal  // what was actually transacted
currency       String   // the currency of that transaction, e.g. "LBP"
rate           Decimal  // units per 1 USD (project-wide convention)
amountBase     Decimal  // converted into the company's base currency
```

Two properties matter here, and both are correct and deliberate:

1. **`amountBase` is server-computed** at posting (invariant #3), so a client
   can never inject an inconsistent base amount.
2. **`amountBase` is frozen** after posting (invariant #6) — later rate edits
   never alter it. History does not move when today's rate moves.

The company's base currency lives in exactly one place:

```prisma
model Company {
  baseCurrencyCode String @default("USD")   // FR-108
}
```

It is a **mutable setting**, editable via `PATCH /companies/:id` and (since
commit `967e995`) `PATCH /companies/:id/settings`.

---

## 3. Root cause

> **Nothing records which currency an `amountBase` value is denominated in.**

`amountBase` is frozen at posting time. `Company.baseCurrencyCode` is mutable
and reflects *now*. There is no column, no audit row and no history table
connecting the two.

So the currency of any stored base amount can only be *inferred* from a value
that is free to change afterwards. The moment it changes, every historical
`amountBase` in that company silently acquires a wrong label. The data is not
corrupted — the numbers are exactly what was posted — but the system can no
longer say truthfully what they mean.

This is a **missing fact in the schema**, not a bug in any particular
service or screen. That is why it shows up in several places at once (§4) and
why local fixes do not resolve it (§5).

---

## 4. Everywhere this currently bites

### 4.1 Backend — GL

**`GET /accounts/:id/balance`** — `AccountBalanceResponseDto`
(`src/modules/gl/dto/account-balance-response.dto.ts`) returns:

```json
{ "totalDebitBase": 100, "totalCreditBase": 0, "balance": 100, "naturalBalance": -100, "asOf": "2026-08-03" }
```

There is **no currency field at all**. The word "Base" is the only hint, and it
names a setting rather than a value. Any client must join to
`Company.baseCurrencyCode` itself — which is exactly how the incident happened.

**`GET /reports/trial-balance`** — `TrialBalanceResponseDto` *does* carry
`currency`, set in `LedgerService.trialBalance` from
`getBaseCurrency(companyId)` (`src/modules/gl/ledger.service.ts:304-310`).
Better, but it reads the **current** setting, so after a change it confidently
stamps the new code onto old amounts. Self-describing in form, still inferred
in substance.

### 4.2 Backend — Partners

**`GET /partners/:id/balance`** — `PartnerBalanceResponseDto` returns
`totalDebitBase`, `totalCreditBase`, `balanceBase` with **no currency**. (Its
`byCurrency[]` rows are fine — those carry their own `currency` because they
come from `amountOriginal`/`currency`, which *are* self-describing.)

**`GET /partners/:id/statement`** — `PartnersService.statement`
(`src/modules/partners/partners.service.ts:524`) does:

```ts
dto.baseCurrency = 'USD';   // hardcoded
```

For a company whose base is not USD, this is simply false.

### 4.3 Backend — silent USD fallbacks

Three places default to USD when the company row is missing:

- `src/modules/gl/ledger.service.ts:309` — `company?.baseCurrencyCode ?? 'USD'`
- `src/modules/items/items.service.ts:317` — same
- `src/modules/stock/stock.service.ts` — same

These are defensive, but they turn "unknown" into a confident, possibly wrong
answer. Once §6 lands they should surface the real stored currency instead.

### 4.4 Frontend

The frontend has no way to know a base amount's currency, so it reconstructs
it: `useBaseCurrency()`
(`src/features/companies/hooks/useBaseCurrency.ts`) reads
`GET /companies/:id/settings` → `baseCurrencyCode`, joins it to
`GET /currencies` for `decimalPlaces`, and hands both to `formatMoney()`
(`src/lib/format.ts`).

That join is what printed `100 LBP`. It is *correct code doing what the API
allows* — the API offers no better source. It also means the frontend cannot
render a base amount at all until two extra requests resolve.

Consumers today: the account detail Balance section, and the partner ledger
summary cards. Every future financial screen inherits the same problem.

There is a matching entry in the frontend repo at `docs/DEFERRED.md` → **D-004**.

---

## 5. Approaches that do NOT fix this

Recording these because each was considered and each is wrong.

**Relabel from the current setting (what we do now).** The setting describes
the present; the amounts describe the past. They drift the moment anyone edits
the setting.

**Forbid changing base currency once postings exist.** This was implemented in
the frontend and then reverted. It removes a legitimate capability —
presentation currency and functional currency are different things (IAS 21),
and translating books for display is a normal operation — and it puts an
accounting policy decision in a client, where it cannot be enforced anyway. It
also does nothing for data whose currency changed before the guard existed.

**Have the server infer the currency instead of the client.** Tempting, and it
was prototyped: add `currency` to the balance responses, populated from
`getBaseCurrency()`. It centralises the guess and removes a client-side join,
but the guess is still read from the same mutable setting. It converts a
client-side mislabel into an authoritative-looking server-side one. **On its
own it is not a fix**, and it should not be shipped while implying otherwise.

**Add `?presentIn=XXX` conversion without fixing storage.** Worse than doing
nothing: it converts *from* an assumed source currency and attaches a real
exchange rate to the output, so a wrong number arrives wearing the trappings of
rigour.

---

## 6. Proposed fix

### 6.1 Schema — record the base currency with the amount

Add the missing fact next to the value it describes:

```prisma
model JournalLine {
  // ...
  amountBase       Decimal @map("amount_base") @db.Decimal(20, 2)
  baseCurrencyCode String  @map("base_currency_code")   // NEW
  baseCurrency     Currency @relation("JournalLineBaseCurrency", fields: [baseCurrencyCode], references: [code])
}
```

`JournalEntry` is the alternative home — one row instead of many, and the base
currency cannot vary within an entry. `JournalLine` is recommended anyway:
every aggregate query already groups over lines, so keeping it there means no
join is needed to answer "what currency is this sum in", and grouping by
`baseCurrencyCode` becomes trivial.

**Backfill:** set every existing row to its company's current
`baseCurrencyCode`. This is the best available answer and is correct for every
company that never changed the setting. For any company that *did* change it,
the backfill will be wrong for rows posted before the change — that history is
genuinely unrecoverable, which is precisely why this column needs to exist.
Log which companies are affected during the migration so they can be reviewed
by hand.

**Migration mechanics** (per `docs/PROGRESS.md` — the local DB user cannot
create Prisma's shadow database, so `migrate dev` is not available):

```bash
npx prisma migrate diff \
  --from-config-datasource prisma.config.ts \
  --to-schema prisma/schema.prisma \
  --script > migration.sql
# add the UPDATE ... FROM company backfill to migration.sql, then:
npx prisma migrate deploy
```

Make the column `NOT NULL` only after the backfill, or land it nullable and
tighten it in a follow-up migration.

### 6.2 Write path

`PostingService` / `GlService` set `baseCurrencyCode` on each line from the
company at posting time, in the same transaction that computes `amountBase`.
The two are computed together and must be stored together — that pairing is the
whole point.

### 6.3 Read path

- `AccountBalanceResponseDto` gains `currency`, populated from the **stored**
  `baseCurrencyCode` on the aggregated lines, not from the company setting.
- `PartnerBalanceResponseDto` gains `baseCurrency`, same source.
- `TrialBalanceResponseDto.currency` switches from `getBaseCurrency()` to the
  stored value.
- `PartnersService.statement` drops the hardcoded `'USD'`.
- The `?? 'USD'` fallbacks in `ledger`/`items`/`stock` are reviewed.

**Mixed-currency history.** After a base-currency change a company can hold
lines in two base currencies. Aggregations must not blindly sum across them.
Group by `baseCurrencyCode` and either return one figure per currency (the
honest default, mirroring the existing `byCurrency[]` on partner balances) or
convert explicitly via §6.5 and say so in the response. Summing them silently
would recreate this bug in a new form.

### 6.4 Then: self-describing responses ("Tier 1")

With §6.1–6.3 done, every balance response names the currency its numbers are
actually in, sourced from the same write that produced the numbers. Changing
`Company.baseCurrencyCode` then affects only **future** postings, which is the
correct behaviour: it is the functional currency going forward, not a
retroactive relabelling.

### 6.5 Then: presentation currency ("Tier 2")

Optional and separable, but this is what users usually mean by "show me the
books in LBP":

```
GET /accounts/:id/balance?presentIn=LBP
```

The server converts for display and returns the rate it used. **Storage never
moves.**

There is already a working precedent in this codebase — do not invent a second
pattern. `GET /partners/:id/statement` implements exactly this:
`StatementConversionDto { currency, rateType, rate, rateDate }`, paired
`*Base`/`*Display` fields, `rateType` defaulting to `Official`, and a **null**
conversion when no rate is available for the period (see `rateInForce()` and
`DISPLAY_CURRENCY` in `partners.service.ts`). Note it also rounds LBP to 0
decimals via `round0`, honouring `Currency.decimalPlaces`.

Reuse that shape for account balances and the trial balance. The one design
decision is which rate: a single rate as of a date (redenomination-style), or
each line at its own historical rate. The statement already chose the former;
consistency argues for the same.

Because `rate` is "units per 1 USD", USD is the pivot and a USD↔LBP conversion
is a direct `exchange_rate` lookup. Non-USD → non-USD requires two hops.

**A missing rate must return `null`, never a silent fallback of 1.**

### 6.6 Not proposed: redenomination

Rewriting `amountBase` on every line so the books themselves change currency is
a separate, heavier feature (`POST /companies/:id/redenominate` with an audited
rate). Balances are fully derived — there are no snapshot/period tables — so
restating the lines would be sufficient. Only do this if the business genuinely
changed the currency it operates in. It is not needed for display.

---

## 7. Frontend work once this lands

Small, and mostly deletion:

1. Read `currency` / `baseCurrency` straight from the balance payload.
2. Delete `useBaseCurrency()` and its settings+registry join. Screens stop
   needing two extra requests to render one number.
3. Keep `formatMoney()` and keep sourcing `decimalPlaces` from
   `GET /currencies` — LBP is a 0-decimal currency and `1,250.00 LBP` is wrong,
   not merely verbose.
4. Keep rendering **unlabelled** when a currency is genuinely unknown. An
   unlabelled number is incomplete; a mislabelled one is a lie.
5. If §6.5 ships, add the `presentIn` selector and display the returned rate and
   rate date next to converted figures — never a converted number on its own.
6. Close **D-004** in the frontend `docs/DEFERRED.md`.

---

## 8. Test plan

- **Unit/service:** post in a USD company; assert the line stores
  `baseCurrencyCode = 'USD'`. Change the company to LBP, post again, assert the
  new line stores `LBP` **and the old line still stores `USD`**. Assert the
  balance response reports each correctly and does not sum across them silently.
- **Migration:** run the backfill against a copy with a company that has
  changed base currency; confirm the affected rows are reported.
- **API:** `GET /accounts/:id/balance` names a currency that survives a
  subsequent `PATCH /companies/:id/settings`.
- **Regression (the incident itself):** a company with a 100 USD balance
  switched to LBP must still report **100 USD**, not 100 LBP.
- **Presentation (if §6.5):** `?presentIn=LBP` returns a converted figure plus
  the rate used; a date with no rate returns `null` conversion, not a bare
  number.

---

## 9. Until this is fixed

- Treat `baseCurrencyCode` as **effectively write-once** in practice. Set it at
  company creation. There is no technical guard (deliberately — see §5), so
  this is a process rule.
- Changing it on a company that already has postings **will misreport history**
  until §6 lands.
- Any new endpoint returning a base-currency amount should carry a currency
  field from day one, even while that value is still inferred — the field is
  the contract, and the source can be corrected in one place later.

---

## 10. Manual verification today (before the fix)

How to observe the defect, what is safe to exercise meanwhile, and what to
re-run once §6 lands. Assumes the API on `:3001` and the frontend on `:5173`.

### 10.1 Reproduce the defect

Do this on a throwaway company, not one whose numbers you care about.

1. Pick a company with **at least one posted journal entry**, and note its base
   currency (`GET /companies/:id/settings` → `baseCurrencyCode`, or the
   company's Settings tab).
2. Note an account's balance:
   `GET /accounts/:id/balance` → `naturalBalance`. In the UI: Chart of Accounts
   → open the account → **Balance**. Record both the number and the label.
3. Change the company's base currency to a currency with a very different scale
   — USD → LBP is the clearest, since the true rate is ~90,000 and LBP carries
   0 decimals.
4. Re-read the same balance.

**Expected (the bug):** the number is unchanged and the label changed. A
balance that was `100.00 USD` now reads `100 LBP`. Nothing converted, nothing
errored.

**After §6 this must instead still read `100 USD`** — the amount keeps the
currency it was posted in, and the setting change affects only new postings.

### 10.2 Confirm the API is the source, not the UI

Worth doing once, so the defect isn't mistaken for a formatting bug:

```bash
curl -s "$API/accounts/$ACCOUNT_ID/balance" -H "Authorization: Bearer $TOKEN"
```

The response contains `totalDebitBase`, `balance`, `naturalBalance` and **no
currency field**. That absence is the defect. The frontend's label comes from
`GET /companies/:id/settings`, which is a different request entirely — which is
why the two can disagree.

### 10.3 Safe to exercise meanwhile

Base currency can be changed freely on a company with **no postings** — there
is no history to mislabel, and it is the normal way to correct a setup mistake.
That path is worth testing, because it also covers `Currency.decimalPlaces`:

- Create a company, set base currency **LBP**, don't post anything.
- Any base-currency amount for it must render with **0 decimals** (`0 LBP`,
  never `0.00 LBP`); a USD company renders 2 (`0.00 USD`).
- Rounding decimals accept 0–6 and reject 7.
- Saving settings must not clear `enabledModules` / `featureFlags` /
  `fieldVisibility` — the form doesn't edit them and `PATCH` is partial.

### 10.4 Repair a company that has already drifted

If a company's base currency was changed after posting, the stored amounts are
still in the *old* currency. Setting `baseCurrencyCode` back to that old
currency makes the display truthful again — no data changes, because nothing
ever converted:

```bash
curl -s -X PATCH "$API/companies/$COMPANY_ID/settings" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"baseCurrencyCode":"USD"}'
```

Verify with `GET /accounts/:id/balance` that the figure now carries the
currency it was actually posted in.

### 10.5 Re-run after §6

- §8's test plan in full.
- §10.1 again — it is the regression test for this defect.
- A company that legitimately changed base currency mid-life should then show
  **two** base currencies across its history, reported separately rather than
  summed (see §6.3).
