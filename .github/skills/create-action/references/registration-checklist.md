# Registration Checklist

After creating an action file, complete these steps to register it in the system.

## Existing Provider

If the provider already has a directory and barrel:

### 1. Export from provider barrel

Edit `pkg/core/src/actions/<provider>/index.ts`:

```typescript
// Add named export
export { myNewAction } from './my-new-action';

// Add to array import
import { myNewAction } from './my-new-action';

// Add to provider actions array
export const myProviderActions: ActionDefinition[] = [
  myExistingAction,
  myNewAction, // ← Add here
];
```

Done — `allBuiltinActions` in `pkg/core/src/actions/index.ts` already spreads the provider array.

## New Provider

If this is the first action for a new provider:

### 1. Add ProviderDef to `providers.ts`

Edit `pkg/core/src/actions/providers.ts`:

```typescript
export const MY_PROVIDER: ProviderDef = {
  id: 'my_provider',
  name: 'My Provider',
  icon: 'Cloud',
  category: 'utility',
  nodeCategory: 'Integrations',
  description: 'My Provider integration',
  docsUrl: 'https://docs.example.com/api',
};
```

### 2. Create provider barrel

Create `pkg/core/src/actions/<provider>/index.ts`:

```typescript
export { myAction } from './my-action';

import type { ActionDefinition } from '../types';
import { myAction } from './my-action';

export const myProviderActions: ActionDefinition[] = [myAction];
```

### 3. Register in main barrel

Edit `pkg/core/src/actions/index.ts` — add in **three** places:

```typescript
// 1. Provider export (in the "Providers" section)
export { MY_PROVIDER } from './providers';

// 2. Action bundle export (in the "Action bundles" section)
export { myProviderActions } from './my-provider';

// 3. Import + spread into allBuiltinActions (in the array)
import { myProviderActions } from './my-provider';

export const allBuiltinActions: ActionDefinition[] = [
  // ... existing ...
  ...myProviderActions,
];
```

### 4. Add OAuth2 provider (if applicable)

If the provider uses OAuth2, add the provider definition to `pkg/core/src/services/credentials/oauth2-providers.ts`.

## Verification

After registration, verify with:

```bash
# Typecheck passes
pnpm typecheck

# Action appears in the registry (start dev server, check /agent/tools)
pnpm dev:fullstack
```
