<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../../.github/assets/logo-light.svg">
    <img alt="Invect" src="../../../.github/assets/logo-dark.svg" width="50">
  </picture>
</p>

<h1 align="center">@invect/rbac</h1>

<p align="center">
  Role-based access control plugin for Invect.
  <br />
  <a href="https://invect.dev/docs/plugins"><strong>Docs</strong></a>
</p>

---

Adds flow-level permissions, sharing UI, and access control enforcement to Invect. Requires [`@invect/user-auth`](../auth) for session resolution.

## Install

```bash
pnpm add @invect/rbac
```

## Backend

```ts
import { authentication } from '@invect/user-auth';
import { rbacPlugin } from '@invect/rbac';

const invectRouter = await createInvectRouter({
  database: { type: 'sqlite', connectionString: 'file:./dev.db' },
  encryptionKey: process.env.INVECT_ENCRYPTION_KEY!,
  plugins: [
    authentication({ globalAdmins: [{ email: 'admin@example.com', pw: 'secret' }] }), // Must come first
    rbacPlugin(),
  ],
});

app.use('/invect', invectRouter);
```

## Frontend

```tsx
import { Invect } from '@invect/ui';
import { rbacFrontendPlugin } from '@invect/rbac/ui';

<Invect apiBaseUrl="http://localhost:3000/invect" plugins={[rbacFrontendPlugin]} />;
```

The plugin contributes sidebar items, an access management page, a flow-level access panel tab, and a share button in the flow editor header.

## Exports

| Entry Point          | Content                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `@invect/rbac`       | Backend plugin (Node.js)                                                                    |
| `@invect/rbac/ui`    | Frontend plugin — `rbacFrontendPlugin`, `RbacProvider`, `ShareFlowModal`, `FlowAccessPanel` |
| `@invect/rbac/types` | Shared types — `FlowAccessRecord`, `FlowAccessPermission`, etc.                             |

## License

[MIT](../../../LICENSE)
