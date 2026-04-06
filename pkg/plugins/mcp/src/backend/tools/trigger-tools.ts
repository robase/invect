/**
 * Trigger management tools — CRUD for flow triggers (cron, webhook, manual).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InvectClient } from '../client/types';
import { resolveIdentity } from '../auth';
import { TOOL_IDS } from '../../shared/types';
import { mapTriggerList, mapTrigger } from '../response-mappers';

export function registerTriggerTools(server: McpServer, client: InvectClient): void {
  server.tool(
    TOOL_IDS.TRIGGER_LIST,
    'List all triggers configured for a flow (cron schedules, webhooks, manual)',
    {
      flowId: z.string().describe('The flow ID'),
    },
    async ({ flowId }, extra) => {
      const identity = resolveIdentity(extra.authInfo);
      const triggers = await client.listTriggers(identity, flowId);
      return {
        content: [{ type: 'text', text: mapTriggerList(triggers) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.TRIGGER_GET,
    'Get details of a specific trigger',
    {
      triggerId: z.string().describe('The trigger ID'),
    },
    async ({ triggerId }, extra) => {
      const identity = resolveIdentity(extra.authInfo);
      const trigger = await client.getTrigger(identity, triggerId);
      return {
        content: [{ type: 'text', text: mapTrigger(trigger) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.TRIGGER_CREATE,
    'Create a new trigger for a flow (e.g., cron schedule, webhook)',
    {
      input: z.any().describe('Trigger creation input including flowId, type, and configuration'),
    },
    async ({ input }, extra) => {
      const identity = resolveIdentity(extra.authInfo);
      const trigger = await client.createTrigger(identity, input);
      return {
        content: [{ type: 'text', text: mapTrigger(trigger) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.TRIGGER_UPDATE,
    "Update an existing trigger's configuration",
    {
      triggerId: z.string().describe('The trigger ID to update'),
      input: z.any().describe('Updated trigger configuration'),
    },
    async ({ triggerId, input }, extra) => {
      const identity = resolveIdentity(extra.authInfo);
      const trigger = await client.updateTrigger(identity, triggerId, input);
      return {
        content: [{ type: 'text', text: mapTrigger(trigger) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.TRIGGER_DELETE,
    'Delete a trigger',
    {
      triggerId: z.string().describe('The trigger ID to delete'),
    },
    async ({ triggerId }, extra) => {
      const identity = resolveIdentity(extra.authInfo);
      await client.deleteTrigger(identity, triggerId);
      return {
        content: [{ type: 'text', text: `Trigger ${triggerId} deleted.` }],
      };
    },
  );
}
