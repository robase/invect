/**
 * Flow management tools — CRUD operations on flows.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InvectClient } from '../client/types';
import { mapAuthInfoToIdentity, requireAuth } from '../auth';
import { TOOL_IDS } from '../../shared/types';

export function registerFlowTools(server: McpServer, client: InvectClient): void {
  server.tool(
    TOOL_IDS.FLOW_LIST,
    'List all flows with their names, IDs, status, and metadata',
    {},
    async (_params, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const result = await client.listFlows(identity);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.FLOW_GET,
    'Get detailed metadata for a specific flow by ID',
    { flowId: z.string().describe('The flow ID') },
    async ({ flowId }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const flow = await client.getFlow(identity, flowId);
      return {
        content: [{ type: 'text', text: JSON.stringify(flow, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.FLOW_GET_DEFINITION,
    'Get the current flow definition including all nodes, edges, and configuration parameters',
    { flowId: z.string().describe('The flow ID') },
    async ({ flowId }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const def = await client.getFlowDefinition(identity, flowId);
      return {
        content: [{ type: 'text', text: JSON.stringify(def, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.FLOW_CREATE,
    'Create a new empty flow with a name and optional description',
    {
      name: z.string().describe('Flow name'),
      description: z.string().optional().describe('Flow description'),
    },
    async ({ name, description }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const flow = await client.createFlow(identity, { name, description });
      return {
        content: [{ type: 'text', text: JSON.stringify(flow, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.FLOW_UPDATE,
    'Update a flow\'s name or description',
    {
      flowId: z.string().describe('The flow ID'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
    },
    async ({ flowId, name, description }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const flow = await client.updateFlow(identity, flowId, { name, description });
      return {
        content: [{ type: 'text', text: JSON.stringify(flow, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.FLOW_DELETE,
    'Permanently delete a flow and all its versions and run history',
    { flowId: z.string().describe('The flow ID to delete') },
    async ({ flowId }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      await client.deleteFlow(identity, flowId);
      return {
        content: [{ type: 'text', text: `Flow ${flowId} deleted successfully.` }],
      };
    },
  );

  server.tool(
    TOOL_IDS.FLOW_VALIDATE,
    'Validate a flow definition against the schema without saving it',
    {
      flowId: z.string().describe('The flow ID'),
      definition: z.any().describe('The flow definition to validate'),
    },
    async ({ flowId, definition }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const result = await client.validateFlow(identity, flowId, definition);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
