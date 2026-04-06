/**
 * Flow version management tools.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InvectClient } from '../client/types';
import { mapAuthInfoToIdentity, requireAuth } from '../auth';
import { TOOL_IDS } from '../../shared/types';

export function registerVersionTools(server: McpServer, client: InvectClient): void {
  server.tool(
    TOOL_IDS.VERSION_LIST,
    'List all versions of a flow with version numbers and timestamps',
    { flowId: z.string().describe('The flow ID') },
    async ({ flowId }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const result = await client.listVersions(identity, flowId);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.VERSION_GET,
    'Get a specific version\'s full definition by version number or "latest"',
    {
      flowId: z.string().describe('The flow ID'),
      version: z.string().describe('Version number or "latest"'),
    },
    async ({ flowId, version }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const v = await client.getVersion(identity, flowId, version);
      return {
        content: [{ type: 'text', text: JSON.stringify(v, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.VERSION_PUBLISH,
    'Publish a new version of a flow with a complete definition (nodes, edges, configuration)',
    {
      flowId: z.string().describe('The flow ID'),
      definition: z.any().describe('The complete flow definition to publish'),
    },
    async ({ flowId, definition }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const v = await client.publishVersion(identity, flowId, definition);
      return {
        content: [{ type: 'text', text: JSON.stringify(v, null, 2) }],
      };
    },
  );
}
