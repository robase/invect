# Action Templates

## API Read Action (GET / List)

For actions that fetch data from an external API.

````typescript
/**
 * {provider}.{action_name} — {Brief description}
 *
 * {Longer description of what this action does.}
 * Requires a {Provider Name} OAuth2 credential.
 */

import { defineAction } from '../define-action';
import { MY_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const paramsSchema = z.object({
  credentialId: z.string().min(1, '{Provider} credential is required'),
  // Add action-specific params with sensible defaults
  maxResults: z.number().int().min(1).max(100).optional().default(10),
  query: z.string().optional().default(''),
});

export const myListAction = defineAction({
  id: 'my_provider.list_items',
  name: 'List Items',
  description:
    'List items from My Provider (items.list). Use when the user wants to browse, search, or retrieve items.\n\n' +
    'Example response:\n' +
    '```json\n' +
    '{"id": "item_123", "name": "My Item", "status": "active", "createdAt": "2024-01-15T10:00:00Z"}\n' +
    '```',
  provider: MY_PROVIDER,
  actionCategory: 'read',
  tags: ['my_provider', 'list', 'search', 'read', 'items'],

  credential: {
    required: true,
    type: 'oauth2',
    oauth2Provider: 'my_provider',
    requiredScopes: ['read'],
    description: 'My Provider OAuth2 credential',
  },

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'credentialId',
        label: 'Credential',
        type: 'text',
        required: true,
        description: 'My Provider OAuth2 credential for authentication',
        aiProvided: false,
      },
      {
        name: 'maxResults',
        label: 'Max Results',
        type: 'number',
        defaultValue: 10,
        description: 'Maximum number of items to return (1–100)',
        aiProvided: true,
      },
      {
        name: 'query',
        label: 'Search Query',
        type: 'text',
        placeholder: 'search terms...',
        description: 'Optional search/filter query',
        aiProvided: true,
      },
    ],
  },

  async execute(params, context) {
    const { credentialId, maxResults, query } = params;

    // 1. Resolve credential
    let credential = context.credential;
    if (!credential && context.functions?.getCredential) {
      credential = await context.functions.getCredential(credentialId);
    }
    if (!credential?.config?.accessToken) {
      return {
        success: false,
        error:
          'My Provider credential not found or missing access token. Please connect a My Provider account.',
      };
    }

    const accessToken = credential.config.accessToken as string;

    context.logger.debug('Executing my_provider.list_items', { maxResults, hasQuery: !!query });

    try {
      const url = new URL('https://api.example.com/v1/items');
      url.searchParams.set('limit', String(maxResults));
      if (query?.trim()) url.searchParams.set('q', query);

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `My Provider API error (${response.status}): ${errorBody}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        output: data,
        metadata: { count: Array.isArray(data.items) ? data.items.length : 0 },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list items: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
````

---

## API Write Action (POST / PUT / DELETE)

For actions that create, update, or delete via an external API.

````typescript
/**
 * {provider}.{action_name} — {Brief description}
 */

import { defineAction } from '../define-action';
import { MY_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const paramsSchema = z.object({
  credentialId: z.string().min(1, '{Provider} credential is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().default(''),
});

export const myCreateAction = defineAction({
  id: 'my_provider.create_item',
  name: 'Create Item',
  description:
    'Create a new item in My Provider (items.create). Use when the user wants to add or create a new item.\n\n' +
    'Example response:\n' +
    '```json\n' +
    '{"id": "item_456", "name": "New Item", "status": "active", "createdAt": "2024-01-15T10:00:00Z"}\n' +
    '```',
  provider: MY_PROVIDER,
  actionCategory: 'write',
  tags: ['my_provider', 'create', 'add', 'write', 'item'],

  credential: {
    required: true,
    type: 'oauth2',
    oauth2Provider: 'my_provider',
    requiredScopes: ['read', 'write'],
    description: 'My Provider OAuth2 credential with write permissions',
  },

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'credentialId',
        label: 'Credential',
        type: 'text',
        required: true,
        description: 'My Provider OAuth2 credential for authentication',
        aiProvided: false,
      },
      {
        name: 'name',
        label: 'Name',
        type: 'text',
        required: true,
        placeholder: 'My new item',
        description: 'Name for the new item',
        aiProvided: true,
      },
      {
        name: 'description',
        label: 'Description',
        type: 'textarea',
        placeholder: 'Optional description...',
        description: 'Optional description for the item',
        extended: true,
        aiProvided: true,
      },
    ],
  },

  async execute(params, context) {
    const { credentialId, name, description } = params;

    let credential = context.credential;
    if (!credential && context.functions?.getCredential) {
      credential = await context.functions.getCredential(credentialId);
    }
    if (!credential?.config?.accessToken) {
      return {
        success: false,
        error: 'My Provider credential not found or missing access token.',
      };
    }

    const accessToken = credential.config.accessToken as string;

    try {
      const response = await fetch('https://api.example.com/v1/items', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, description }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `My Provider API error (${response.status}): ${errorBody}`,
        };
      }

      const data = await response.json();
      return { success: true, output: data };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create item: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
````

---

## Core Utility Action (No External API)

For data transformation, logic, or internal operations that don't call external APIs.

```typescript
/**
 * core.{action_name} — {Brief description}
 */

import { defineAction } from '../define-action';
import { CORE_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const paramsSchema = z.object({
  input: z.string().min(1, 'Input is required'),
});

export const myUtilityAction = defineAction({
  id: 'core.my_utility',
  name: 'My Utility',
  description:
    'Transform data using my utility. Upstream node outputs are available via template expressions.',
  provider: CORE_PROVIDER,
  tags: ['utility', 'transform', 'data'],

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'input',
        label: 'Input',
        type: 'text',
        required: true,
        description: 'The input to process',
      },
    ],
  },

  async execute(params, context) {
    const { input } = params;
    try {
      const result = input.toUpperCase(); // Replace with actual logic
      return { success: true, output: result };
    } catch (error) {
      return {
        success: false,
        error: `Utility error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
```

---

## Description Pattern

Every action description for an external API MUST follow this pattern:

```
{What it does} ({API method name}). {When an AI agent should use this.}

Example response:
\`\`\`json
{2-5 representative fields from the actual API response}
\`\`\`
```

Example:

````
description:
  'List emails from Gmail inbox (messages.list). Use when checking email, finding messages, or searching the inbox.\n\n'
  + 'Example response:\n'
  + '```json\n'
  + '{"id": "msg_123", "threadId": "thread_456", "subject": "Meeting notes", "from": "alice@example.com", "snippet": "Here are the notes..."}\n'
  + '```'
````

For core utility actions (no external API), skip the response shape — just describe when to use the action.
