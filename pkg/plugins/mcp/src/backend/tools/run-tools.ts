/**
 * Flow execution tools — start, monitor, and control flow runs.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InvectClient } from '../client/types';
import { mapAuthInfoToIdentity, requireAuth } from '../auth';
import { TOOL_IDS } from '../../shared/types';

export function registerRunTools(server: McpServer, client: InvectClient): void {
  server.tool(
    TOOL_IDS.RUN_START,
    'Execute a flow synchronously with optional input values. Returns the full run result when complete.',
    {
      flowId: z.string().describe('The flow ID to execute'),
      inputs: z
        .record(z.unknown())
        .optional()
        .describe('Optional key-value input data for the flow'),
    },
    async ({ flowId, inputs }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const result = await client.startRun(identity, flowId, inputs);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.RUN_TO_NODE,
    'Execute a flow up to a specific node (for debugging). Returns partial results stopping at the target node.',
    {
      flowId: z.string().describe('The flow ID'),
      nodeId: z.string().describe('Stop execution at this node ID'),
      inputs: z
        .record(z.unknown())
        .optional()
        .describe('Optional input data'),
    },
    async ({ flowId, nodeId, inputs }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const result = await client.runToNode(identity, flowId, nodeId, inputs);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.RUN_LIST,
    'List execution history for a flow, including status, timing, and errors',
    {
      flowId: z.string().describe('The flow ID'),
    },
    async ({ flowId }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const result = await client.listRuns(identity, flowId);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.RUN_GET,
    'Get detailed results of a specific flow run including status, output, timing, and any errors',
    {
      flowRunId: z.string().describe('The flow run ID'),
    },
    async ({ flowRunId }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const run = await client.getRun(identity, flowRunId);
      return {
        content: [{ type: 'text', text: JSON.stringify(run, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.RUN_CANCEL,
    'Cancel a running flow execution',
    {
      flowRunId: z.string().describe('The flow run ID to cancel'),
    },
    async ({ flowRunId }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const result = await client.cancelRun(identity, flowRunId);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.RUN_PAUSE,
    'Pause a running flow execution (can be resumed later)',
    {
      flowRunId: z.string().describe('The flow run ID to pause'),
    },
    async ({ flowRunId }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const result = await client.pauseRun(identity, flowRunId);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.RUN_RESUME,
    'Resume a previously paused flow execution',
    {
      flowRunId: z.string().describe('The flow run ID to resume'),
    },
    async ({ flowRunId }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const result = await client.resumeRun(identity, flowRunId);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
