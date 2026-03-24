# @invect/nextjs

Next.js integration for Invect - easily add Invect API routes to your Next.js application.

## Installation

```bash
npm install @invect/nextjs @invect/core
# or
npm install invect
```

If you install the main `invect` package, you can import from the nextjs subpath:

```typescript
import { createInvectHandler } from "invect/nextjs";
```

## Quick Start

Create a catch-all API route in your Next.js app:

```typescript
// app/api/invect/[...invect]/route.ts
import { createInvectHandler } from "@invect/nextjs";

const config = {
  database: {
    type: "sqlite" as const,
    connection: {
      filename: "./invect.db"
    }
  },
  ai: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY!
    }
  }
};

const handler = createInvectHandler(config);

export const GET = handler.GET;
export const POST = handler.POST;
export const PUT = handler.PUT;
export const DELETE = handler.DELETE;
```

This creates all Invect API endpoints under `/api/invect/`:

- Flow management (`/api/invect/flows/*`)
- Flow execution (`/api/invect/flows/*/run`, `/api/invect/flow-runs/*`)
- Node testing (`/api/invect/node-data/*`)
- And more...

## Usage

### Frontend Integration

```typescript
// Create a flow
const response = await fetch('/api/invect/flows', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: "My Flow",
    description: "A sample workflow"
  })
});

// List flows
const flows = await fetch('/api/invect/flows/list', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ limit: 10 })
});

// Execute a flow
const execution = await fetch('/api/invect/flows/my-flow-id/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    inputs: { message: "Hello World" }
  })
});
```

### Configuration

The handler accepts the same `InvectConfig` as the core Invect class:

```typescript
import type { InvectConfig } from "@invect/nextjs";

const config: InvectConfig = {
  database: {
    type: "postgres", // or "sqlite"
    connection: process.env.DATABASE_URL!
  },
  ai: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY!
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY!
    }
  },
  execution: {
    maxConcurrentNodes: 10,
    nodeTimeoutMs: 30000
  }
};
```

### Individual Endpoints

For more control, create individual endpoint handlers:

```typescript
// app/api/flows/route.ts
import { createInvectEndpoint } from "@invect/nextjs";

const { createEndpoint } = createInvectEndpoint(config);

export const POST = createEndpoint(async (core, request) => {
  const body = await request.json();
  const flow = await core.createFlow(body);
  return NextResponse.json(flow, { status: 201 });
});
```

## API Reference

See the [Invect Core documentation](../core/README.md) for complete API reference and configuration options.

## Examples

- [Next.js App Router Example](../../examples/nextjs-app-router/)
- [Next.js Pages Router Example](../../examples/nextjs-pages-router/)

## TypeScript Support

Full TypeScript support with all Invect types:

```typescript
import type { 
  Flow, 
  FlowRun, 
  CreateFlowRequest 
} from "@invect/nextjs";
```