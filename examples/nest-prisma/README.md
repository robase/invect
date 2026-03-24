# Acme SaaS — NestJS + Prisma + PostgreSQL

A realistic SaaS application example using NestJS, Prisma ORM, and PostgreSQL.
Demonstrates how to add **Invect** workflow orchestration to an existing app
via the `npx invect generate --adapter prisma` CLI.

## Prerequisites

- Node.js 18+
- Docker (for PostgreSQL)
- pnpm

## Quick Start

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies (from monorepo root)
pnpm install

# 3. Push the base SaaS schema to the database
npx prisma db push

# 4. (Optional) Seed sample data
npx prisma db seed

# 5. Start the dev server
pnpm start:dev
```

The API will be available at `http://localhost:3001/invect`.

## Adding Invect

After the base SaaS app is running with its own tables:

```bash
# 1. Generate Invect tables into the existing Prisma schema
npx invect generate --adapter prisma --config invect.config.ts --dialect postgresql --yes

# 2. Push the updated schema (SaaS + Invect tables) to PostgreSQL
npx prisma db push

# 3. Restart the dev server - Invect is now active
pnpm start:dev
```

## Project Structure

```
docker-compose.yml        # PostgreSQL 16 container (port 5433)
invect.config.ts         # Invect CLI config (plugins, DB connection)
prisma/
  schema.prisma           # SaaS schema + Invect tables (after generate)
  seed.ts                 # Sample org/user/project data
src/
  app.module.ts           # NestJS root module (InvectModule.forRoot)
  app.controller.ts       # Health endpoint
  app.service.ts
  main.ts                 # Bootstrap
.env.example              # Environment variables template
```

## Database

PostgreSQL 16 via Docker on port **5433** (not 5432, to avoid conflicts):

```
postgresql://invect:invect@localhost:5433/acme_saas
```

### SaaS Schema (pre-Invect)

- `organizations` - multi-tenant orgs with billing plans
- `users` - user accounts
- `members` - org membership with roles (OWNER/ADMIN/MEMBER/VIEWER)
- `projects` - projects within orgs
- `api_keys` - per-project API keys

### After invect generate

The Prisma schema gains all Invect core tables: `flows`, `flow_versions`,
`flow_executions`, `execution_traces`, `batch_jobs`, `credentials`, etc.
Existing SaaS models are preserved untouched.
