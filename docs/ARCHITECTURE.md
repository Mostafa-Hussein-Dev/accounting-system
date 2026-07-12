# Architecture

## System overview
accounting-system is the backend API of a multi-tenant, dual-currency ERP
platform for Lebanese trading companies. It is a NestJS application that
exposes REST API endpoints consumed by:
- A React web back-office (admin, accounting, invoicing, purchasing)
- A Flutter POS terminal (offline-capable, syncs on reconnect)
- A Flutter mobile app (managers, warehouse staff)

This repo contains the backend only. Frontend repos are separate.

## Stack
| Layer | Technology |
|---|---|
| Framework | NestJS v11 (single app, not monorepo) |
| HTTP engine | Express adapter (`@nestjs/platform-express`) |
| Language | TypeScript — strict mode enabled |
| ORM | Prisma |
| Database | PostgreSQL 17 |
| Cache / Queues | Redis 8 — provisioned in `docker-compose.yml`, not yet consumed by any app code (no BullMQ/redis client installed). `MailerService` sends email synchronously rather than queueing, precisely because this isn't wired up yet — see Password reset flow below. |
| Authorization | CASL (@casl/ability) |
| Validation | Zod (config) + class-validator (DTOs) |
| Email | Nodemailer, SMTP — mailpit container in dev (`docker-compose.yml`, web UI at `http://localhost:8025`) |
| Rate limiting | `@nestjs/throttler`, applied per-route (not globally) — currently only `POST /auth/forgot-password` and `/auth/reset-password` |
| API Docs | @nestjs/swagger (Swagger UI + OpenAPI export) |
| Runtime | Node.js 24 LTS |
| Package manager | npm |
| Containerization | Docker + Docker Compose |

## Folder structure

src/
  common/           <- shared cross-cutting code (guards, filters,
                       interceptors, decorators, types, mailer)
  config/           <- environment config and validation
  prisma/           <- PrismaService and schema
  modules/          <- one folder per business domain
    auth/
    users/
    companies/
    branches/
    accounts/       <- chart of accounts
    currencies/
    partners/       <- customers and suppliers
    items/
    inventory/
    purchasing/
    invoicing/
    payments/
    gl/             <- general ledger and journal entries
    reports/
    pos/
    admin/
docs/               <- architecture, conventions, API design, data model

## Module rules
Each module owns its domain exclusively. Boundaries are strict:

- A module's controller handles HTTP only — routing, request parsing,
  response shaping. Zero business logic in controllers.
- A module's service contains all business logic for that domain.
- A module must never directly import another module's service.
  Cross-module communication goes through the NestJS module system
  (imports/exports).
- A module exports only what other modules strictly need.
- Shared utilities live in common/ — never duplicated across modules.

## Multi-tenancy
Every database table has a company_id column. Every request from an
authenticated user carries a company_id in their JWT payload. Company-scoped
data is read and written exclusively through PrismaService.forTenant(companyId)
(src/prisma/prisma.service.ts) — a Prisma Client Extension that forces
company_id into every where clause and every write for tenant-scoped models,
so a query made through it cannot omit or override the tenant boundary. This
is enforced at the application layer, not the database layer: there is no
Postgres Row-Level Security in this system. The bare (unscoped) PrismaService
stays available on purpose, for deliberate cross-tenant admin operations
(e.g. a platform admin viewing data across companies) — it is not a bypass to
guard against, it is the intended escape hatch for that use case.

## Authentication flow
1. Client sends POST /api/v1/auth/login
2. Server returns access_token (short-lived) + refresh_token (long-lived)
3. Client sends access_token in Authorization: Bearer <token> header
4. JWT payload carries: userId, companyId, branchId, roles[]
5. JwtAuthGuard validates token on every protected route
6. RolesGuard + CASL AbilityFactory check permissions after auth

A forgotten password does not go through this flow at all — see
`docs/API-DESIGN.md` → Password reset and `docs/MODELS.md` →
PasswordResetToken. `POST /auth/forgot-password` /
`POST /auth/reset-password` are unauthenticated by definition (that's the
point) and issue no JWTs of their own; a successful reset instead revokes
every existing refresh token for that user, ending every other session.

## Deployment
- Local dev: Docker Compose (api + postgres + redis + mailpit)
- Production: containerized, behind Nginx reverse proxy, with TLS
- The POS terminal requires HTTPS (for WebUSB/WebSerial hardware APIs)
