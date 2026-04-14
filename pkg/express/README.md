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
npx invect-cli init
```

Or install manually:

```bash
npm install @invect/core @invect/express
```

## Usage

```ts
import express from 'express';
import { createInvectRouter } from '@invect/express';

const app = express();

const invectRouter = await createInvectRouter({
  database: {
    type: 'sqlite',
    connectionString: 'file:./dev.db',
  },
  encryptionKey: process.env.INVECT_ENCRYPTION_KEY, // npx invect-cli secret
});

app.use('/invect', invectRouter);
app.listen(3000);
```

That's it. The router handles initialization, batch polling, and all API routes.

## With Plugins

```ts
import { authentication } from '@invect/user-auth';
import { rbacPlugin } from '@invect/rbac';

const invectRouter = await createInvectRouter({
  database: { type: 'sqlite', connectionString: 'file:./dev.db' },
  encryptionKey: process.env.INVECT_ENCRYPTION_KEY,
  plugins: [
    authentication({ globalAdmins: [{ email: 'admin@example.com', pw: 'secret' }] }),
    rbacPlugin(),
  ],
});

app.use('/invect', invectRouter);
```

## Frontend

Pair with [`@invect/ui`](../ui) for the visual flow editor:

```tsx
import { Invect } from '@invect/ui';
import '@invect/ui/styles';

<Invect apiBaseUrl="http://localhost:3000/invect" />;
```

## License

[MIT](../../LICENSE)
