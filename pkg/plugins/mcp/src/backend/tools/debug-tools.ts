/**
 * Debugging & testing tools — node execution traces, expression testing, stats.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InvectClient } from '../client/types';
import { resolveIdentity } from '../auth';
import { TOOL_IDS } from '../../shared/types';
import { mapNodeExecutions, mapTestResult } from '../response-mappers';

export function registerDebugTools(server: McpServer, client: InvectClient): void {
  server.tool(
    TOOL_IDS.DEBUG_NODE_EXECUTIONS,
    "Get per-node execution traces for a flow run, including each node's input, output, timing, and errors. Essential for debugging failed runs.",
    {
      flowRunId: z.string().describe('The flow run ID'),
    },
    async ({ flowRunId }, extra) => {
      const identity = resolveIdentity(extra.authInfo);
      const executions = await client.getNodeExecutions(identity, flowRunId);
      return {
        content: [{ type: 'text', text: mapNodeExecutions(executions) }],
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
      const identity = resolveIdentity(extra.authInfo);
      const result = await client.testNode(identity, nodeType, params, inputData);
      return {
        content: [{ type: 'text', text: mapTestResult(result) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.DEBUG_TEST_EXPRESSION,
    'Test a JavaScript template expression ({{ ... }}) against a sample data context. Uses the secure-exec V8 sandbox.',
    {
      expression: z
        .string()
        .describe(
          'JS template expression to test (e.g., "{{ users.filter(u => u.active).length }}")',
        ),
      context: z
        .record(z.unknown())
        .describe('Sample data context to evaluate the expression against'),
    },
    async ({ expression, context }, extra) => {
      const identity = resolveIdentity(extra.authInfo);
      const result = await client.testJsExpression(identity, expression, context);
      return {
        content: [{ type: 'text', text: mapTestResult(result) }],
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
      const identity = resolveIdentity(extra.authInfo);
      const result = await client.testMapper(identity, expression, incomingData);
      return {
        content: [{ type: 'text', text: mapTestResult(result) }],
      };
    },
  );
}
