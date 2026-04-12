# Release Process

This monorepo uses [Changesets](https://github.com/changesets/changesets) for version management and automated publishing via GitHub Actions.

## Overview

```
feature branch → PR (CI + commitlint) → merge to main
                                              │
                                  ┌───────────┴───────────┐
                                  ▼                       ▼
                          Pending changesets?        No changesets
                                  │                    (no-op)
                                  ▼
                    Opens PR: "chore: version packages"
                    (bumps versions + updates CHANGELOGs)
                                  │
                                  ▼
                         Merge version PR
                                  │
                                  ▼
                    Publishes to npm + creates GitHub releases
```

## Day-to-Day Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feat/my-feature
```

### 2. Make Changes with Conventional Commits

All commits are validated against the [Conventional Commits](https://www.conventionalcommits.org/) spec on PRs.

```bash
git commit -m "feat(core): add new validation logic"
git commit -m "fix(ui): resolve sidebar flicker"
```

#### Commit Types

| Type       | When to Use                          |
|------------|--------------------------------------|
| `feat`     | New feature                          |
| `fix`      | Bug fix                              |
| `docs`     | Documentation only                   |
| `style`    | Formatting, missing semicolons, etc. |
| `refactor` | Code change that neither fixes nor adds |
| `perf`     | Performance improvement              |
| `test`     | Adding or updating tests             |
| `build`    | Build system or external deps        |
| `ci`       | CI configuration                     |
| `chore`    | Maintenance tasks                    |
| `revert`   | Reverting a previous commit          |

#### Scopes (Optional)

Scopes map to package names: `core`, `express`, `nestjs`, `nextjs`, `ui`, `cli`, `layouts`, `auth`, `rbac`, `webhooks`, `version-control`, `cloudflare-agents`, `mcp`, `docs`, `deps`.

### 3. Add a Changeset

Before opening a PR, describe what changed for consumers:

```bash
pnpm changeset
```

This walks you through:
1. **Which packages changed** — select the affected `@invect/*` packages
2. **Semver bump** — `patch` (bug fix), `minor` (new feature), or `major` (breaking change)
3. **Summary** — a short description that goes into the CHANGELOG

A `.changeset/<random-id>.md` file is created. Commit it with your PR.

> **When to skip changesets:** Internal-only changes (CI, tests, docs, dev tooling) that don't affect published packages don't need a changeset.

### 4. Open a Pull Request

Push and open a PR to `main`. CI will:

- **Lint commits** — validates conventional commit format
- **Build** — builds all packages
- **Format / Lint / Typecheck** — code quality checks
- **Test** — runs the test suite

### 5. Merge to Main

Once CI passes and the PR is approved, merge to `main`.

## What Happens on Merge

The [release workflow](.github/workflows/release.yml) runs on every push to `main`:

### If There Are Pending Changesets

The `changesets/action` opens (or updates) a **version PR** titled `"chore: version packages"` on the `changeset-release/main` branch. This PR:

- Bumps `version` fields in each affected `package.json`
- Updates `CHANGELOG.md` for each affected package
- Updates internal `workspace:*` dependency versions

### If You Merge the Version PR

The release workflow detects there are no pending changesets (they were consumed) and:

1. **Builds** all packages
2. **Publishes** changed packages to npm (`pnpm publish -r --access public`)
3. **Tags** each published package (e.g., `@invect/core@0.1.0`)
4. **Creates GitHub releases** linking to the package CHANGELOG

## Published Packages

All packages under `pkg/` are published to npm as `@invect/*`. Example apps and the root package are excluded.

| Package | npm Name |
|---------|----------|
| `pkg/core` | `@invect/core` |
| `pkg/express` | `@invect/express` |
| `pkg/nestjs` | `@invect/nestjs` |
| `pkg/nextjs` | `@invect/nextjs` |
| `pkg/ui` | `@invect/ui` |
| `pkg/cli` | `@invect/cli` |
| `pkg/layouts` | `@invect/layouts` |
| `pkg/invect` | `invect-cli` |
| `pkg/plugins/auth` | `@invect/user-auth` |
| `pkg/plugins/rbac` | `@invect/rbac` |
| `pkg/plugins/webhooks` | `@invect/webhooks` |
| `pkg/plugins/version-control` | `@invect/version-control` |
| `pkg/plugins/cloudflare-agents` | `@invect/cloudflare-agents` |
| `pkg/plugins/mcp` | `@invect/mcp` |

## Configuration

### Changesets (`.changeset/config.json`)

- **`access: "public"`** — all packages are public on npm
- **`baseBranch: "main"`** — changesets are compared against `main`
- **`updateInternalDependencies: "patch"`** — when a dependency bumps, dependents get a patch bump
- **`ignore`** — example apps are excluded from versioning

### Commitlint (`commitlint.config.mjs`)

Extends `@commitlint/config-conventional`. Commit types and scopes are enforced on pull requests via the `commitlint` CI job.

## Required Secrets

| Secret | Where | Purpose |
|--------|-------|---------|
| `NPM_PUB_TOKEN` | GitHub Actions secrets | npm publish authentication |
| `GITHUB_TOKEN` | Automatic | PR creation, tagging, GitHub releases |

## Manual Release (Emergency)

If you need to bypass the automated flow:

```bash
pnpm version-packages   # consume changesets, bump versions
pnpm release             # build + publish to npm
```
