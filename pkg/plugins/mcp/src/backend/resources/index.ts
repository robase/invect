/**
 * MCP Resources — expose flow data as readable resources.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InvectClient } from '../client/types';
import { resolveIdentity } from '../auth';

export function registerResources(server: McpServer, client: InvectClient): void {
  // Resource template: individual flow definition
  server.resource(
    'flow-definition',
    'invect://flows/{flowId}/definition',
    { description: 'The current definition of a specific flow (nodes, edges, params)' },
    async (uri, extra) => {
      const identity = resolveIdentity(extra.authInfo);
      // Extract flowId from URI: invect://flows/{flowId}/definition
      const match = uri.href.match(/^invect:\/\/flows\/([^/]+)\/definition$/);
      if (!match?.[1]) {
        return { contents: [{ uri: uri.href, text: 'Invalid flow URI', mimeType: 'text/plain' }] };
      }
      const flowId = decodeURIComponent(match[1]);
      const def = await client.getFlowDefinition(identity, flowId);
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(def, null, 2),
            mimeType: 'application/json',
          },
        ],
      };
    },
  );

  // Resource template: flow run result
  server.resource(
    'flow-run',
    'invect://runs/{flowRunId}',
    { description: 'The result details of a specific flow run' },
    async (uri, extra) => {
      const identity = resolveIdentity(extra.authInfo);
      const match = uri.href.match(/^invect:\/\/runs\/([^/]+)$/);
      if (!match?.[1]) {
        return { contents: [{ uri: uri.href, text: 'Invalid run URI', mimeType: 'text/plain' }] };
      }
      const flowRunId = decodeURIComponent(match[1]);
      const run = await client.getRun(identity, flowRunId);
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(run, null, 2),
            mimeType: 'application/json',
          },
        ],
      };
    },
  );
}
