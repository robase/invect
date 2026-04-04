<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-light.svg">
    <img alt="Invect" src=".github/assets/logo-dark.svg" width="50">
  </picture>
</p>

<h1 align="center">invect</h1>

<p align="center">
  Drop-in AI workflows for your Node.js app.
  <br />
  <a href="https://invect.dev/docs"><strong>Documentation</strong></a> · <a href="https://invect.dev/docs/quick-start"><strong>Quick Start</strong></a> · <a href="https://github.com/robase/flow-backend"><strong>GitHub</strong></a>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
</p>

---

Invect is an open-source workflow orchestration library you mount directly into your existing Express, NestJS, or Next.js app. Visual flow editor, AI agent nodes, 50+ built-in integrations, and batch processing — all as a library, not a platform.

## Quick Start

```bash
npx invect-cli init
```

Or install manually:

```bash
npm install @invect/core @invect/express @invect/ui
```

### Backend

```ts
import express from 'express';
import { createInvectRouter } from '@invect/express';

const app = express();

app.use('/invect', createInvectRouter({
  database: {
    type: 'sqlite',
    connectionString: 'file:./dev.db',
    id: 'main',
  },
}));

app.listen(3000);
```

### Frontend

```tsx
import { Invect } from '@invect/ui';
import '@invect/ui/styles';

export default () => (
  <Invect apiBaseUrl="http://localhost:3000/invect" />
);
```

## Features

- **Visual Flow Editor** — Drag-and-drop workflow builder with real-time execution monitoring.
- **AI Agent Nodes** — Iterative tool-calling loops with OpenAI and Anthropic APIs.
- **50+ Built-in Actions** — Gmail, Slack, GitHub, Google Drive, Linear, Postgres, and more.
- **Batch Processing** — Cut AI costs 50% with native OpenAI and Anthropic batch APIs.
- **AI-Assisted Builder** — Describe what you need in plain language and the assistant wires up nodes for you.
- **Multi-Database** — SQLite, PostgreSQL, and MySQL via Drizzle ORM.
- **OAuth2 Credentials** — AES-256-GCM encrypted credential storage with full OAuth2 support.
- **Framework Agnostic** — One core, thin adapters for Express, NestJS, and Next.js.

## Packages

| Package | Description |
|---|---|
| [`@invect/core`](pkg/core) | Framework-agnostic engine — flows, execution, actions, database |
| [`@invect/express`](pkg/express) | Express router adapter |
| [`@invect/nestjs`](pkg/nestjs) | NestJS module adapter |
| [`@invect/nextjs`](pkg/nextjs) | Next.js App Router handler |
| [`@invect/ui`](pkg/ui) | React flow editor and dashboard |
| [`@invect/cli`](pkg/cli) | CLI for schema generation, migrations, and project setup |
| [`@invect/user-auth`](pkg/plugins/auth) | Authentication plugin (Better Auth) |
| [`@invect/rbac`](pkg/plugins/rbac) | Role-based access control plugin |

## Examples

| Example | Stack | Purpose |
|---|---|---|
| [`express-drizzle`](examples/express-drizzle) | Express + SQLite | Primary backend dev server |
| [`vite-react-frontend`](examples/vite-react-frontend) | Vite + React | Standalone frontend for the flow editor |
| [`nextjs-app-router`](examples/nextjs-app-router) | Next.js 15 | Self-contained Next.js example |
| [`nextjs-drizzle-auth-rbac`](examples/nextjs-drizzle-auth-rbac) | Next.js + Auth + RBAC | Full-featured example with plugins |

## Development

```bash
pnpm install
pnpm dev           # Interactive menu
pnpm dev:fullstack # Express backend + Vite frontend
pnpm test          # Unit + integration tests
pnpm test:pw       # Playwright tests
pnpm typecheck     # Type-check all packages
```

## License

[MIT](LICENSE)
