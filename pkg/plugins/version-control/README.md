<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../../.github/assets/logo-light.svg">
    <img alt="Invect" src="../../../.github/assets/logo-dark.svg" width="50">
  </picture>
</p>

<h1 align="center">@invect/version-control</h1>

<p align="center">
  Version control plugin for Invect.
  <br />
  <a href="https://invect.dev/docs/plugins"><strong>Docs</strong></a>
</p>

---

Sync Invect flows to GitHub (and other Git providers) as readable `.flow.ts` TypeScript files. Supports push, pull, PR-based publishing, and bidirectional sync.

## Install

```bash
pnpm add @invect/version-control
```

## Backend

```ts
import { versionControl } from '@invect/version-control';
import { githubProvider } from '@invect/version-control/providers/github';

const invectRouter = await createInvectRouter({
  database: { type: 'sqlite', connectionString: 'file:./dev.db' },
  encryptionKey: process.env.INVECT_ENCRYPTION_KEY!,
  plugins: [
    versionControl({
      provider: githubProvider({ auth: process.env.GITHUB_TOKEN! }),
      repo: 'org/my-flows',
    }),
  ],
});

app.use('/invect', invectRouter);
```

### Options

```ts
versionControl({
  provider: githubProvider({ auth: '...' }), // Git hosting provider
  repo: 'owner/repo', // Default repository (owner/name)
  defaultBranch: 'main', // Target branch
  path: 'flows/', // Directory in the repo for flow files
  mode: 'pr-per-publish', // "pr-per-publish" | "auto-sync" | "manual-only"
  syncDirection: 'push', // "push" | "pull" | "bidirectional"
  webhookSecret: '...', // Webhook secret for PR merge events
});
```

## Features

- **Push/pull** — Sync flows to and from a Git repository.
- **PR-based publishing** — Create pull requests for flow changes, merge to deploy.
- **Bidirectional sync** — Keep flows in sync between Invect and Git.
- **Readable exports** — Flows are serialized as `.flow.ts` TypeScript files.
- **Sync history** — Full audit trail of sync operations with commit SHAs.

## Exports

| Entry Point                                | Content                  |
| ------------------------------------------ | ------------------------ |
| `@invect/version-control`                  | Backend plugin (Node.js) |
| `@invect/version-control/providers/github` | GitHub provider          |
| `@invect/version-control/types`            | Shared types             |

## License

[MIT](../../../LICENSE)
