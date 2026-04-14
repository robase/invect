<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../../.github/assets/logo-light.svg">
    <img alt="Invect" src="../../../.github/assets/logo-dark.svg" width="50">
  </picture>
</p>

<h1 align="center">@invect/mcp</h1>

<p align="center">
  Model Context Protocol server for Invect.
  <br />
  <a href="https://invect.dev/docs/plugins"><strong>Docs</strong></a>
</p>

---

Exposes Invect flow building, editing, execution, and debugging as MCP tools. Works with Claude Desktop, VS Code Copilot, Cursor, and any MCP-compatible client.

## Install

```bash
pnpm add @invect/mcp
```

## Backend Plugin

Add the MCP plugin to enable the Streamable HTTP transport endpoint:

```ts
import { mcpPlugin } from '@invect/mcp';

const invectRouter = await createInvectRouter({
  database: { type: 'sqlite', connectionString: 'file:./dev.db' },
  encryptionKey: process.env.INVECT_ENCRYPTION_KEY,
  plugins: [mcpPlugin()],
});

app.use('/invect', invectRouter);
```

### Options

```ts
mcpPlugin({
  sessionTtlMs: 30 * 60 * 1000, // Session TTL (default: 30 minutes)
  audit: {
    enabled: true, // Enable audit logging (default: true)
    persist: false, // Persist audit logs to database (default: false)
    logLevel: 'info', // Log level (default: 'info')
  },
});
```

## Standalone CLI

For AI coding agents that use stdio transport (Claude Desktop, VS Code Copilot), run the MCP server as a standalone process:

```bash
npx invect-mcp --url http://localhost:3000/invect --api-key YOUR_KEY
```

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "invect": {
      "command": "npx",
      "args": ["invect-mcp", "--url", "http://localhost:3000/invect"]
    }
  }
}
```

## MCP Tools

| Category        | Tools                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------ |
| **Flows**       | `flow_list`, `flow_get`, `flow_create`, `flow_update`, `flow_delete`, `flow_validate`      |
| **Versions**    | `version_list`, `version_get`, `version_publish`                                           |
| **Runs**        | `run_start`, `run_to_node`, `run_list`, `run_get`, `run_cancel`, `run_pause`, `run_resume` |
| **Debug**       | `debug_node_executions`, `debug_test_node`, `debug_test_expression`, `debug_test_mapper`   |
| **Credentials** | Credential CRUD and secrets management                                                     |
| **Triggers**    | Trigger CRUD operations                                                                    |
| **Nodes**       | Query available node types and providers                                                   |

## Exports

| Entry Point         | Content                     |
| ------------------- | --------------------------- |
| `@invect/mcp`       | Backend plugin (Node.js)    |
| `@invect/mcp/types` | Shared types                |
| `invect-mcp` (bin)  | Standalone stdio MCP server |

## License

[MIT](../../../LICENSE)
