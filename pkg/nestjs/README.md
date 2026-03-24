# invect Backend

# @invect/nestjs

A NestJS module that provides Invect workflow execution capabilities as a thin wrapper over the core Invect engine.

## Installation

```bash
npm install @invect/nestjs @invect/core
```

## Usage

### Basic Usage

Import the `InvectModule` in your application module:

```typescript
import { Module } from '@nestjs/common';
import { InvectModule } from '@invect/nestjs';

@Module({
  imports: [
    InvectModule.forRoot({
      // Invect configuration
      database: {
        type: 'sqlite',
        url: 'file:./dev.db'
      },
      execution: {
        maxConcurrentFlows: 10,
        maxConcurrentNodes: 50
      },
      logging: {
        level: 'info'
      }
    })
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

### Async Configuration

For dynamic configuration (e.g., from environment variables or config service):

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InvectModule } from '@invect/nestjs';

@Module({
  imports: [
    ConfigModule.forRoot(),
    InvectModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        database: {
          type: 'postgres',
          url: configService.get('DATABASE_URL')
        },
        execution: {
          maxConcurrentFlows: configService.get('MAX_CONCURRENT_FLOWS', 10),
          maxConcurrentNodes: configService.get('MAX_CONCURRENT_NODES', 50)
        },
        logging: {
          level: configService.get('LOG_LEVEL', 'info')
        }
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### Using the Invect Service

If you need to access the Invect core instance programmatically in your own services:

```typescript
import { Injectable } from '@nestjs/common';
import { InvectService } from '@invect/nestjs';

@Injectable()
export class MyService {
  constructor(private readonly invectService: InvectService) {}

  async executeMyFlow() {
    const core = this.invectService.getCore();
    
    // Use the core Invect instance
    const flows = await core.listFlows();
    return flows;
  }
}
```

## API Endpoints

The module automatically provides a REST API with the following endpoints:

### Flow Management
- `GET /flows` - List flows with optional filtering and pagination
- `POST /flows` - Create a new flow
- `GET /flows/:id` - Get flow by ID
- `PUT /flows/:id` - Update flow (not yet implemented)
- `DELETE /flows/:id` - Delete flow (not yet implemented)
- `POST /validate-flow` - Validate flow definition

### Flow Version Management
- `GET /flows/:id/versions` - Get flow versions
- `POST /flows/:id/versions` - Create flow version

### Flow Run Execution
- `POST /flows/:flowId/run` - Start flow execution
- `GET /flow-runs` - Get all flow runs
- `GET /flow-runs/:flowRunId` - Get specific flow run
- `GET /flows/:flowId/flow-runs` - Get flow runs for a specific flow
- `POST /flow-runs/:flowRunId/resume` - Resume paused flow execution
- `POST /flow-runs/:flowRunId/cancel` - Cancel flow execution (not yet implemented)
- `POST /flow-runs/:flowRunId/pause` - Pause flow execution (not yet implemented)

### Node Execution
- `GET /flow-runs/:flowRunId/node-executions` - Get node executions for a flow run
- `GET /node-executions` - Get all node executions

### Node Data & Testing
- `POST /node-data/sql-query` - Execute SQL query for testing
- `POST /node-data/jq-query` - Execute JQ query for testing
- `POST /node-data/model-query` - Test model prompt
- `GET /node-data/models` - Get available AI models
- `GET /node-data/databases` - Get available databases

## Custom Route Prefix

To add a custom route prefix for all Invect endpoints, modify the controller registration:

```typescript
@Controller('api/v1/invect')
export class CustomInvectController extends InvectController {}
```

## Features

- **Functionally identical to Express package**: Same API endpoints and behavior
- **Dependency injection**: Invect core instance is properly injected
- **Async configuration**: Support for dynamic configuration
- **Service access**: Direct access to Invect core through `InvectService`
- **Error handling**: Proper NestJS exception handling
- **TypeScript support**: Full type safety

## License

MIT

## Installation

```bash
npm install @robase/@invect/nestjs
```

## Usage

Import and configure the `invectModule` in your NestJS application:

```typescript
import { Module } from '@nestjs/common';
import { invectModule, InvectConfig } from '@robase/@invect/nestjs';

