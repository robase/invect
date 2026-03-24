# Invect

Complete workflow management system with React frontend and NestJS backend for executing Invect workflows with batch processing capabilities.

## Installation

```bash
npm install invect
```

## Usage

### Frontend Components

```typescript
// Import React components and hooks
import { Invect, useApiQueries } from 'invect/frontend';

// Import styles
import 'invect/frontend/styles';

// Use in your React app
function App() {
  return <Invect apiBaseUrl="http://localhost:3000/invect" />;
}
```

### Backend Module

```typescript
// Import NestJS module
import { InvectModule } from 'invect/backend';

@Module({
  imports: [
    InvectModule.forRoot({
      databaseUrl: process.env.DATABASE_URL,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    }),
  ],
})
export class AppModule {}
```

## Package Structure

- `invect/frontend` - React components, hooks, and utilities
- `invect/backend` - NestJS module with services and controllers

@Module({
  imports: [
    ConfigModule.forRoot(),
    FlowBackendModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        FLOW_DB_URL: configService.get('FLOW_DB_URL'),
        ANTHROPIC_API_KEY: configService.get('ANTHROPIC_API_KEY'),
        OPENAI_API_KEY: configService.get('OPENAI_API_KEY'),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### Frontend (React Router Routes)

The package exports React Router route configurations that you can integrate into your React Router application:

```typescript
import { createBrowserRouter } from 'react-router';
import { FlowRoutes } from 'invect/backend/frontend';

const router = createBrowserRouter([
  {
    path: "/",
    element: <YourRootLayout />,
    children: [
      // Your other routes...
      FlowRoutes({
        apiBaseUrl: 'http://localhost:3000/invect', // Configure API endpoint
        queryClient: myQueryClient, // Optional: provide your own QueryClient
      }),
    ],
  },
]);
```

#### Alternative: Individual Route Configuration

```typescript
import { createFlowRoutes } from 'invect/backend/frontend';

const flowRoutes = createFlowRoutes({
  apiBaseUrl: 'http://localhost:3000/invect',
});

const router = createBrowserRouter([
  {
    path: "/",
    element: <YourRootLayout />,
    children: [
      ...flowRoutes,
      // Your other routes...
    ],
  },
]);
```

#### Using with Custom Layout

```typescript
import { FlowFrontendLayout } from 'invect/backend/frontend';

function App() {
  return (
    <FlowFrontendLayout config={{ apiBaseUrl: 'http://localhost:3000/invect' }}>
      <Outlet />
    </FlowFrontendLayout>
  );
}
```

### API Client

You can also use the API client directly:

```typescript
import { createApiClient } from 'invect/backend/frontend';

const apiClient = createApiClient('http://localhost:3000/invect');

// Use the API client
const flows = await apiClient.getFlows();
const execution = await apiClient.executeFlow(flowId, inputs);
```

## Features

### Backend Features

- **Flow Management**: Create, read, update, and delete workflow definitions
- **Version Control**: Track different versions of workflows
- **Execution Engine**: Execute workflows with topological sorting
- **Batch Processing**: Support for OpenAI and Anthropic batch APIs
- **Database Support**: Works with SQLite, PostgreSQL, and MySQL
- **Pause/Resume**: Control workflow execution

### Supported Node Types

- **Prompt Template Node**: Template text with variable substitution
- **Language Model Node**: Uses Anthropic Claude or OpenAI APIs
- **SQL Query Node**: Execute SQL queries against databases
- **If-Else Node**: Conditional branching for flow control

### Frontend Features

- **Flow Visualization**: Interactive workflow diagrams using React Flow
- **Flow Editor**: Visual workflow builder with drag-and-drop
- **Execution Monitoring**: Real-time execution status and logs
- **Version Management**: Switch between different flow versions
- **Query Testing**: Test SQL queries directly in the interface

## Configuration

### Environment Variables

The backend module accepts these configuration options:

- `FLOW_DB_URL` (required): Database connection string
- `ANTHROPIC_API_KEY` (optional): For Anthropic Claude models
- `OPENAI_API_KEY` (optional): For OpenAI models
- `PORT` (optional): Server port (default: 3001)

### Database Setup

The package uses Prisma for database management. Ensure your database is set up with the required schema. For SQLite (development):

```bash
# If using the package in development, you may need to run migrations
npx prisma migrate dev
```

## TypeScript Support

The package includes full TypeScript definitions. Import types as needed:

```typescript
import type { 
  FlowBackendConfig,
  FlowFrontendConfig,
  FlowNode,
  FlowEdge,
  ExecutionResult
} from 'invect/backend';
```

## Peer Dependencies

Make sure your project includes these peer dependencies:

```json
{
  "peerDependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0",
    "react-router": "^7.0.0",
    "@tanstack/react-query": "^5.0.0"
  }
}
```

## License

MIT
