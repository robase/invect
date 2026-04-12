<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/logo-light.svg">
    <img alt="Invect" src="../../.github/assets/logo-dark.svg" width="50">
  </picture>
</p>

<h1 align="center">invect-cli</h1>

<p align="center">
  CLI for managing Invect projects.
  <br />
  <a href="https://invect.dev/docs/cli"><strong>Docs</strong></a> · <a href="https://invect.dev/docs/quick-start"><strong>Quick Start</strong></a>
</p>

---

Schema generation, database migrations, and project setup for Invect. Merges core + plugin schemas and generates dialect-specific Drizzle files for SQLite, PostgreSQL, and MySQL.

This package is a thin wrapper around [`@invect/cli`](https://www.npmjs.com/package/@invect/cli).

## Install

```bash
npm install -D invect-cli
```

Or run directly:

```bash
npx invect-cli <command>
```

## Commands

### `invect-cli init`

Interactive setup wizard. Detects your framework, installs dependencies, creates `invect.config.ts`, generates schemas, and runs the initial migration.

### `invect-cli generate`

Generates Drizzle schema files for all three database dialects from your core + plugin schemas. Reads `invect.config.ts` to discover plugins.

```bash
npx invect-cli generate
```

### `invect-cli migrate`

Applies pending migrations or pushes the schema directly (dev mode).

```bash
npx invect-cli migrate
```

### `invect-cli info`

Displays diagnostic info — system, frameworks, databases, config, and plugins.

### `invect-cli secret`

Generates a cryptographically secure 32-byte base64 key for `INVECT_ENCRYPTION_KEY`.

```bash
npx invect-cli secret
```

## Configuration

The CLI reads from `invect.config.ts` in your project root:

```ts
import { defineConfig } from '@invect/core';

export default defineConfig({
  database: {
    type: 'sqlite',
    connectionString: 'file:./dev.db',
  },
  plugins: [
    // Your plugins here — their schemas are merged automatically
  ],
});
```

## License

[MIT](../../LICENSE)
