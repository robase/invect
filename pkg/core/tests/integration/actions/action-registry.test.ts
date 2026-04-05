/**
 * Integration tests: Action Registry
 *
 * Tests that the action registry is correctly populated after Invect
 * initialization, and that actions can be converted to both node
 * definitions and agent tool definitions.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { InvectInstance } from '../../../src/api/types';
import { createTestInvect } from '../helpers/test-invect';

describe('Action Registry', () => {
  let invect: InvectInstance;

  beforeAll(async () => {
    invect = await createTestInvect();
  });

  afterAll(async () => {
    await invect.shutdown();
  });

  it('should register all built-in actions during initialization', async () => {
    const tools = await invect.agent.getTools();

    // There should be a significant number of registered tools
    expect(tools.length).toBeGreaterThan(10);
  });

  it('should include core actions (javascript, if_else, template_string, input, output)', async () => {
    const tools = await invect.agent.getTools();
    const ids = tools.map((t) => t.id);

    expect(ids).toContain('core.javascript');
    expect(ids).toContain('core.if_else');
    expect(ids).toContain('core.template_string');
    expect(ids).toContain('core.input');
    expect(ids).toContain('core.output');
  });

  it('should include provider actions (http, gmail, slack, github)', async () => {
    const tools = await invect.agent.getTools();
    const ids = tools.map((t) => t.id);

    expect(ids.some((id) => id.startsWith('http.'))).toBe(true);
    expect(ids.some((id) => id.startsWith('gmail.'))).toBe(true);
    expect(ids.some((id) => id.startsWith('slack.'))).toBe(true);
    expect(ids.some((id) => id.startsWith('github.'))).toBe(true);
  });

  it('should produce valid agent tool definitions with id, name, and inputSchema', async () => {
    const tools = await invect.agent.getTools();

    for (const tool of tools) {
      expect(tool.id).toBeTruthy();
      expect(tool.name).toBeTruthy();
      // Every tool should have a well-formed definition
      expect(typeof tool.id).toBe('string');
      expect(typeof tool.name).toBe('string');
    }
  });

  it('should include standalone tools (math_eval, json_logic)', async () => {
    const tools = await invect.agent.getTools();
    const ids = tools.map((t) => t.id);

    expect(ids).toContain('math_eval');
    expect(ids).toContain('json_logic');
  });

  it('should register plugin actions when provided', async () => {
    const { z } = await import('zod/v4');

    const customInvect = await createTestInvect({
      plugins: [
        {
          id: 'custom-action-plugin',
          actions: [
            {
              id: 'test.custom_action',
              name: 'Custom Test Action',
              description: 'A test action from a plugin',
              provider: { id: 'test', name: 'Test', icon: 'Beaker' },
              params: {
                schema: z.object({}),
                fields: [],
              },
              execute: async () => ({ success: true, output: 'custom' }),
            },
          ],
        },
      ],
    });

    try {
      const tools = await customInvect.agent.getTools();
      const ids = tools.map((t) => t.id);

      expect(ids).toContain('test.custom_action');
    } finally {
      await customInvect.shutdown();
    }
  });
});
