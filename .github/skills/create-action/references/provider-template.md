# Provider Template

When creating a new provider, add a `ProviderDef` constant to `pkg/core/src/actions/providers.ts`:

```typescript
export const MY_PROVIDER: ProviderDef = {
  id: 'my_provider', // snake_case slug — becomes action ID prefix
  name: 'My Provider', // Human-readable name for UI
  icon: 'Cloud', // Lucide icon name (see https://lucide.dev/icons)
  category: 'messaging', // 'core' | 'email' | 'messaging' | 'storage' | 'development' | 'database' | 'utility' | 'other'
  nodeCategory: 'Integrations', // 'Common' | 'AI' | 'Data' | 'Logic' | 'IO' | 'Integrations' | 'Custom' | 'Triggers'
  description: 'Brief provider description for the palette',
  docsUrl: 'https://docs.example.com/api', // REQUIRED — official API reference
};
```

## Rules

- `id` must be snake_case and globally unique across all providers
- `docsUrl` is required for any provider that wraps an external API
- `icon` must be a valid Lucide icon name — browse at https://lucide.dev/icons
- Prefer a static SVG in `pkg/ui/src/assets/provider-icons/{id}.svg` for branded icons
- `category` groups providers in the palette; use existing categories when possible
- `nodeCategory` determines the palette section header

## Common Categories

| category      | For                                                |
| ------------- | -------------------------------------------------- |
| `core`        | Built-in utilities, flow control                   |
| `email`       | Email providers (Gmail, Outlook, Resend)           |
| `messaging`   | Chat/messaging (Slack, Teams, Discord)             |
| `storage`     | File/doc storage (Google Drive, Dropbox, OneDrive) |
| `development` | Dev tools (GitHub, GitLab, Linear, Jira)           |
| `database`    | Databases (PostgreSQL, MySQL)                      |
| `utility`     | Calendars, analytics, misc APIs                    |
| `other`       | Everything else                                    |
