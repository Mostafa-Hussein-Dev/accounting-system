# NEEDED — information required from the product owner

Things I (the implementer) need **from you** to spec/build future steps: detailed
functional requirements, business rules, answers, or decisions. Each item stays
here until you provide the detail, then it moves into `docs/PRD.md` as proper
`FR-xxx` requirements and gets ticked off below.

> Format for what you send back: for each feature give an **FR id**, a one-line
> **description**, and a checklist of **acceptance criteria** (`[ ]` testable
> conditions) — the same style as the FRs already in `PRD.md` (see §17.1 POS as a
> template). Fill in the "YOUR INPUT" blocks (or answer inline) and I'll port them
> into the PRD verbatim.

---

## 1. HR & Payroll (MVP — PRD §17.2)

**Status:** awaiting your detailed FRs.
**What I currently have:** only the high-level blurb — employee records,
attendance, Lebanese payroll (NSSF contributions + income-tax withholding),
posting to accounting, and statutory Ministry of Finance forms; rates/ceilings
configurable and dated.

**What I need from you (suggested FR breakdown — rename/add/remove as you like):**
- **FR-751 Employee master** — what fields? (personal, job, salary basis
  [monthly/hourly/daily], contract type, start/end, NSSF number, bank, dependants,
  tax family status, default branch/cost-centre…)
- **FR-752 Attendance / time** — is attendance in scope for MVP? Source (manual
  entry, import, device)? Overtime rules, leave/absence types, how they feed pay.
- **FR-753 Salary structure & components** — earnings (base, allowances,
  transport, bonuses) and deductions (NSSF employee share, income tax, advances,
  loans); which are taxable vs NSSF-able; fixed vs %.
- **FR-754 NSSF calculation** — employee % + employer %, ceilings, family/sickness/
  end-of-service branches, dated rate table.
- **FR-755 Income-tax withholding** — Lebanese payroll tax brackets (dated),
  family deductions, how computed (per period vs annualised).
- **FR-756 Payroll run** — period, generate payslips, review/approve, **post the
  GL entry** (which accounts: salary expense, NSSF payable, tax payable, net pay
  payable/cash-bank), pay employees.
- **FR-757 Statutory forms & reports** — which MoF / NSSF forms exactly (R3/R5/R6?),
  end-of-service indemnity, annual declarations; export format.
- **FR-758 Payslip** — layout, languages, delivery (print/PDF/email).

**Open questions:**
- [ ] Is **attendance/time tracking** in MVP scope, or just fixed monthly salaries?
- [ ] Multi-currency payroll (USD/LBP salaries), or single currency per employee?
- [ ] End-of-service indemnity + leave accrual in MVP, or later?
- [ ] Which exact statutory forms are mandatory at go-live?

**YOUR INPUT (paste FRs here):**
```
(FR-7xx … acceptance criteria …)
```

---

## 2. Session Management (MVP — platform/user-wide, NOT POS)

**Status:** awaiting your detailed FRs.
**What I understand it to be:** management of **user login sessions across the
whole platform** (all users, all modules) — e.g. viewing who is logged in,
controlling and revoking sessions. (This is distinct from the POS cash-drawer
"session" in FR-702, and from the auth-hardening items already parked in
`docs/DEFERRED.md`.)

**What I need from you (suggested FR breakdown — confirm/correct my assumptions):**
- **FR-2xx Active sessions view** — who can see it (admin only? each user their
  own?); what's shown (user, IP, device, location, login time, last activity,
  current company). Legacy had `ConnectedUsers` (see PRD FR-201).
- **FR-2xx Session revocation** — "log out this session" / "log out everywhere";
  admin force-logout of another user; what invalidates the refresh token.
- **FR-2xx Session policy** — idle-timeout duration, absolute max session length,
  concurrent-session limit per user, remember-me behaviour.
- **FR-2xx Session events / audit** — login/logout/expiry logged to the audit trail.

**Open questions:**
- [ ] Exactly what does "session management" cover for you — the above, or more?
- [ ] Admin scope: platform-admin only, or company-admin can manage sessions of
      users in their company?
- [ ] Any regulatory driver (forced re-login interval, single-session enforcement)?

**YOUR INPUT (paste FRs here):**
```
(FR-xxx … acceptance criteria …)
```

---

## 3. Device Management (MVP — platform/user-wide, NOT POS)

**Status:** awaiting your detailed FRs.
**What I understand it to be:** management of the **devices users sign in from**
across the platform (web browsers, the Flutter mobile app, POS terminals as
clients) — registering, trusting, listing, and revoking devices. (This is distinct
from the POS *peripheral* hardware in FR-704 — printers/scanners/scales.)

**What I need from you (suggested FR breakdown — confirm/correct my assumptions):**
- **FR-2xx Device registry** — what counts as a "device" (browser fingerprint,
  mobile install id, named POS station); fields (name, type, OS/app, first-seen,
  last-seen, owning user, company/branch).
- **FR-2xx Device trust / approval** — must a new device be approved before it can
  log in? Who approves? "Trusted device" to skip 2FA / extend session?
- **FR-2xx Device revocation** — user or admin revokes a device → its sessions die
  and it can't reconnect without re-approval.
- **FR-2xx Device binding** — bind a POS station / license to a branch; enforce a
  per-company device limit; block unknown devices.

**Open questions:**
- [ ] Is device management about **security** (trust/revoke sign-in devices),
      **licensing** (limit how many stations a company runs), **POS station
      registry** (name + branch-bind terminals), or all three?
- [ ] Approval workflow required for new devices, or just visibility + revoke?
- [ ] Who administers it — platform admin, company admin, or the user?

**YOUR INPUT (paste FRs here):**
```
(FR-xxx … acceptance criteria …)
```

---

## Resolved (moved into PRD)

_Nothing yet. Items move here once you've supplied the detail and I've ported it
into `docs/PRD.md`._
