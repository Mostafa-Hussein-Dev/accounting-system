# accounting-system

Backend API for a multi-tenant, dual-currency ERP platform built for
Lebanese trading companies.

## Tech stack
- NestJS v11 + Fastify
- TypeScript (strict)
- Prisma + PostgreSQL 17
- Redis + BullMQ
- CASL authorization
- Swagger / OpenAPI

## Documentation
Before writing any code, read these files in order:

1. docs/ARCHITECTURE.md — system overview, stack, module boundaries
2. docs/CONVENTIONS.md — naming, structure, forbidden patterns
3. docs/API-DESIGN.md — response shapes, money fields, Swagger rules
4. docs/MODELS.md — data model, accounting invariants, business rules

## Getting started

### Prerequisites
- Docker Desktop installed and running
- Node.js 22 LTS
- npm

### Local development setup

1. Clone the repository
2. Install dependencies:
   npm install

3. Copy the environment file:
   cp .env.example .env

4. Start the database and Redis:
   docker compose up postgres redis -d

5. Run database migrations:
   npx prisma migrate dev --name init

6. Generate Prisma client:
   npx prisma generate

7. Start the development server:
   npm run dev

8. API is available at: http://localhost:3000/api/v1
9. Swagger UI is available at: http://localhost:3000/api/docs

## API documentation
Once running, Swagger UI is available at:
http://localhost:3000/api/docs
