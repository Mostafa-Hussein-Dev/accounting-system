# API Design

Every endpoint in this project follows these rules without exception.
Consistency is non-negotiable — any developer or frontend engineer reading
this API must find it predictable, clean, and self-documenting.

## Base URL structure

/api/v1/{resource}

Examples:
- /api/v1/invoices
- /api/v1/partners
- /api/v1/auth/login
- /api/v1/reports/trial-balance

Versioning is in the URL path. When a breaking change is needed,
/api/v2/ is introduced — v1 is never broken.

## HTTP methods
| Action | Method | Example |
|---|---|---|
| List all | GET | GET /api/v1/invoices |
| Get one | GET | GET /api/v1/invoices/:id |
| Create | POST | POST /api/v1/invoices |
| Update | PATCH | PATCH /api/v1/invoices/:id |
| Delete (soft) | DELETE | DELETE /api/v1/invoices/:id |
| Custom action | POST | POST /api/v1/invoices/:id/confirm |
| Sub-resource | GET | GET /api/v1/partners/:id/statement |

PATCH is used for updates, never PUT (partial updates only).
Custom business actions (confirm, post, reverse, void) use POST
on a sub-route.

## Response envelope
Every response — success or error — is wrapped in the same envelope.

Success (single object):
{
  "data": {
    "id": "uuid",
    "docNumber": "INV-2025-0001"
  },
  "meta": null
}