const config: InvectConfig = {
  openAIKey: process.env.OPENAI_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  modelId: 'claude-3-sonnet-20240229',
  databaseType: 'sqlite',
  databaseConnectionString: 'file:./dev.db',
  // Database for SQL query nodes to execute user queries
  DEFAULT_SQL_NODE_DB_CONNECTION_STRING: 'postgresql://user:password@localhost:5432/userdata',
  // Optional: Named databases for specific SQL query nodes
  sqlQueryDatabases: {
    'analytics': 'postgresql://user:password@localhost:5432/analytics',
    'reporting': 'postgresql://user:password@localhost:5432/reporting',
    'warehouse': 'postgresql://user:password@localhost:5432/warehouse'
  }
};

@Module({
  imports: [
    invectModule.forRoot(config)
  ],
})
export class AppModule {}
```

## Configuration

The `InvectConfig` interface accepts the following options:

- `openAIKey?: string` - OpenAI API key (optional if anthropicKey is provided)
- `anthropicKey?: string` - Anthropic API key (optional if openAIKey is provided)
- `modelId: string` - Model identifier to use for text generation
- `databaseType: 'sqlite' | 'postgresql' | 'mysql'` - Database type
- `databaseConnectionString: string` - Database connection string for Invect application data
- `DEFAULT_SQL_NODE_DB_CONNECTION_STRING: string` - Database connection string for SQL query nodes (required)
- `sqlQueryDatabases?: Record<string, string>` - Named database connections for SQL query nodes (optional)

At least one of `openAIKey` or `anthropicKey` must be provided.

### Database Configuration

Invect uses two separate database connections:

1. **Application Database** (`databaseConnectionString`): Stores Invect's internal data including flows, executions, and traces
2. **SQL Query Node Database** (`DEFAULT_SQL_NODE_DB_CONNECTION_STRING`): Default database for SQL query nodes to execute user queries against. If not provided, SQL query nodes will fall back to using the environment variable `SQL_CONFIG`

#### Using Named Databases

SQL query nodes can specify which database to use via the `database_id` parameter:

- **Default behavior**: If no `database_id` is specified, the SQL query node uses `DEFAULT_SQL_NODE_DB_CONNECTION_STRING`
- **Named database**: If `database_id` is specified (e.g., 'analytics'), the node uses the corresponding connection string from `sqlQueryDatabases`

The frontend provides a dropdown in the SQL query node editor to select from available databases.

Example SQL query node configuration:
```json
{
  "type": "sqlQueryNode",
  "data": {
    "query": "SELECT * FROM users WHERE created_at > NOW() - INTERVAL '7 days'",
    "database_type": "postgresql",
    "database_id": "analytics"
  }
}
```

## Features

- **Flow Management**: Create, update, and manage Invect workflows
- **Batch Processing**: Execute workflows with optimized batch processing for AI APIs
- **Multiple Node Types**: Support for template, model, SQL query, and conditional nodes
- **Database Support**: Compatible with SQLite, PostgreSQL, and MySQL
- **Execution Tracking**: Full execution history and tracing
- **Pause/Resume**: Control flow execution with pause and resume capabilities

## API Endpoints

Once imported, the module provides the following REST endpoints:

- `GET /api/flows` - List all flows
- `POST /api/flows` - Create a new flow
- `GET /api/flows/:id` - Get flow details
- `POST /api/flows/:id/versions` - Create new flow version
- `POST /api/executions` - Execute a flow
- `GET /api/executions/:id` - Get execution details

## Database Setup

The module uses Prisma for database operations. Make sure to run migrations after installation:

```bash
npx prisma migrate deploy
```

## License

MIT
