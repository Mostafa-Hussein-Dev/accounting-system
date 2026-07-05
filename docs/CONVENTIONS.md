# Conventions

These conventions are mandatory. Every file in this project must follow
them without exception. When in doubt, follow the convention — do not invent.

## File naming
- All files use kebab-case: invoice.service.ts, create-invoice.dto.ts
- Test files mirror the source file: invoice.service.spec.ts
- Index barrel files are named index.ts
- DTOs are suffixed with .dto.ts
- Entities/models are suffixed with .entity.ts
- Interfaces are suffixed with .interface.ts
- Types are suffixed with .type.ts
- Guards are suffixed with .guard.ts
- Interceptors are suffixed with .interceptor.ts
- Decorators are suffixed with .decorator.ts
- Filters are suffixed with .filter.ts
- Strategies are suffixed with .strategy.ts

## Class and variable naming
- Classes: PascalCase -> InvoiceService, CreateInvoiceDto
- Variables and functions: camelCase -> invoiceTotal, calculateVat()
- Constants: SCREAMING_SNAKE_CASE -> MAX_CREDIT_LIMIT
- Enums: PascalCase name, SCREAMING_SNAKE_CASE values
- Database fields in Prisma schema: snake_case -> company_id, created_at
- API response fields: camelCase -> companyId, createdAt
- Environment variables: SCREAMING_SNAKE_CASE -> DATABASE_URL

## Module structure
Every domain module must have exactly this structure:

modules/invoicing/
  dto/
    create-invoice.dto.ts
    update-invoice.dto.ts
    invoice-response.dto.ts
  invoicing.controller.ts
  invoicing.service.ts
  invoicing.module.ts
  index.ts

## Controller conventions
- One controller per module
- Controller is responsible for: routing, auth guards, parsing request,
  calling service, returning response
- Controllers must never contain business logic
- Every route must have @ApiOperation, @ApiResponse, and @ApiBearerAuth
  decorators
- Every route must use @UseGuards(JwtAuthGuard)
- Route methods are named clearly: findAll, findOne, create, update,
  remove, confirm, post, reverse
- Controllers never call Prisma directly — only the module's service

## Service conventions
- One service per module
- Services contain all business logic
- Services call Prisma for data access
- Services never import another module's service directly
- Any operation touching more than one table must use Prisma $transaction
- All money calculations go through MoneyService — never inline arithmetic
  on monetary values
- Methods are named after what they do, not how:
  confirmInvoice() not runPostingEngineAndUpdateStock()

## DTO conventions
- All DTOs use class-validator decorators for validation
- All DTO fields have @ApiProperty() with description and example
- Create DTOs never include id, created_at, updated_at — server sets these
- Response DTOs always include id, created_at, updated_at
- Never return raw Prisma models from controllers — always map to a
  response DTO
- Sensitive fields (password_hash, internal cost prices for unauthorized
  roles) are never included in response DTOs

## Error handling
- All errors are thrown as NestJS HttpExceptions
- The global HttpExceptionFilter normalizes every error to this shape:

{
  "error": {
    "code": "INVOICE_NOT_FOUND",
    "message": "Invoice with id X was not found",
    "field": null
  }
}

- Error codes are SCREAMING_SNAKE_CASE strings, domain-prefixed:
  AUTH_INVALID_CREDENTIALS, INVOICE_ALREADY_POSTED,
  STOCK_INSUFFICIENT_QUANTITY
- Never expose stack traces or internal Prisma errors to the client
- Validation errors from class-validator are caught by the global
  ValidationPipe and returned as 422 with field-level detail

## Forbidden patterns
These patterns are banned across the entire codebase:

- No any type — use unknown and narrow it
- No raw SQL strings outside of designated reporting queries in the
  reports module
- No business logic in controllers
- No direct Prisma calls in controllers
- No cross-module service imports — use NestJS module exports
- No hardcoded monetary values, VAT rates, or exchange rates —
  always read from database config
- No floating point arithmetic on money — use integer cents or
  a dedicated Money value object
- No hard deletes on financial records — use soft delete (deleted_at)
- No storing computed balances — always derive from journal_line aggregation

## Soft delete pattern
Financial records (invoices, journal entries, payments, stock movements)
are never hard deleted. All such tables have a deleted_at: DateTime?
column. Deletion sets deleted_at to the current timestamp. All queries
filter where: { deleted_at: null } by default.

## Audit log pattern
Every mutating operation (POST, PUT, PATCH, DELETE) on a financial entity
is automatically logged by the AuditInterceptor to the audit_log table with:
- user_id
- company_id
- action (CREATE, UPDATE, DELETE, CONFIRM, VOID, REVERSE)
- entity name
- entity id
- before state (JSON)
- after state (JSON)
- IP address
- timestamp

## Git conventions
- Branch naming: feature/module-name, fix/issue-description,
  chore/task-name
- Commit messages follow Conventional Commits:
  feat(invoicing): add confirm endpoint
  fix(auth): refresh token expiry
  chore(prisma): add stock_movement migration
- Never commit directly to main
- main branch = production-ready code only
- develop branch = integration branch for features
