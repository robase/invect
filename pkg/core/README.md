# @invect/core

Framework-agnostic core package for Invect workflow execution engine.

## Overview

This package contains the core business logic for Invect, including:

- Flow management and execution
- Node type implementations (Template String, Language Model, SQL Query, If-Else)
- Database operations using Drizzle ORM
- Framework-agnostic service interfaces

## Installation

```bash
npm install @invect/core @invect/types
```

## Quick Start

```typescript
import { CoreConfigBuilder, InvectCore } from '@invect/core';

// Create configuration
const config = new CoreConfigBuilder()
  .database({
    url: 'postgresql://localhost:5432/invect',
    type: 'postgresql'
  })
  .anthropicApiKey('your-anthropic-key')
  .build();

// Initialize core
const core = new InvectCore(config, logger, databaseAdapter);
await core.initialize();

// Use services
const flow = await core.flowService.createFlow({
  name: 'My Workflow',
  description: 'A sample workflow'
});
```

## Configuration

### Environment Variables

- `FLOW_DB_URL` - Database connection string
- `ANTHROPIC_API_KEY` - Anthropic API key for LLM nodes
- `OPENAI_API_KEY` - OpenAI API key for LLM nodes
- `FLOW_DEFAULT_TIMEOUT` - Default execution timeout (ms)
- `FLOW_MAX_CONCURRENT` - Maximum concurrent executions
- `FLOW_ENABLE_TRACING` - Enable execution tracing
- `FLOW_LOG_LEVEL` - Logging level (debug, info, warn, error)

### Configuration Builder

```typescript
import { createConfigFromEnv } from '@invect/core';

const config = createConfigFromEnv()
  .execution({
    defaultTimeout: 30000,
    maxConcurrentExecutions: 5
  })
  .build();
```

## Supported Databases

- PostgreSQL
- SQLite
- MySQL

## Node Types

- **Template String Node**: Text templating with variable substitution
- **Language Model Node**: AI text generation using Anthropic Claude or OpenAI
- **SQL Query Node**: Database query execution
- **If-Else Node**: Conditional flow control

## Development

```bash
# Build
npm run build

# Development mode
npm run dev

# Type checking
npm run type-check

# Database operations
npm run db:generate  # Generate migrations
npm run db:migrate   # Run migrations
npm run db:studio    # Open Drizzle Studio
```

## License

MIT
