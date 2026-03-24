# @invect/frontend

A complete React component package for Invect workflow management. This package provides pre-built React components and routes that can be easily integrated into any React Router application.

## Features

- 🚀 **Ready-to-use Components**: Complete UI for flow viewing, editing, and execution
- 🛣️ **Simple Integration**: One-line integration with React Router
- 🎨 **Modern UI**: Built with Tailwind CSS and Radix UI components  
- 🔧 **TypeScript**: Full TypeScript support
- 📱 **Responsive**: Mobile-friendly interface
- ⚡ **React Query**: Built-in data fetching and caching

## Installation

```bash
npm install @invect/frontend
```

### Import Styles

Import the Invect styles in your app's entry point (e.g., `main.tsx`, `index.tsx`, or `App.tsx`):

```typescript
import '@invect/frontend/styles';
```

This includes all the necessary CSS for:
- Tailwind CSS utilities with Invect theme
- React Flow styles
- Glass effect utilities
- Component-specific styles

## Quick Start

### Basic Integration (Single Route)

The simplest way to add Invect to your app:

```typescript
import { createBrowserRouter } from 'react-router-dom';
import { createInvectParentRoute } from '@invect/frontend';

const router = createBrowserRouter([
  // Your existing routes
  {
    path: '/about',
    element: <AboutPage />
  },
  
  // Add Invect under /workflows
  createInvectParentRoute({
    path: '/workflows',
    apiBaseUrl: 'http://localhost:3000/invect'
  }),
]);
```

This gives you:
- `/workflows` - Flow list and management
- `/workflows/executions` - Execution monitoring  
- `/workflows/flow/:id` - Flow viewer
- `/workflows/flow/:id/edit` - Flow editor

### Individual Routes

For more control over routing:

```typescript
import { createBrowserRouter } from 'react-router-dom';
import { createInvectRoutes } from '@invect/frontend';

const invectRoutes = createInvectRoutes({
  basePath: '/flows',
  apiBaseUrl: 'http://localhost:3000/invect'
});

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      ...invectRoutes,
      // Your other routes
      { path: 'about', element: <AboutPage /> }
    ]
  }
]);
```

### With Custom Query Client

If you already use React Query in your app:

```typescript
import { QueryClient } from '@tanstack/react-query';
import { createInvectParentRoute } from '@invect/frontend';

const queryClient = new QueryClient(/* your config */);

const router = createBrowserRouter([
  createInvectParentRoute({
    path: '/workflows',
    apiBaseUrl: 'http://localhost:3000/invect',
    queryClient // Use your existing client
  })
]);
```

## Configuration

### InvectRouteConfig

```typescript
interface InvectRouteConfig {
  apiBaseUrl?: string;    // Backend API URL (default: http://localhost:3000/invect)
  queryClient?: QueryClient; // Custom React Query client (optional)
  basePath?: string;      // Base path for routes (used with createInvectRoutes)
}
```

## Advanced Usage

### Using the Provider Component

For maximum flexibility, you can use the provider component directly:

```typescript
import { InvectProvider, Home, Executions } from '@invect/frontend';

function App() {
  return (
    <Router>
      <Routes>
        <Route 
          path="/workflows/*" 
          element={
            <InvectProvider apiBaseUrl="http://localhost:3000/invect">
              <Routes>
                <Route index element={<Home />} />
                <Route path="executions" element={<Executions />} />
              </Routes>
            </InvectProvider>
          } 
        />
      </Routes>
    </Router>
  );
}
```

### Custom Components

You can import and use individual components:

```typescript
import { Home, Flow, FlowEdit, Executions, InvectProvider } from '@invect/frontend';

// Use components directly in your routing setup
```

## Environment Variables

Set these environment variables for full functionality:

```bash
# Backend API URL (default: http://localhost:3000/invect)
REACT_APP_API_URL=http://localhost:3000/invect

# Required for AI model nodes
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
```

## Styling

### CSS Isolation & No Conflicts

Invect styles are **completely isolated** from your app to prevent CSS conflicts:

- **Scoped preflight styles** - Tailwind's reset/base styles only apply to Invect components
- **Scoped utilities** - All Tailwind utility classes are prefixed with `.invect`
- **Isolated CSS variables** - Theme tokens (`--background`, `--foreground`, etc.) don't leak
- **Works with any CSS framework** - Safe to use alongside your own Tailwind, shadcn/ui, Bootstrap, etc.

**No configuration needed** - Just import the styles and you're ready to go!

