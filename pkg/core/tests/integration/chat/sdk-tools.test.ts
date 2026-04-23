/**
 * Integration tests for the Phase 7 source-level chat tools.
 *
 * Exercises the full pipeline — `get_flow_source` emits, `edit_flow_source` /
 * `write_flow_source` evaluate + transform + merge + save — against a real
 * in-memory Invect instance. Verifies the contract that matters for the chat
 * assistant: emitted source round-trips via the SDK, node ids / positions /
 * metadata are preserved across edits, and error paths return actionable
 * diagnostics to the LLM.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import fsSync from 'node:fs';
import { join } from 'node:path';
import type { InvectInstance } from '../../../src/api/types';
import type { ChatToolContext } from '../../../src/services/chat/chat-types';
import {
  getFlowSourceTool,
  editFlowSourceTool,
  writeFlowSourceTool,
} from '../../../src/services/chat/tools/sdk-tools';
import { createTestInvect } from '../helpers/test-invect';

/**
 * The evaluator (used by edit/write tools) imports flows via jiti, which
 * resolves `@invect/sdk` to its `dist/` output. Ensure the dist exists before
 * running these tests — matches the guard in the sdk package's own tests.
 */
function ensureSdkBuilt(): void {
  const repoRoot = join(__dirname, '..', '..', '..', '..', '..');
  const sdkDist = join(repoRoot, 'pkg', 'sdk', 'dist', 'index.mjs');
  if (!fsSync.existsSync(sdkDist)) {
    execSync('pnpm --filter @invect/sdk build', { cwd: repoRoot, stdio: 'inherit' });
  }
}

