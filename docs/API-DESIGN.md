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
authenticated with no separate login step. That first user is conceptually
the company's admin/owner, though this isn't formally modeled yet (no
`Role`/`user_company_role` table) — it's a known, accepted gap until roles
and permissions (CASL) are implemented. Body shape: `{ company: {...same
fields as POST /companies}, user: {...same fields as POST /users, minus
companyId} }`.

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

### Companies
- `POST /companies` and `GET /companies` (list) — platform admin only
  (`PlatformAdminGuard`). Direct company creation is an admin provisioning
  action; self-service company creation goes through `POST /auth/register`.
- `GET /companies/:id` — platform admin (any company), or any user whose own
  `companyId` matches `:id` (`CompanySelfOrAdminGuard`). A company-scoped
  user acting on another company gets 403 `COMPANY_ACCESS_DENIED`.
- `PATCH`/`DELETE /companies/:id` — same tenancy check as above, PLUS a
  permission check (`PermissionsGuard` + `@RequirePermissions`): the caller
  must hold the `company.update`/`company.delete` permission, granted by the
  `Company Admin` role. A company-scoped user without that role gets 403
  `PERMISSION_DENIED` even though `CompanySelfOrAdminGuard` would otherwise
  let them through — viewing your own company is open to any member, editing
  or deleting it requires the admin role specifically.

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
  "companyId": "company-uuid or null (null = platform admin/support)",
  "iat": 1234567890,
  "exp": 1234567890
}

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
