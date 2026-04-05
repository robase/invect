/**
 * Integration tests: Branching Flows
 *
 * Tests if/else branching, node skipping, and data passthrough
 * in branching scenarios through the real Invect core.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlowRunStatus } from '../../../src';
import type { InvectInstance } from '../../../src/api/types';
import type { InvectDefinition } from '../../../src/services/flow-versions/schemas-fresh';
import type { NodeOutput } from '../../../src/types/node-io-types';
import { createTestInvect } from '../helpers/test-invect';

describe('Branching Flows', () => {
  let invect: InvectInstance;

  beforeAll(async () => {
    invect = await createTestInvect();
  });

  afterAll(async () => {
    await invect.shutdown();
  });

  function getNodeOutput(result: { outputs?: Record<string, unknown> }, nodeId: string) {
    const node = result.outputs?.[nodeId] as NodeOutput | undefined;
    if (!node) return undefined;
    const vars = node.data.variables as Record<string, { value?: unknown }>;
    const raw = vars.output?.value;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  }

  async function runFlow(name: string, definition: InvectDefinition) {
    const flow = await invect.flows.create({ name: `branch-${name}-${Date.now()}` });
    await invect.versions.create(flow.id, { invectDefinition: definition });
    return invect.runs.start(flow.id, {}, { useBatchProcessing: false });
  }

  /** Builds an if/else flow with configurable input data */
  function buildBranchFlow(value: number): InvectDefinition {
    return {
      nodes: [
        {
          id: 'input-1',
          type: 'core.input',
          label: 'Input',
          referenceId: 'data',
          params: {
            variableName: 'data',
            defaultValue: JSON.stringify({ value }),
          },
          position: { x: 0, y: 0 },
        },
        {
          id: 'if-1',
          type: 'core.if_else',
          label: 'Check Value',
          referenceId: 'check',
          params: {
            condition: { '>': [{ var: 'data.value' }, 50] },
          },
          position: { x: 200, y: 0 },
        },
        {
          id: 'tmpl-high',
          type: 'core.template_string',
          label: 'High',
          referenceId: 'high',
          params: { template: 'HIGH' },
          position: { x: 400, y: -100 },
        },
        {
          id: 'tmpl-low',
          type: 'core.template_string',
          label: 'Low',
          referenceId: 'low',
          params: { template: 'LOW' },
          position: { x: 400, y: 100 },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-1', target: 'if-1' },
        { id: 'e-true', source: 'if-1', target: 'tmpl-high', sourceHandle: 'true_output' },
        { id: 'e-false', source: 'if-1', target: 'tmpl-low', sourceHandle: 'false_output' },
      ],
    };
  }

  it('should correctly route to the true branch when condition is met', async () => {
    const result = await runFlow('true-branch', buildBranchFlow(100));

    expect(result.status).toBe(FlowRunStatus.SUCCESS);
    expect(getNodeOutput(result, 'tmpl-high')).toBe('HIGH');
  });

  it('should correctly route to the false branch when condition is not met', async () => {
    const result = await runFlow('false-branch', buildBranchFlow(10));

    expect(result.status).toBe(FlowRunStatus.SUCCESS);
    expect(getNodeOutput(result, 'tmpl-low')).toBe('LOW');
  });

  it('should skip nodes on the inactive branch', async () => {
    const result = await runFlow('skip-check', buildBranchFlow(100));

    expect(result.status).toBe(FlowRunStatus.SUCCESS);

    // The active branch node should have an output
    expect(getNodeOutput(result, 'tmpl-high')).toBe('HIGH');

    // The inactive branch node should either be absent or have no output
    const lowNode = result.outputs?.['tmpl-low'] as NodeOutput | undefined;
    if (lowNode) {
      const vars = lowNode.data.variables as Record<string, { value?: unknown }>;
      expect(vars.output?.value).toBeUndefined();
    }
  });

  it('should handle if/else with boolean condition directly', async () => {
    const result = await runFlow('boolean-condition', {
      nodes: [
        {
          id: 'input-1',
          type: 'core.input',
          label: 'Flags',
          referenceId: 'flags',
          params: {
            variableName: 'flags',
            defaultValue: JSON.stringify({ isEnabled: true }),
          },
          position: { x: 0, y: 0 },
        },
        {
          id: 'if-1',
          type: 'core.if_else',
          label: 'Enabled?',
          referenceId: 'enabled_check',
          params: {
            condition: { '==': [{ var: 'flags.isEnabled' }, true] },
          },
          position: { x: 200, y: 0 },
        },
        {
          id: 'tmpl-yes',
          type: 'core.template_string',
          label: 'Enabled',
          referenceId: 'yes',
          params: { template: 'Feature is ON' },
          position: { x: 400, y: -100 },
        },
        {
          id: 'tmpl-no',
          type: 'core.template_string',
          label: 'Disabled',
          referenceId: 'no',
          params: { template: 'Feature is OFF' },
          position: { x: 400, y: 100 },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-1', target: 'if-1' },
        { id: 'e-true', source: 'if-1', target: 'tmpl-yes', sourceHandle: 'true_output' },
        { id: 'e-false', source: 'if-1', target: 'tmpl-no', sourceHandle: 'false_output' },
      ],
    });

    expect(result.status).toBe(FlowRunStatus.SUCCESS);
    expect(getNodeOutput(result, 'tmpl-yes')).toBe('Feature is ON');
  });

  it('should pass data through if/else node to downstream templates', async () => {
    // The if/else node acts as a passthrough — downstream nodes should
    // access the data that was passed INTO the if/else node.
    const result = await runFlow('passthrough-data', {
      nodes: [
        {
          id: 'input-1',
          type: 'core.input',
          label: 'User',
          referenceId: 'user',
          params: {
            variableName: 'user',
            defaultValue: JSON.stringify({ name: 'Alice', age: 21 }),
          },
          position: { x: 0, y: 0 },
        },
        {
          id: 'if-1',
          type: 'core.if_else',
          label: 'Is Adult?',
          referenceId: 'adult_check',
          params: {
            condition: { '>=': [{ var: 'user.age' }, 18] },
          },
          position: { x: 200, y: 0 },
        },
        {
          id: 'tmpl-greeting',
          type: 'core.template_string',
          label: 'Greeting',
          referenceId: 'greeting',
          params: {
            template: 'Welcome {{ adult_check.user.name }}!',
          },
          position: { x: 400, y: -100 },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-1', target: 'if-1' },
        {
          id: 'e-true',
          source: 'if-1',
          target: 'tmpl-greeting',
          sourceHandle: 'true_output',
        },
      ],
    });

    expect(result.status).toBe(FlowRunStatus.SUCCESS);
    expect(getNodeOutput(result, 'tmpl-greeting')).toContain('Alice');
  });
});
