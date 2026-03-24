# Simple Invect Express Example

A minimal TypeScript Express app showing how to integrate Invect.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run in development:
   ```bash
   pnpm db:prepare
   pnpm dev
   ```

   `pnpm db:prepare` generates the merged Invect schema from `invect.config.ts`,
   normalizes the generated SQLite schema for this example's TypeScript build,
   then applies it to `dev.db` via `drizzle-kit push`, and finally ensures
   plugin-owned SQLite tables such as `webhook_triggers` exist.

   `pnpm dev`, `pnpm dev:tsx`, and `pnpm dev:debug` automatically run
   `pnpm db:prepare` when `dev.db` does not exist, so a fresh clone boots
   without manual setup while repeat starts avoid re-pushing the same schema.

   Use `pnpm db:migrate` if you want to apply generated SQL migrations to a fresh
   database. For the long-lived local `dev.db`, prefer `pnpm db:prepare`.

3. Test the API:
   ```bash
   # Get all flows
   curl http://localhost:3000/invect/flows

   # Create a flow
   curl -X POST http://localhost:3000/invect/flows \
     -H "Content-Type: application/json" \
     -d '{"name": "My Flow", "description": "A test flow"}'

   # Execute a flow (use the flow ID from above)
   curl -X POST http://localhost:3000/invect/flows/FLOW_ID/execute \
     -H "Content-Type: application/json" \
     -d '{"inputs": {"name": "World"}}'
   ```

## What it does

- Creates a simple Express server with Invect integration
- Uses Invect Core directly with basic REST endpoints
- Provides CRUD operations for flows and executions
- Shows minimal setup - just initialize Invect Core and create routes

This demonstrates the simplest way to integrate Invect with Express without additional dependencies.
