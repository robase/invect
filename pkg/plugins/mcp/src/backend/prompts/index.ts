/**
 * MCP Prompts — reusable prompt templates for common Invect tasks.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InvectClient } from '../client/types';

export function registerPrompts(server: McpServer, _client: InvectClient): void {
  server.prompt(
    'debug-flow-run',
    'Analyze a failed or problematic flow run to identify the root cause',
    { flowRunId: z.string().describe('The flow run ID to debug') },
    async ({ flowRunId }) => {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                `Debug the flow run "${flowRunId}". Follow these steps:`,
                '',
                '1. Use run_get to fetch the run details (status, error, timing).',
                '2. Use debug_node_executions to get per-node traces.',
                '3. Identify which node(s) failed or produced unexpected output.',
                "4. If a node has an expression error, use debug_test_expression with the failed expression and the node's input data.",
                '5. Summarize: root cause, which node failed, and suggest a fix.',
              ].join('\n'),
            },
          },
        ],
      };
    },
  );

  server.prompt(
    'create-flow',
    'Step-by-step guide to create a new flow with nodes and connections',
    {
      name: z.string().describe('Name for the new flow'),
      description: z.string().optional().describe('What the flow should do'),
    },
    async ({ name, description }) => {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                `Create a new Invect flow called "${name}"${description ? `: ${description}` : ''}.`,
                '',
                'Follow these steps:',
                '1. Use node_list_available to see all available node types.',
                '2. Use flow_create to create the flow.',
                '3. Plan the node graph: decide which nodes are needed, their parameters, and how they connect.',
                '4. Use version_publish to publish the flow definition with nodes and edges.',
                '5. Use flow_validate to verify the definition is correct.',
                '6. Optionally use run_start to test the flow.',
              ].join('\n'),
            },
          },
        ],
      };
    },
  );

  server.prompt(
    'explain-flow',
    'Get a detailed explanation of what a flow does, its nodes, and data flow',
    { flowId: z.string().describe('The flow ID to explain') },
    async ({ flowId }) => {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                `Explain the flow "${flowId}" in detail.`,
                '',
                '1. Use flow_get to get the flow metadata.',
                '2. Use flow_get_definition to get the full definition.',
                '3. Analyze the nodes, their types, parameters, and connections (edges).',
                '4. Describe the data flow from inputs through each node to outputs.',
                '5. Flag any potential issues or improvements.',
              ].join('\n'),
            },
          },
        ],
      };
    },
  );
}
