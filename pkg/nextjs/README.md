<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/logo-light.svg">
    <img alt="Invect" src="../../.github/assets/logo-dark.svg" width="50">
  </picture>
</p>

<h1 align="center">@invect/nextjs</h1>

<p align="center">
  Next.js App Router handler for Invect.
  <br />
  <a href="https://invect.dev/docs/integrations/nextjs"><strong>Docs</strong></a> · <a href="https://invect.dev/docs/quick-start"><strong>Quick Start</strong></a>
</p>

---

Add Invect to any Next.js app with a single catch-all API route. Handles all endpoints — flows, executions, credentials, agent tools, and OAuth2.

## Install

```bash
npx invect-cli init
```

Or install manually:

```bash
npm install @invect/core @invect/nextjs
```

## Usage

Create a catch-all route in your Next.js App Router:

```ts
// app/api/invect/[...invect]/route.ts
import { createInvectHandler } from '@invect/nextjs';

const handler = createInvectHandler({
  database: {
    type: 'sqlite',
    connectionString: process.env.DATABASE_URL || 'file:./dev.db',
  },
  encryptionKey: process.env.INVECT_ENCRYPTION_KEY!, // npx invect-cli secret
});

export const GET = handler.GET;
export const POST = handler.POST;
export const PUT = handler.PUT;
export const PATCH = handler.PATCH;
export const DELETE = handler.DELETE;
```

All Invect API endpoints are now available under `/api/invect/`.

## Frontend

Add the flow editor to any page:

```tsx
// app/invect/[[...slug]]/page.tsx
import { Invect } from '@invect/ui';
import '@invect/ui/styles';

export default function InvectPage() {
  return <Invect apiBaseUrl="/api/invect" basePath="/invect" />;
}
```

## License

[MIT](../../LICENSE)
