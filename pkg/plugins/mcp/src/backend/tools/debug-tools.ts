/**
 * Debugging & testing tools — node execution traces, expression testing, stats.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InvectClient } from '../client/types';
import { mapAuthInfoToIdentity, requireAuth } from '../auth';
import { TOOL_IDS } from '../../shared/types';

export function registerDebugTools(server: McpServer, client: InvectClient): void {
  server.tool(
    TOOL_IDS.DEBUG_NODE_EXECUTIONS,
    'Get per-node execution traces for a flow run, including each node\'s input, output, timing, and errors. Essential for debugging failed runs.',
    {
      flowRunId: z.string().describe('The flow run ID'),
    },
    async ({ flowRunId }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const executions = await client.getNodeExecutions(identity, flowRunId);
      return {
        content: [{ type: 'text', text: JSON.stringify(executions, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.DEBUG_TEST_NODE,
    'Execute a single node type in isolation with given parameters and input data. Useful for testing node configuration before adding to a flow.',
    {
      nodeType: z.string().describe('Action ID of the node type (e.g., "core.jq", "http.request")'),
      params: z.record(z.unknown()).describe('Node configuration parameters'),
      inputData: z
        .record(z.unknown())
        .optional()
        .describe('Simulated incoming data from upstream nodes'),
    },
    async ({ nodeType, params, inputData }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const result = await client.testNode(identity, nodeType, params, inputData);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.DEBUG_TEST_EXPRESSION,
    'Test a JavaScript template expression ({{ ... }}) against a sample data context. Uses the QuickJS WASM sandbox.',
    {
      expression: z.string().describe('JS template expression to test (e.g., "{{ users.filter(u => u.active).length }}")'),
      context: z.record(z.unknown()).describe('Sample data context to evaluate the expression against'),
    },
    async ({ expression, context }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const result = await client.testJsExpression(identity, expression, context);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.DEBUG_TEST_MAPPER,
    'Test a data mapper/transformation expression against sample incoming data',
    {
      expression: z.string().describe('Mapper expression to evaluate'),
      incomingData: z.record(z.unknown()).describe('Sample incoming data to map'),
    },
    async ({ expression, incomingData }, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const result = await client.testMapper(identity, expression, incomingData);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.DEBUG_DASHBOARD_STATS,
    'Get platform-wide statistics: total flows, runs, success/failure rates, and recent activity',
    {},
    async (_params, extra) => {
      const identity = requireAuth(mapAuthInfoToIdentity(extra.authInfo));
      const stats = await client.getDashboardStats(identity);
      return {
        content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
      };
    },
  );
}
