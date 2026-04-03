# @invect/user-auth

Better Auth integration for [Invect](https://github.com/invect/invect). Adds user authentication, session management, identity resolution, and auth UI components.

## Install

```bash
pnpm add @invect/user-auth better-auth
```

## Usage

### Backend

```ts
import { betterAuth } from 'better-auth';
import { userAuth } from '@invect/user-auth';
import { createInvectRouter } from '@invect/express';

// 1. Configure better-auth
const auth = betterAuth({
  database: { url: 'file:./auth.db', type: 'sqlite' },
  emailAndPassword: { enabled: true },
});

// 2. Add the plugin
app.use('/invect', createInvectRouter({
  databaseUrl: 'file:./dev.db',
  plugins: [
    userAuth({
      auth,
      globalAdmins: [
        {
          email: process.env.INVECT_ADMIN_EMAIL,
          pw: process.env.INVECT_ADMIN_PASSWORD,
          name: 'Admin',
        },
      ],
    }),
  ],
}));
```

`globalAdmins` is the explicit source of truth for seeded admin accounts. If you
want to use environment variables, wire them into that array yourself.

### Frontend

```tsx
import { AuthProvider, useAuth, SignInForm, UserButton, AuthGate } from '@invect/user-auth/ui';

function App() {
  return (
    <AuthProvider baseUrl="http://localhost:3000/invect">
      <AuthGate fallback={<SignInPage />}>
        <Header />
        <MainApp />
      </AuthGate>
    </AuthProvider>
  );
}

function Header() {
  return (
    <header>
      <UserButton />
    </header>
  );
}

function SignInPage() {
  return <SignInForm onSuccess={() => window.location.reload()} />;
}
```

## Package Exports

| Entry Point | Import | Content |
|-------------|--------|---------|
| `@invect/user-auth` | `import { userAuth } from '@invect/user-auth'` | Backend plugin (Node.js) |
| `@invect/user-auth/ui` | `import { AuthProvider, useAuth } from '@invect/user-auth/ui'` | Frontend components (Browser) |
| `@invect/user-auth/types` | `import type { AuthUser } from '@invect/user-auth/types'` | Shared types |

## What It Does

### Backend (`@invect/user-auth`)
- **Proxies auth routes** — Sign-in, sign-up, OAuth, session endpoints at `/plugins/auth/*`
- **Resolves sessions** — Every Invect API request calls `auth.api.getSession()` to populate `InvectIdentity`
- **Maps roles** — better-auth user roles align with Invect RBAC (`owner`, `editor`, `operator`, `viewer`), preserve `admin`, and fall back to `default` for no global access
- **Middleware helper** — `createSessionResolver()` for use as `auth.resolveUser` callback

### Frontend (`@invect/user-auth/ui`)
- **AuthProvider** — Context provider that fetches session state and provides sign-in/sign-up/sign-out actions
- **useAuth()** — Hook for accessing current user, auth state, and actions
- **SignInForm** — Email/password sign-in form
- **SignUpForm** — Email/password sign-up form
- **UserButton** — User avatar with dropdown (name, email, role, sign-out)
- **AuthGate** — Conditionally renders children based on auth state

## Docs

Full documentation: [invect.dev/docs/authentication](https://invect.dev/docs/authentication)

## License

MIT