Success (list / paginated):
{
  "data": [...],
  "meta": {
    "total": 142,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}

Error:
{
  "data": null,
  "error": {
    "code": "INVOICE_NOT_FOUND",
    "message": "Invoice with id abc-123 was not found",
    "field": null
  }
}

The envelope shape never changes. Frontend always reads data.data or
data.error — never something else.

## Pagination
All list endpoints accept these query params:
- page (default: 1)
- limit (default: 20, max: 100)
- sortBy (field name, default: createdAt)
- sortOrder (asc | desc, default: desc)

Example: GET /api/v1/invoices?page=2&limit=20&sortBy=date&sortOrder=desc

## Filtering
Filters are passed as query params, prefixed by field name:
- GET /api/v1/invoices?status=confirmed
- GET /api/v1/invoices?dateFrom=2025-01-01&dateTo=2025-03-31
- GET /api/v1/partners?type=customer&hasBalance=true

## Registration
`POST /api/v1/auth/register` is how a company comes into existence via
self-service: it creates a company and its first user atomically (one
transaction — either both are created or neither is), then immediately
returns a token pair (same shape as `POST /auth/login`) so the new user is
authenticated with no separate login step. The new user is made a **member**
of the company (UserCompany) and assigned the **Company Admin** role for it, and
the company is auto-provisioned (chart/VAT/sequences). Body shape: `{ company:
{...same fields as POST /companies, minus ownerUserId}, user: {...same fields as
POST /users, minus companyId} }`. An existing user creates *additional*
companies via `POST /companies` instead.

## Password reset
A code-based flow (not a link) across three endpoints, all unauthenticated:

- `POST /auth/forgot-password` — body `{ email }`. **Always returns 200 with
  the same generic body, whether or not the email belongs to a registered,
  active account** — this endpoint must never be usable to enumerate
  registered emails via its response, status code, or (as much as
  practical) timing. If the account exists, a 6-digit code is emailed
  (`src/common/mailer/mailer.service.ts`, mailpit in dev — see
  `docker-compose.yml` and its web UI at `http://localhost:8025`) and a
  `PasswordResetToken` row is created; if a live (unconsumed) code was
  already issued in the last 30 seconds, this silently no-ops rather than
  sending another email — same generic response either way.
- `POST /auth/verify-reset-code` — body `{ email, code }`. Lets the client
  show a "code accepted" new-password step before the user has typed a new
  password, **without consuming the code or changing anything** —
  `reset-password` below still re-validates the code itself and is what
  actually spends it, so a verified-but-abandoned code (e.g. the user
  reloads mid-flow) stays usable. Shares the same error codes, attempts
  ceiling, and throttle as `reset-password` (see below) — this endpoint is
  just as capable of being brute-forced against, so it counts against the
  same per-code attempts ceiling rather than getting its own.
- `POST /auth/reset-password` — body `{ email, code, newPassword }`. On
  success: the password is updated, the code is marked consumed
  (single-use), and **every existing refresh token for that user is
  revoked** — a reset invalidates all other sessions, not just future
  logins. Errors (shared with `verify-reset-code`):
  - 400 `AUTH_INVALID_RESET_CODE` (field: `code`) — wrong code, no live
    code exists, the code expired (15 minutes), or it was already used.
    Deliberately the same code for all four cases, and also thrown for an
    unrecognized email — none of these should be distinguishable to the
    caller.
  - 429 `AUTH_TOO_MANY_ATTEMPTS` — 5 wrong attempts against the current
    live code (across both `verify-reset-code` and `reset-password`
    combined); the caller must request a new one (`forgot-password` again)
    rather than keep guessing.

All three endpoints are throttled per-route (`@nestjs/throttler`, 3
requests/15 min) — not globally, so this doesn't affect login/register/
refresh. See `PasswordResetToken` in `docs/MODELS.md` for why a low-entropy
6-digit code is safe here (short TTL + attempts ceiling + one live code per
user, not the hash strength alone).

## Company-scoped endpoints and platform admin access
Any endpoint scoped to one company resolves its target company via
`@CurrentCompanyId()` (src/modules/auth/decorators/current-company-id.decorator.ts):
- A normal, company-scoped user is always pinned to their own company — this
  cannot be overridden by a query param, so a regular user can never escalate
  into another tenant's data.
- A platform admin/support user (a user with no company on their own account)
  has no "own" company to default to, so they must name one explicitly:
  `GET /api/v1/accounts?companyId=<uuid>`. Omitting it returns 400
  `COMPANY_ID_QUERY_PARAM_REQUIRED`; an invalid value returns 400
  `INVALID_COMPANY_ID`-shaped validation (same code, field: "companyId").
- Routes restricted to platform admin/support only use `PlatformAdminGuard`
  alongside `JwtAuthGuard`, returning 403 `PLATFORM_ADMIN_REQUIRED` for a
  company-scoped caller.

### Companies (multi-company membership)
A user can belong to many companies (see docs/MODELS.md). The JWT carries the
**active** company; `POST /auth/switch-company` re-issues a token scoped to
another of the user's companies (login can also pre-select via `companyId`).
- `POST /companies` — any authenticated user. A company user becomes the
  **owner** (member + Company Admin) of the new company, which is auto-
  provisioned (chart/VAT/sequences); a platform admin may attach it to a user
  via `ownerUserId`. Brand-new-user signup still uses `POST /auth/register`.
- `GET /companies` (list) — a platform admin sees all companies; a company user
  sees only **the companies they belong to** (their memberships). This is how an
  owner lists their own companies.
- `GET /companies/:id` — platform admin (any company), or any user who is a
  **member** of `:id` (`CompanySelfOrAdminGuard`, membership-checked) — not just
  their active one. A non-member gets 403 `COMPANY_ACCESS_DENIED`.
- `PATCH`/`DELETE /companies/:id` — same tenancy check as above, PLUS a
  permission check (`PermissionsGuard` + `@RequirePermissions`): the caller
  must hold the `company.update`/`company.delete` permission, granted by the
  `Company Admin` role. A company-scoped user without that role gets 403
  `PERMISSION_DENIED` even though `CompanySelfOrAdminGuard` would otherwise
  let them through — viewing your own company is open to any member, editing
  or deleting it requires the admin role specifically.

### Invitations (adding people to a company)
`POST /users` creates a **brand-new** account in the caller's active company. To
add someone — especially an **existing** user (multi-company) — use invitations
(consent-based):
- `POST /invitations` (admin, `user.create`) — `{ email, firstName, lastName,
  roleIds, duration }`. Creates a pending `Invitation` (no user yet) and emails
  an **accept link** with a token; a brand-new email also gets a **temp
  password**. `duration` (`InvitationDuration` enum) sets `expiresAt`.
- `POST /invitations/accept` — **public**, `{ token }`. Creates the user (if the
  email is new) or just adds membership (existing user), grants the roles, and
  marks the invite accepted. Rejects an already-accepted (409) or expired (400)
  token. Users are created **on acceptance**, so unaccepted/expired invites
  leave no orphan accounts.
- `GET /invitations` (`user.read`) lists the company's invitations;
  `DELETE /invitations/:id` (`user.delete`) revokes a pending one.
- `GET /invitations/durations` returns the selectable `InvitationDuration`
  options (`value`, `label`, `days`) for the frontend's dropdown.

**Temp-password one-time use.** A user created via invitation acceptance is
flagged `mustChangePassword`. On login the flag is returned in the response
*and* baked into the JWT; while set, **every route except `POST
/auth/change-password`, `GET /auth/me`, and logout returns 403
`PASSWORD_CHANGE_REQUIRED`** (enforced in `JwtAuthGuard`, not just the
frontend). `POST /auth/change-password` (`{ currentPassword, newPassword }`)
verifies the current password, sets the new one, clears the flag, revokes all
other sessions, and returns a fresh token pair — so the temp password
authenticates exactly once.

### Permissions
`GET /permissions` (`permission.read`, Company Admin) returns the full permission
catalogue (`id, key, subject, action, description`) — for a frontend building a
custom-role editor (roles take permission **ids** in `permissionIds`).

### Users
- Every route requires authentication only (`JwtAuthGuard`) — there's no
  extra route guard; scoping happens inside `UsersService` via the same
  `PrismaService.forTenant()` mechanism used for tenant data (platform admin
  gets the bare client, a company-scoped caller gets
  `forTenant(their own companyId)` — see the Company-scoped section above).
- Role assignment: `POST`/`PATCH /users` accept an optional `roleIds` array.
  A company-scoped caller creating a teammate without specifying `roleIds`
  defaults to the `Company Member` role, so nobody is ever role-less.
  Removing the `Company Admin` role from a user (via `PATCH`) or soft-deleting
  a user (`DELETE`) is blocked with 409 `LAST_COMPANY_ADMIN` if it would leave
  their company with zero admins.

### Roles and permissions (CASL)
- A user can hold multiple roles; their effective permissions are the union
  across all of them (`CaslAbilityFactory`, src/modules/casl/casl-ability.factory.ts,
  queries fresh on every request — see the JWT section above for why).
- Any route can require a permission via `@RequirePermissions({action, subject})`
  alongside `PermissionsGuard` (src/modules/casl/guards/permissions.guard.ts),
  returning 403 `PERMISSION_DENIED` when the caller's roles don't grant it.
  A platform admin (`companyId === null`) always passes every check — CASL
  grants them `manage all` without a database lookup.
- **Permissions are fixed/seeded, not creatable via the API** — a permission
  only means something if some `@RequirePermissions` check in code actually
  enforces it; letting anyone invent one would create a dead, misleading
  entry. `GET /roles` requires `role.read`.
- **Roles support two kinds of ownership**: global (`companyId: null` —
  available to every tenant, e.g. the seeded `Company Admin`/`Company Member`)
  and tenant-owned custom roles (`companyId` set — visible and usable only
  within that company). `GET /roles`: platform admin sees every role; a
  company-scoped caller sees global roles plus their own company's custom
  roles only.
- `POST /roles` (`role.create`): platform admin may omit `companyId` (global
  role) or supply one (a custom role on behalf of that company); a
  company-scoped caller is always forced into their own company. Two
  different companies may each have a role with the same name (a database
  constraint on `[companyId, name]`); creating a second *global* role with a
  duplicate name is rejected with 409 `ROLE_NAME_ALREADY_EXISTS` (checked at
  the application level, since a nullable column in a compound unique
  constraint can't enforce that in Postgres).
- `PATCH`/`DELETE /roles/:id` (`role.update`/`role.delete`): platform admin
  can touch any non-system role; a company-scoped caller only their own
  company's custom roles — 403 `ROLE_ACCESS_DENIED` for a global role or
  another company's role. **System roles** (the two seeded roles) can never
  be updated or deleted by anyone, including platform admin — 403
  `SYSTEM_ROLE_PROTECTED` — since `AuthService.register()` and the
  last-company-admin guard depend on `Company Admin` existing under that
  exact name. Deleting a role currently assigned to any user is blocked with
  409 `ROLE_IN_USE` rather than cascading or reassigning.

## HTTP status codes used
| Code | When |
|---|---|
| 200 | Successful GET, PATCH, custom action |
| 201 | Successful POST (resource created) |
| 204 | Successful DELETE (no body returned) |
| 400 | Bad request — invalid input, business rule violation |
| 401 | Unauthenticated — missing or invalid token |
| 403 | Unauthorized — valid token but insufficient permissions |
| 404 | Resource not found |
| 409 | Conflict — duplicate, already posted, already paid |
| 422 | Validation error — field-level errors from DTO validation |
| 500 | Internal server error — never expose details to client |

## Money fields convention
Every monetary value in every response contains exactly these 4 fields,
never just a plain number:

{
  "total": {
    "amountOriginal": 8950000,
    "currency": "LBP",
    "rate": 89500,
    "amountBase": 100.00
  }
}

- amountOriginal: the amount in the original transaction currency
- currency: ISO 4217 currency code (USD or LBP)
- rate: exchange rate used (LBP per 1 USD)
- amountBase: the equivalent in the company base currency (USD)

Frontend always displays amountOriginal with currency.
Accounting always uses amountBase for calculations.
Never send a bare number for a monetary value.

## Date and time conventions
- All dates are ISO 8601 strings in UTC: "2025-06-03T14:30:00.000Z"
- Date-only fields use "2025-06-03" format
- The client sends dates in UTC, the server stores in UTC
- Display formatting (timezone, locale) is the frontend's responsibility

## Authentication header
All protected endpoints require:
Authorization: Bearer <access_token>

JWT payload structure (this is the actual, current shape — see
src/modules/auth/interfaces/jwt-payload.interface.ts):
{
  "sub": "user-uuid",
  "companyId": "the ACTIVE company for this token (null = platform admin, or a
                multi-company user who has not selected one yet)",
  "isPlatformAdmin": true/false,
  "iat": 1234567890,
  "exp": 1234567890
}

`companyId` is the one company the token acts in, verified against membership at
login/switch and re-verified on every company-scoped request by
`CompanyMembershipGuard`. `isPlatformAdmin` (not "companyId === null") is what
marks a platform/support account.

Roles and permissions are deliberately NOT embedded in the token — they're
resolved fresh from the database on every request by CaslAbilityFactory
(src/modules/casl/casl-ability.factory.ts), keyed off `sub`. This trades a
small per-request DB lookup for immediate revocation: removing a role takes
effect on the user's very next request, with no token refresh required.

## Swagger documentation rules
Every endpoint must have:
- @ApiOperation({ summary: '...' }) — one clear sentence
- @ApiResponse({ status: 200, description: '...', type: ResponseDto })
- @ApiResponse({ status: 404, description: '...' }) for relevant errors
- @ApiBearerAuth() on every protected route
- @ApiTags('Module Name') on every controller

Response DTOs must have @ApiProperty({ description, example }) on
every field. The Swagger UI must be self-sufficient — a frontend
developer must understand every endpoint without asking the backend team.

## Postman collection conventions
- One folder per module matching the module name
- Requests named as: "Get all invoices", "Create invoice",
  "Confirm invoice"
- Environment variables used for: {{baseUrl}}, {{accessToken}},
  {{companyId}}
- Every request has an example response saved
- Auth requests have a test script that auto-saves the token:
  pm.environment.set("accessToken", pm.response.json().data.accessToken)
