<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/logo-light.svg">
    <img alt="Invect" src="../../.github/assets/logo-dark.svg" width="50">
  </picture>
</p>

<h1 align="center">@invect/express</h1>

<p align="center">
  Express adapter for Invect.
  <br />
  <a href="https://invect.dev/docs/integrations/express"><strong>Docs</strong></a> · <a href="https://invect.dev/docs/quick-start"><strong>Quick Start</strong></a>
</p>

---

Mount Invect into any Express app with a single router. All API endpoints — flows, executions, credentials, agent tools, OAuth2 — are handled automatically.

## Install

```bash
npm install @invect/core @invect/express
```

## Usage

```ts
import express from 'express';
import { createInvectRouter } from '@invect/express';

const app = express();

app.use('/invect', createInvectRouter({
  baseDatabaseConfig: {
    type: 'sqlite',
    connectionString: 'file:./dev.db',
    id: 'main',
  },
}));

app.listen(3000);
```

That's it. The router handles initialization, batch polling, and all API routes.

## With Plugins

```ts
import { userAuth } from '@invect/user-auth';
import { rbacPlugin } from '@invect/rbac';

app.use('/invect', createInvectRouter({
  baseDatabaseConfig: { type: 'sqlite', connectionString: 'file:./dev.db', id: 'main' },
  plugins: [userAuth({ auth }), rbacPlugin()],
}));
```

## Frontend

Pair with [`@invect/frontend`](../frontend) for the visual flow editor:

```tsx
import { Invect } from '@invect/frontend';
import '@invect/frontend/styles';

<Invect apiBaseUrl="http://localhost:3000/invect" />
```

## License

[MIT](../../LICENSE)