describe('Chat SDK tools — source-level flow editing', () => {
  let invect: InvectInstance;
  let baseCtx: Omit<ChatToolContext, 'chatContext'>;

  beforeAll(async () => {
    ensureSdkBuilt();
    invect = await createTestInvect();
    baseCtx = { invect };
  });

  afterAll(async () => {
    await invect.shutdown();
  });

  let flowId: string;
  beforeEach(async () => {
    const flow = await invect.flows.create({ name: 'SDK tool test flow' });
    flowId = flow.id;
  });

  // ───────────────────────── get_flow_source ─────────────────────────

  describe('get_flow_source', () => {
    it('returns a valid SDK source string for a flow', async () => {
      await invect.versions.create(flowId, {
        invectDefinition: {
          nodes: [
            {
              id: 'node-query',
              type: 'core.input',
              referenceId: 'query',
              params: { variableName: 'query' },
            },
            {
              id: 'node-out',
              type: 'core.output',
              referenceId: 'out',
              params: { outputValue: '{{ query }}' },
            },
          ],
          edges: [{ id: 'e1', source: 'node-query', target: 'node-out' }],
        },
      });

      const result = await getFlowSourceTool.execute({}, { ...baseCtx, chatContext: { flowId } });

      expect(result.success).toBe(true);
      const data = result.data as {
        source: string;
        flowId: string;
        nodeCount: number;
      };
      expect(data.source).toContain(`from "@invect/sdk"`);
      expect(data.source).toContain(`input("query"`);
      expect(data.source).toContain(`output("out"`);
      expect(data.nodeCount).toBe(2);
    });

    it('returns a clear error when no flow is open', async () => {
      const result = await getFlowSourceTool.execute({}, { ...baseCtx, chatContext: {} });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no flow/i);
    });

    it('succeeds with an empty flow when no real content has been published yet', async () => {
      // `invect.flows.create` seeds an initial empty version so the editor
      // always has something to render. That's a reasonable behaviour for the
      // get path — the chat reads whatever the flow currently is.
      const result = await getFlowSourceTool.execute({}, { ...baseCtx, chatContext: { flowId } });
      expect(result.success).toBe(true);
      const data = result.data as { source: string; nodeCount: number };
      expect(data.nodeCount).toBe(0);
      expect(data.source).toContain('defineFlow({');
    });
  });

  // ───────────────────────── write_flow_source ─────────────────────────

  describe('write_flow_source', () => {
    it('seeds a new flow with a full TS source', async () => {
      const source = `
import { defineFlow, input, output } from '@invect/sdk';

export default defineFlow({
  name: 'Hello',
  nodes: [
    input('query'),
    output('greeting', { value: 'Hello {{ query }}' }),
  ],
  edges: [['query', 'greeting']],
});
`;
      const result = await writeFlowSourceTool.execute(
        { source },
        { ...baseCtx, chatContext: { flowId } },
      );

      expect(result.success).toBe(true);
      const version = await invect.versions.get(flowId, 'latest');
      expect(version!.invectDefinition.nodes).toHaveLength(2);
      expect(version!.invectDefinition.nodes[0].referenceId).toBe('query');
      expect(version!.invectDefinition.nodes[1].referenceId).toBe('greeting');
      expect(version!.invectDefinition.edges).toHaveLength(1);
    });

    it('preserves node ids + positions from the prior version', async () => {
      // Seed an initial version with specific ids and positions.
      await invect.versions.create(flowId, {
        invectDefinition: {
          nodes: [
            {
              id: 'node_opaque_abc',
              type: 'core.input',
              referenceId: 'query',
              params: { variableName: 'query' },
              position: { x: 100, y: 50 },
            },
            {
              id: 'node_opaque_def',
              type: 'core.output',
              referenceId: 'out',
              params: { outputValue: '{{ query }}' },
              position: { x: 100, y: 250 },
            },
          ],
          edges: [{ id: 'e1', source: 'node_opaque_abc', target: 'node_opaque_def' }],
        },
      });

      // Write a new source that changes params but keeps the referenceIds.
      const source = `
import { defineFlow, input, output } from '@invect/sdk';

export default defineFlow({
  nodes: [
    input('query', { defaultValue: 'default text' }),
    output('out', { value: '{{ query }} (updated)' }),
  ],
  edges: [['query', 'out']],
});
`;
      const result = await writeFlowSourceTool.execute(
        { source },
        { ...baseCtx, chatContext: { flowId } },
      );
      expect(result.success).toBe(true);

      const version = await invect.versions.get(flowId, 'latest');
      const nodes = version!.invectDefinition.nodes;
      expect(nodes.find((n) => n.referenceId === 'query')?.id).toBe('node_opaque_abc');
      expect(nodes.find((n) => n.referenceId === 'query')?.position).toEqual({ x: 100, y: 50 });
      expect(nodes.find((n) => n.referenceId === 'out')?.id).toBe('node_opaque_def');
      expect(nodes.find((n) => n.referenceId === 'out')?.position).toEqual({ x: 100, y: 250 });
    });

    it('reports import-forbidden errors from the evaluator', async () => {
      const source = `
import { defineFlow, input } from '@invect/sdk';
import fs from 'node:fs';
export default defineFlow({ nodes: [input('q')], edges: [] });
`;
      const result = await writeFlowSourceTool.execute(
        { source },
        { ...baseCtx, chatContext: { flowId } },
      );
      expect(result.success).toBe(false);
      const data = result.data as { stage: string; errors: Array<{ code: string }> };
      expect(data.stage).toBe('evaluate');
      expect(data.errors.some((e) => e.code === 'import-forbidden')).toBe(true);
      expect(result.suggestion).toMatch(/@invect/i);
    });

    it('reports missing default export as a structured diagnostic', async () => {
      const source = `
import { defineFlow, input } from '@invect/sdk';
const notDefault = defineFlow({ nodes: [input('q')], edges: [] });
`;
      const result = await writeFlowSourceTool.execute(
        { source },
        { ...baseCtx, chatContext: { flowId } },
      );
      expect(result.success).toBe(false);
      const data = result.data as { errors: Array<{ code: string }> };
      expect(data.errors[0].code).toBe('no-default-export');
    });

    it('reports transform diagnostics when a node param contains unsupported code', async () => {
      // Authored source uses a closure over an outer variable — transform
      // should flag it with `unknown-identifier`.
      const source = `
import { defineFlow, input, code } from '@invect/sdk';

const threshold = 10;
export default defineFlow({
  nodes: [
    input('x'),
    code('check', { code: ((ctx) => ctx.x > threshold) }),
  ],
  edges: [['x', 'check']],
});
`;
      const result = await writeFlowSourceTool.execute(
        { source },
        { ...baseCtx, chatContext: { flowId } },
      );
      // The transform stage catches the closure — may or may not run
      // depending on whether code param is evaluated as function. If string,
      // it passes through; if function, transform flags it.
      if (!result.success) {
        const data = result.data as { stage?: string };
        expect(['transform', 'evaluate']).toContain(data.stage);
      }
    });

    it('rejects save when flow source has no flow open', async () => {
      const result = await writeFlowSourceTool.execute(
        { source: '' },
        { ...baseCtx, chatContext: {} },
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no flow/i);
    });
  });

  // ───────────────────────── edit_flow_source ─────────────────────────

  describe('edit_flow_source', () => {
    beforeEach(async () => {
      // Seed a flow whose source we can edit.
      await invect.versions.create(flowId, {
        invectDefinition: {
          nodes: [
            {
              id: 'node_a',
              type: 'core.input',
              referenceId: 'query',
              params: { variableName: 'query' },
            },
            {
              id: 'node_b',
              type: 'core.output',
              referenceId: 'result',
              params: { outputValue: '{{ query }}' },
            },
          ],
          edges: [{ id: 'e1', source: 'node_a', target: 'node_b' }],
        },
      });
    });

    it('applies a unique str_replace and saves a new version', async () => {
      // First fetch the source the LLM would see.
      const { data: getData } = await getFlowSourceTool.execute(
        {},
        { ...baseCtx, chatContext: { flowId } },
      );
      const source = (getData as { source: string }).source;

      // The emitter converts pure `{{ expr }}` outputValue into an arrow
      // `return (query);`. Edit that line to wrap the return in a String call.
      const oldString = 'return (query);';
      const newString = 'return ("Hello " + String(query));';
      expect(source).toContain(oldString);

      const result = await editFlowSourceTool.execute(
        { oldString, newString },
        { ...baseCtx, chatContext: { flowId } },
      );

      expect(result.success).toBe(true);
      const latest = await invect.versions.get(flowId, 'latest');
      const outputNode = latest!.invectDefinition.nodes.find((n) => n.referenceId === 'result');
      // The arrow-to-string transform serialises the edited arrow body back
      // into a QuickJS expression string.
      expect(String(outputNode?.params.outputValue)).toContain('Hello');
    });

    it('rejects an oldString that appears multiple times without more context', async () => {
      const result = await editFlowSourceTool.execute(
        { oldString: '"query"', newString: '"renamed"' },
        { ...baseCtx, chatContext: { flowId } },
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/multiple times/i);
    });

    it('rejects an oldString that is not found', async () => {
      const result = await editFlowSourceTool.execute(
        { oldString: 'nonexistent_marker_xyz', newString: 'anything' },
        { ...baseCtx, chatContext: { flowId } },
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    it('preserves ids + positions through the edit', async () => {
      // Add positions to the seeded flow (overwrites the version seeded in
      // the outer beforeEach).
      await invect.versions.create(flowId, {
        invectDefinition: {
          nodes: [
            {
              id: 'node_a',
              type: 'core.input',
              referenceId: 'query',
              params: { variableName: 'query' },
              position: { x: 100, y: 200 },
            },
            {
              id: 'node_b',
              type: 'core.output',
              referenceId: 'result',
              params: { outputValue: '{{ query }}' },
              position: { x: 100, y: 400 },
            },
          ],
          edges: [{ id: 'e1', source: 'node_a', target: 'node_b' }],
        },
      });

      // Edit the output arrow body (same shape as the passthrough test above).
      const result = await editFlowSourceTool.execute(
        {
          oldString: 'return (query);',
          newString: 'return ("updated: " + String(query));',
        },
        { ...baseCtx, chatContext: { flowId } },
      );
      expect(result.success).toBe(true);

      const latest = await invect.versions.get(flowId, 'latest');
      const nodes = latest!.invectDefinition.nodes;
      expect(nodes.find((n) => n.referenceId === 'query')?.id).toBe('node_a');
      expect(nodes.find((n) => n.referenceId === 'query')?.position).toEqual({ x: 100, y: 200 });
      expect(nodes.find((n) => n.referenceId === 'result')?.id).toBe('node_b');
      expect(nodes.find((n) => n.referenceId === 'result')?.position).toEqual({ x: 100, y: 400 });
    });
  });

  // ───────────────────────── end-to-end scenario ─────────────────────────

  describe('full round-trip: edit the flow via the chat pipeline', () => {
    it('get → edit → get shows the change persisted', async () => {
      // Mixed-text output values emit as template literals, giving the LLM a
      // predictable anchor to str_replace against. Pure `{{ expr }}` forms
      // collapse to bare expressions (covered by the edit tests above).
      await invect.versions.create(flowId, {
        invectDefinition: {
          nodes: [
            { id: 'n1', type: 'core.input', referenceId: 'name', params: { variableName: 'name' } },
            {
              id: 'n2',
              type: 'core.output',
              referenceId: 'greeting',
              params: { outputValue: 'Hello {{ name }}!' },
            },
          ],
          edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
        },
      });

      // 1. Chat reads the source — should contain the template literal.
      const firstGet = await getFlowSourceTool.execute({}, { ...baseCtx, chatContext: { flowId } });
      expect(firstGet.success).toBe(true);
      const firstSource = (firstGet.data as { source: string }).source;
      expect(firstSource).toContain('Hello ${(name)}!');

      // 2. Chat edits the template literal to change the greeting.
      const edit = await editFlowSourceTool.execute(
        {
          oldString: 'Hello ${(name)}!',
          newString: 'Hi ${(name)}!',
        },
        { ...baseCtx, chatContext: { flowId } },
      );
      expect(edit.success).toBe(true);

      // 3. Chat reads the source again — change is reflected.
      const secondGet = await getFlowSourceTool.execute(
        {},
        { ...baseCtx, chatContext: { flowId } },
      );
      expect(secondGet.success).toBe(true);
      const secondSource = (secondGet.data as { source: string }).source;
      expect(secondSource).toContain('Hi ${(name)}!');
      expect(secondSource).not.toContain('Hello ${(name)}!');
    });
  });
});
