/**
 * MCP Server factory — creates and configures the McpServer with all tools,
 * resources, and prompts.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InvectClient } from './client/types';
import { registerFlowTools } from './tools/flow-tools';
import { registerVersionTools } from './tools/version-tools';
import { registerRunTools } from './tools/run-tools';
import { registerDebugTools } from './tools/debug-tools';
import { registerCredentialTools } from './tools/credential-tools';
import { registerTriggerTools } from './tools/trigger-tools';
import { registerNodeTools } from './tools/node-tools';
import { registerResources } from './resources/index';
import { registerPrompts } from './prompts/index';

export function createMcpServer(client: InvectClient): McpServer {
  const server = new McpServer(
    {
      name: 'invect-mcp',
      version: '0.0.1',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  // Register all tools
  registerFlowTools(server, client);
  registerVersionTools(server, client);
  registerRunTools(server, client);
  registerDebugTools(server, client);
  registerCredentialTools(server, client);
  registerTriggerTools(server, client);
  registerNodeTools(server, client);

  // Register resources and prompts
  registerResources(server, client);
  registerPrompts(server, client);

  return server;
}
