<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../../.github/assets/logo-light.svg">
    <img alt="Invect" src="../../../.github/assets/logo-dark.svg" width="50">
  </picture>
</p>

<h1 align="center">@invect/user-auth</h1>

<p align="center">
  Authentication plugin for Invect, powered by Better Auth.
  <br />
  <a href="https://invect.dev/docs/plugins"><strong>Docs</strong></a>
</p>

---

Adds user authentication, session management, and auth UI components to Invect. Built on [Better Auth](https://www.better-auth.com/).

## Install

```bash
pnpm add @invect/user-auth better-auth
```

## Backend

```ts
import { betterAuth } from 'better-auth';
import { userAuth } from '@invect/user-auth';
import { createInvectRouter } from '@invect/express';

const auth = betterAuth({
  database: { url: 'file:./auth.db', type: 'sqlite' },
  emailAndPassword: { enabled: true },
});

app.use('/invect', createInvectRouter({
  database: { type: 'sqlite', connectionString: 'file:./dev.db', id: 'main' },
  plugins: [
    userAuth({
      auth,
      globalAdmins: [{
        email: process.env.INVECT_ADMIN_EMAIL,
        pw: process.env.INVECT_ADMIN_PASSWORD,
        name: 'Admin',
      }],
    }),
  ],
}));
```

Sign-up is disabled in the UI. The initial admin is seeded from `globalAdmins`. Subsequent users are created by admins through the user management UI or API.

## Frontend

```tsx
import { Invect, InvectShell } from '@invect/ui';
import { AuthenticatedInvect } from '@invect/user-auth/ui';
import '@invect/ui/styles';

<AuthenticatedInvect
  apiBaseUrl="/api/invect"
  basePath="/invect"
  InvectComponent={Invect}
  ShellComponent={InvectShell}
  theme="light"
/>
```

Or compose manually:

```tsx
import { AuthProvider, AuthGate, SignInPage, UserButton } from '@invect/user-auth/ui';

<AuthProvider baseUrl="http://localhost:3000/invect">
  <AuthGate fallback={<SignInPage />}>
    <Invect apiBaseUrl="http://localhost:3000/invect" />
  </AuthGate>
</AuthProvider>
```

## Exports

| Entry Point | Content |
|---|---|
| `@invect/user-auth` | Backend plugin (Node.js) |
| `@invect/user-auth/ui` | Frontend components — `AuthProvider`, `AuthGate`, `SignInForm`, `UserButton`, `AuthenticatedInvect` |
| `@invect/user-auth/types` | Shared types |

## What It Does

**Backend** — Proxies auth routes (sign-in, session, OAuth) at `/plugins/auth/*`. Resolves sessions on every Invect API request. Maps Better Auth roles to Invect RBAC roles.

**Frontend** — `AuthProvider` for session state, `AuthGate` for conditional rendering, `SignInForm` / `UserButton` for auth UI.

## License

[MIT](../../../LICENSE)
