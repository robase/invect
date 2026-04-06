/**
 * Node reference tools — list available providers and node types.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InvectClient } from '../client/types';
import { resolveIdentity } from '../auth';
import { TOOL_IDS } from '../../shared/types';

export function registerNodeTools(server: McpServer, client: InvectClient): void {
  server.tool(
    TOOL_IDS.NODE_LIST_PROVIDERS,
    'List all available node providers (core, http, gmail, slack, github, etc.) with their metadata',
    {},
    async (_params, extra) => {
      const identity = resolveIdentity(extra.authInfo);
      const providers = await client.listProviders(identity);
      return {
        content: [{ type: 'text', text: JSON.stringify(providers, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.NODE_LIST_AVAILABLE,
    'List all available node types with their IDs, names, parameter schemas, and field definitions. Use this to understand what nodes can be added to flows.',
    {},
    async (_params, extra) => {
      const identity = resolveIdentity(extra.authInfo);
      const nodes = await client.listAvailableNodes(identity);
      return {
        content: [{ type: 'text', text: JSON.stringify(nodes, null, 2) }],
      };
    },
  );
}
