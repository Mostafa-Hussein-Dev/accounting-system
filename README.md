# accounting-system

Backend API for a multi-tenant, dual-currency ERP platform built for
Lebanese trading companies.

## Tech stack
- NestJS v11 + Fastify
- TypeScript (strict)
- Prisma + PostgreSQL 16
- Redis + BullMQ
- CASL authorization
- Swagger / OpenAPI

## Documentation
Before writing any code, read these files in order:

1. docs/ARCHITECTURE.md — system overview, stack, module boundaries
2. docs/CONVENTIONS.md — naming, structure, forbidden patterns
3. docs/API-DESIGN.md — response shapes, money fields, Swagger rules
4. docs/MODELS.md — data model, accounting invariants, business rules
5. docs/PRD_Paradox_v2_Detailed_Developer_Edition.md — full product requirements

## Getting started
(To be filled in once Docker Compose and Prisma are configured)

## API documentation
Once running, Swagger UI is available at:
http://localhost:3000/api/docs