### Required Setup

**1. Import Invect Styles**

Import the complete stylesheet **once** in your app's entry point:

```typescript
// main.tsx or index.tsx
import '@invect/frontend/styles';
```

**2. Automatic Scoping**

The `.invect` CSS class is automatically added by the `Invect` component and route providers. If you're using individual components outside of the providers, wrap them:

```tsx
<div className="invect">
  <YourInvectComponents />
</div>
```

### How Isolation Works

Invect uses several techniques to ensure style isolation:

1. **tailwindcss-scoped-preflight** - All Tailwind base/reset styles are scoped to `.invect`
2. **important: '.invect'** - All Tailwind utilities only work within `.invect` containers
3. **Custom CSS variables** - All theme tokens are defined under `.invect` and `.invect.dark`

This means:
- ✅ Your app's buttons, inputs, and typography remain unchanged
- ✅ Your existing shadcn/ui components won't be affected
- ✅ Your Tailwind utilities work independently
- ✅ No CSS reset/normalization conflicts

### Example: Using Invect with Your Own shadcn/ui

```tsx
import '@invect/frontend/styles';
import './app.css'; // Your own shadcn styles

function App() {
  return (
    <>
      {/* Your app's shadcn components - use your theme */}
      <Button>My App Button</Button>
      
      {/* Invect - uses isolated theme */}
      <Invect apiBaseUrl="http://localhost:3000" />
    </>
  );
}
```

Both will coexist without conflicts!

### Tailwind CSS Configuration (Optional)

If you're using Tailwind CSS in your own app and want to extend or customize the Invect styles:

```javascript
// tailwind.config.js
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@invect/frontend/dist/**/*.{js,ts,jsx,tsx}' // Include Invect components
  ],
  // ... rest of your config
}
```

**Note:** This is optional. Invect includes all necessary Tailwind utilities in its bundled CSS.

## Available Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` (or basePath) | Home | Flow list and management |
| `/executions` | Executions | Execution monitoring |
| `/flow/:flowId` | Flow | Flow visualization and execution |
| `/flow/:flowId/edit` | FlowEdit | Flow editor |

## API Reference

### State Management

The frontend uses a combination of **React Query** and **Zustand** for state management:

#### Architecture
- **React Query** - Server state (API data, caching, mutations)
- **Zustand** - Client state (UI state, local edits, selections)

#### Stores

```typescript
import { 
  useFlowEditorStore,  // Flow editing state (nodes, edges, dirty tracking)
  useUIStore,          // Global UI state (modals, panels, sidebar)
  useExecutionViewStore // Execution viewer state (filters, pagination)
} from '@invect/frontend';

// Flow editor store selectors
const nodes = useFlowEditorStore((s) => s.nodes);
const isDirty = useFlowEditorStore((s) => s.isDirty);
const addNode = useFlowEditorStore((s) => s.addNode);

// UI store
const openModal = useUIStore((s) => s.openModal);
const closeModal = useUIStore((s) => s.closeModal);
```

#### Hooks

```typescript
import { 
  useFlowEditor,      // Main hook - wires React Query + Zustand
  useNodeOperations,  // Node CRUD operations
  useFlowSelection    // Selection state
} from '@invect/frontend';

// In your component
const { nodes, edges, save, isDirty, isLoading } = useFlowEditor({ 
  flowId: 'flow-123',
  version: 'latest' 
});
```

### `createInvectRoutes(config?)`

Creates individual route configurations that can be spread into your router.

**Returns:** `RouteObject[]`

### `createInvectParentRoute(config)`

Creates a single parent route containing all Invect functionality.

**Parameters:**
- `config.path: string` - Required. The parent route path
- `config.apiBaseUrl?: string` - API base URL
- `config.queryClient?: QueryClient` - Custom query client

**Returns:** `RouteObject`

### `InvectProvider`

Provider component that wraps routes with React Query context.

### `InvectRoutes`

Simple wrapper component for advanced routing scenarios.

## Migration from Previous Versions

If you were using the old route factory approach:

### Before
```typescript
import { createLangflowRoutes } from '@invect/frontend';
// Complex manual conversion required
```

### After  
```typescript
import { createInvectParentRoute } from '@invect/frontend';

const router = createBrowserRouter([
  createInvectParentRoute({ path: '/workflows' })
]);
```

## TypeScript Support

The package includes comprehensive TypeScript definitions. All components and configuration options are fully typed.

## License

MIT
