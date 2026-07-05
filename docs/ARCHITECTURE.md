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
| HTTP engine | Fastify adapter |
| Language | TypeScript — strict mode enabled |
| ORM | Prisma |
| Database | PostgreSQL 16 |
| Cache / Queues | Redis 7 + BullMQ |
| Authorization | CASL (@casl/ability) |
| Validation | Zod (config) + class-validator (DTOs) |
| API Docs | @nestjs/swagger (Swagger UI + OpenAPI export) |
| Runtime | Node.js 22 LTS |
| Package manager | npm |
| Containerization | Docker + Docker Compose |

## Folder structure

src/
  common/           <- shared cross-cutting code (guards, filters,
                       interceptors, decorators, types)
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
authenticated user carries a company_id in their JWT payload. Every
query is automatically scoped to that company_id. PostgreSQL Row-Level
Security (RLS) enforces this at the database level as a hard wall —
even a buggy query cannot leak data across companies.

## Authentication flow
1. Client sends POST /api/v1/auth/login
2. Server returns access_token (short-lived) + refresh_token (long-lived)
3. Client sends access_token in Authorization: Bearer <token> header
4. JWT payload carries: userId, companyId, branchId, roles[]
5. JwtAuthGuard validates token on every protected route
6. RolesGuard + CASL AbilityFactory check permissions after auth

## Deployment
- Local dev: Docker Compose (api + postgres + redis)
- Production: containerized, behind Nginx reverse proxy, with TLS
- The POS terminal requires HTTPS (for WebUSB/WebSerial hardware APIs)
