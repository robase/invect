<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/logo-light.svg">
    <img alt="Invect" src="../../.github/assets/logo-dark.svg" width="50">
  </picture>
</p>

<h1 align="center">@invect/frontend</h1>

<p align="center">
  React flow editor and dashboard for Invect.
  <br />
  <a href="https://invect.dev/docs"><strong>Docs</strong></a> · <a href="https://invect.dev/docs/quick-start"><strong>Quick Start</strong></a>
</p>

---

A single React component that gives you a complete workflow editor, execution viewer, credential manager, and AI assistant. Built with React Flow, Tailwind CSS, and Radix UI.

## Install

```bash
npx invect-cli init
```

Or install manually:

```bash
npm install @invect/frontend
```

## Usage

```tsx
import { Invect } from '@invect/frontend';
import '@invect/frontend/styles';

function App() {
  return <Invect apiBaseUrl="http://localhost:3000/invect" />;
}
```

This renders the full Invect UI — flow list, drag-and-drop editor, execution monitoring, and credential management.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `apiBaseUrl` | `string` | `http://localhost:3000/invect` | Backend API URL |
| `basePath` | `string` | `/invect` | Base path for routing |
| `plugins` | `InvectFrontendPlugin[]` | `[]` | Frontend plugins (RBAC, etc.) |
| `reactQueryClient` | `QueryClient` | — | Bring your own React Query client |

## CSS Scoping

All styles are scoped under a `.invect` CSS class. Invect won't interfere with your app's existing styles.

## InvectShell

For plugin UIs that render outside the main app (e.g. sign-in pages), use `InvectShell` to get just the CSS scope without routing or layout:

```tsx
import { InvectShell } from '@invect/frontend';
import '@invect/frontend/styles';

<InvectShell theme="dark">
  <YourCustomUI />
</InvectShell>
```

## License

[MIT](../../LICENSE)

## License

[MIT](../../LICENSE)
