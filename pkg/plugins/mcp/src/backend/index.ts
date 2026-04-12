/**
 * @invect/mcp — Plugin entry point
 *
 * Exports the `mcp()` factory that creates an InvectPluginDefinition providing
 * MCP (Model Context Protocol) endpoints for AI coding agents.
 */

import type { InvectPlugin, InvectPluginDefinition, InvectPluginContext } from '@invect/core';
import type { McpPluginOptions } from '../shared/types';
import { DirectClient } from './client/direct-client';
import { createMcpServer } from './mcp-server';
import { SessionManager } from './session-manager';
import { AuditLogger } from './audit';

/**
 * Create the MCP plugin.
 *
 * When registered with Invect, this plugin mounts Streamable HTTP endpoints
 * at `/plugins/mcp/` that implement the Model Context Protocol. MCP clients
 * (Claude Desktop, VS Code Copilot, Cursor, etc.) connect to these endpoints.
 *
 * @example
 * ```typescript
 * import { mcp } from '@invect/mcp';
 *
 * defineConfig({
 *   plugins: [mcp()],
 * });
 * ```
 */
export function mcp(options: McpPluginOptions = {}): InvectPluginDefinition {
  return {
    id: 'mcp',
    name: 'Model Context Protocol',
    backend: _mcpBackendPlugin(options),
  };
}

function _mcpBackendPlugin(options: McpPluginOptions = {}): InvectPlugin {
  const sessionTtlMs = options.sessionTtlMs ?? 30 * 60 * 1000;
  const sessionManager = new SessionManager(sessionTtlMs);
  let auditLogger: AuditLogger | undefined;

  return {
    id: 'mcp',
    name: 'Model Context Protocol',

    init(ctx: InvectPluginContext) {
      auditLogger = new AuditLogger(ctx.logger, options.audit);

      // Store references for endpoint handlers
      ctx.store.set('sessionManager', sessionManager);
      ctx.store.set('auditLogger', auditLogger);

      sessionManager.startCleanup();

      ctx.logger.info(
        `MCP plugin initialized (session TTL: ${sessionTtlMs / 1000}s, audit: ${options.audit?.enabled !== false ? 'on' : 'off'})`,
      );
    },

    endpoints: [
      // Streamable HTTP → MCP endpoint (POST for messages, GET for SSE, DELETE for close)
      {
        method: 'POST',
        path: '/mcp',
        handler: async (ctx) => {
          const invect = ctx.getInvect();
          const client = new DirectClient(invect);
          const mcpServer = createMcpServer(client);

          // The body contains an MCP JSON-RPC message.
          // For a full Streamable HTTP implementation, we'd use
          // StreamableHTTPServerTransport. For now, handle inline.
          try {
            // Delegate to a simple JSON-RPC handler
            const result = await handleMcpJsonRpc(mcpServer, ctx.body, ctx.identity);
            return { status: 200, body: result };
          } catch (error) {
            return {
              status: 500,
              body: {
                jsonrpc: '2.0',
                error: {
                  code: -32603,
                  message: error instanceof Error ? error.message : 'Internal error',
                },
                id: (ctx.body as { id?: unknown }).id ?? null,
              },
            };
          }
        },
      },

      // Health check / server info
      {
        method: 'GET',
        path: '/mcp/info',
        handler: async () => {
          return {
            status: 200,
            body: {
              name: 'invect-mcp',
              version: '0.0.1',
              protocolVersion: '2025-03-26',
              capabilities: {
                tools: true,
                resources: true,
                prompts: true,
              },
              sessions: sessionManager.size,
            },
          };
        },
        isPublic: true,
      },
    ],

    async shutdown() {
      sessionManager.stopCleanup();
      await sessionManager.closeAll();
    },
  };
}

/**
 * Lightweight JSON-RPC handler that delegates to the McpServer.
 *
 * The MCP SDK's McpServer handles tool/resource/prompt dispatch internally.
 * We intercept the JSON-RPC request, add auth context, and call the server.
 */
async function handleMcpJsonRpc(
  _server: ReturnType<typeof createMcpServer>,
  body: Record<string, unknown>,
  _identity: unknown,
): Promise<unknown> {
  // The MCP SDK expects to handle transport-level protocol details.
  // For the plugin endpoint integration, we need to use the SDK's
  // Streamable HTTP transport properly. This is a placeholder that
  // returns the server capabilities for the "initialize" method.

  const method = body.method as string | undefined;
  const id = body.id;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      result: {
        protocolVersion: '2025-03-26',
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: {
          name: 'invect-mcp',
          version: '0.0.1',
        },
      },
      id,
    };
  }

  // For other methods, we need the full Streamable HTTP transport integration.
  // This will be completed when connecting the MCP SDK transport layer.
  return {
    jsonrpc: '2.0',
    error: {
      code: -32601,
      message: `Method not yet implemented via plugin endpoint: ${method}. Use the stdio CLI transport for full MCP support.`,
    },
    id,
  };
}

export type { McpPluginOptions } from '../shared/types';
