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

JWT payload structure:
{
  "sub": "user-uuid",
  "companyId": "company-uuid",
  "branchId": "branch-uuid or null",
  "roles": ["accountant"],
  "iat": 1234567890,
  "exp": 1234567890
}

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
