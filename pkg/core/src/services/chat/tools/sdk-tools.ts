/**
 * Source-level chat tools — the Phase 7 entry point for the chat assistant's
 * SDK-file editing mode.
 *
 * Three tools replace the bulk of the granular JSON-patch toolkit:
 *
 *   - `get_flow_source` — returns the current flow as canonical `@invect/sdk`
 *     TypeScript source. What the LLM reads.
 *   - `edit_flow_source` — str_replace-style edit against the emitted source.
 *     Re-evaluates, transforms arrows → strings, merges into the prior DB
 *     definition (preserving ids/positions/instanceIds), saves a new version.
 *   - `write_flow_source` — full rewrite. Same pipeline, just no str_replace.
 *
 * The save pipeline is identical for edit + write — both funnel through
 * `saveFlowFromSource` below. The granular JSON-patch tools (`add_node`,
 * `update_node_config`, etc.) stay registered alongside as a targeted
 * fallback for flows the round-trip can't handle today (e.g. provider actions
 * whose params contain complex JSON structures the LLM might misformat).
 */

import { z } from 'zod/v4';
import { emitSdkSource } from '@invect/sdk';
import { evaluateSdkSource } from '@invect/sdk/evaluator';
import { transformArrowsToStrings } from '@invect/sdk/transform';
import { mergeParsedIntoDefinition } from '@invect/sdk';
import type { DbFlowDefinition } from '@invect/sdk';
import type { ChatToolContext, ChatToolDefinition, ChatToolResult } from '../chat-types';
import type { InvectInstance } from 'src/api/types';

// ═══════════════════════════════════════════════════════════════════════════
// get_flow_source
// ═══════════════════════════════════════════════════════════════════════════

export const getFlowSourceTool: ChatToolDefinition = {
  id: 'get_flow_source',
  name: 'Get Flow Source',
  description:
    'Return the current flow as canonical TypeScript source using the @invect/sdk. ' +
    'The source is what FlowCodePanel shows, what users hand-author, and what copy-paste / git sync produce. ' +
    'Prefer this over the granular JSON-inspection tools when reasoning about the flow as a whole.',
  parameters: z.object({}),
  async execute(_params, ctx): Promise<ChatToolResult> {
    const flowId = ctx.chatContext.flowId;
    if (!flowId) {
      return { success: false, error: 'No flow is currently open' };
    }

    try {
      const [flow, version] = await Promise.all([
        ctx.invect.flows.get(flowId),
        ctx.invect.versions.get(flowId, 'latest'),
      ]);
      if (!version?.invectDefinition) {
        return {
          success: false,
          error: 'Flow has no versions yet — create the initial definition first',
        };
      }

      const { code, sdkImports, actionImports } = emitSdkSource(version.invectDefinition, {
        flowName: toFlowExportName(flow.name),
        metadata: {
          name: flow.name,
          ...(flow.description ? { description: flow.description } : {}),
          ...(flow.tags && flow.tags.length > 0 ? { tags: flow.tags } : {}),
        },
      });

      return {
        success: true,
        data: {
          source: code,
          flowId,
          versionNumber: version.version,
          nodeCount: version.invectDefinition.nodes.length,
          edgeCount: version.invectDefinition.edges.length,
          imports: { sdk: sdkImports, actions: actionImports },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to emit flow source: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// edit_flow_source
// ═══════════════════════════════════════════════════════════════════════════

export const editFlowSourceTool: ChatToolDefinition = {
  id: 'edit_flow_source',
  name: 'Edit Flow Source',
  description:
    'Apply a str_replace-style edit to the current flow source. ' +
    'Both `oldString` and `newString` must match the emitted source verbatim (whitespace-sensitive). ' +
    'The edit must identify `oldString` unambiguously — include enough surrounding context for the match to be unique. ' +
    'After the edit, the full source is evaluated, arrow functions are serialised back to strings for QuickJS storage, ' +
    'and the result is merged into the prior DB version (preserving node ids, positions, and agent-tool instance ids).',
  parameters: z.object({
    oldString: z
      .string()
      .min(1)
      .describe(
        'Exact substring of the current flow source to replace. Must be unique in the source — include surrounding context if the literal appears multiple times.',
      ),
    newString: z.string().describe('Replacement text. May be empty to delete `oldString`.'),
  }),
  async execute(params, ctx): Promise<ChatToolResult> {
    const { oldString, newString } = params as { oldString: string; newString: string };
    const flowId = ctx.chatContext.flowId;
    if (!flowId) {
      return { success: false, error: 'No flow is currently open' };
    }

    try {
      const [flow, version] = await Promise.all([
        ctx.invect.flows.get(flowId),
        ctx.invect.versions.get(flowId, 'latest'),
      ]);
      if (!version?.invectDefinition) {
        return {
          success: false,
          error: 'Flow has no versions yet — use write_flow_source to seed the initial definition',
        };
      }

      // 1. Emit the current source.
      const { code: currentSource } = emitSdkSource(version.invectDefinition, {
        flowName: toFlowExportName(flow.name),
        metadata: {
          name: flow.name,
          ...(flow.description ? { description: flow.description } : {}),
          ...(flow.tags && flow.tags.length > 0 ? { tags: flow.tags } : {}),
        },
      });

      // 2. Validate and apply the str_replace.
      const firstIdx = currentSource.indexOf(oldString);
      if (firstIdx === -1) {
        return {
          success: false,
          error: '`oldString` was not found in the current flow source',
          suggestion:
            'Call get_flow_source first to see the exact source text, then include enough context in `oldString` to match verbatim (including whitespace).',
        };
      }
      const secondIdx = currentSource.indexOf(oldString, firstIdx + 1);
      if (secondIdx !== -1) {
        return {
          success: false,
          error:
            '`oldString` appears multiple times in the source — add more surrounding context so it is unique',
          suggestion:
            "Include surrounding lines (e.g. the containing node's declaration) in `oldString` so it uniquely identifies the edit location.",
        };
      }

      const newSource =
        currentSource.slice(0, firstIdx) +
        newString +
        currentSource.slice(firstIdx + oldString.length);

      // 3. Evaluate + transform + merge + save.
      return await saveFlowFromSource(ctx.invect, flowId, newSource, version.invectDefinition);
    } catch (error) {
      return {
        success: false,
        error: `Edit failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// write_flow_source
// ═══════════════════════════════════════════════════════════════════════════

export const writeFlowSourceTool: ChatToolDefinition = {
  id: 'write_flow_source',
  name: 'Write Flow Source',
  description:
    'Replace the entire flow with the provided TypeScript source. ' +
    'Use this for new flows or when making several coordinated edits that would be awkward as individual `edit_flow_source` calls. ' +
    'The source must be a complete `@invect/sdk` flow file — `import { defineFlow, ... } from "@invect/sdk"` plus `export default defineFlow({...})`. ' +
    'Node ids, canvas positions, and agent-tool instance ids are preserved from the prior version by matching on `referenceId`.',
  parameters: z.object({
    source: z
      .string()
      .min(1)
      .describe(
        'Complete TypeScript source for the flow. Must include imports from @invect/sdk and an `export default defineFlow({...})`.',
      ),
  }),
  async execute(params, ctx): Promise<ChatToolResult> {
    const { source } = params as { source: string };
    const flowId = ctx.chatContext.flowId;
    if (!flowId) {
      return { success: false, error: 'No flow is currently open' };
    }

    try {
      // Prior definition is used by the merge step for id/position/instanceId
      // preservation. Brand-new flows have no prior version yet.
      let priorDef: DbFlowDefinition | null = null;
      try {
        const version = await ctx.invect.versions.get(flowId, 'latest');
        if (version?.invectDefinition) {
          priorDef = version.invectDefinition as DbFlowDefinition;
        }
      } catch {
        // No prior version — fine; merge will generate fresh ids.
      }

      return await saveFlowFromSource(ctx.invect, flowId, source, priorDef);
    } catch (error) {
      return {
        success: false,
        error: `Write failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Shared save pipeline
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate SDK source → extract arrow bodies → merge into prior DB state →
 * save a new flow version. Each stage returns its diagnostics on failure so
 * the LLM can see exactly what went wrong.
 */
async function saveFlowFromSource(
  invect: InvectInstance,
  flowId: string,
  source: string,
  priorDef: DbFlowDefinition | null,
): Promise<ChatToolResult> {
  // 1. Evaluate — parse + execute the SDK source, gets us a structured flow.
  const evalResult = await evaluateSdkSource(source);
  if (!evalResult.ok || !evalResult.flow) {
    return {
      success: false,
      error: 'Flow source did not evaluate successfully',
      data: { stage: 'evaluate', errors: evalResult.errors },
      suggestion: formatEvalSuggestion(evalResult.errors),
    };
  }

  // 2. Transform — arrow functions → QuickJS-compatible string expressions.
  const transformResult = transformArrowsToStrings(evalResult.flow.nodes);
  if (!transformResult.ok) {
    return {
      success: false,
      error: 'Flow source contains arrow expressions that cannot be stored (see diagnostics)',
      data: { stage: 'transform', diagnostics: transformResult.diagnostics },
      suggestion:
        'Rewrite the flagged expressions to avoid closures over outer variables, async/await, loops, or try/catch.',
    };
  }

  // 3. Merge — preserve DB ids, positions, and agent-tool instanceIds where
  //    referenceIds match the prior version. Brand-new nodes get fresh ids.
  let merged: DbFlowDefinition;
  try {
    merged = mergeParsedIntoDefinition(
      {
        nodes: transformResult.nodes,
        edges: evalResult.flow.edges,
        metadata: evalResult.flow.metadata,
      },
      priorDef,
    );
  } catch (error) {
    return {
      success: false,
      error: `Merge failed: ${error instanceof Error ? error.message : String(error)}`,
      data: { stage: 'merge' },
    };
  }

  // 4. Save — publish a new flow version via the standard versions API.
  //    The `DbFlowDefinition` from `@invect/sdk` is structurally compatible
  //    with core's Zod-typed `InvectDefinition`; the cast bridges the
  //    weaker-types-at-the-boundary gap without a runtime conversion.
  try {
    const version = await invect.versions.create(flowId, {
      invectDefinition: merged as unknown as Parameters<
        typeof invect.versions.create
      >[1]['invectDefinition'],
    });
    return {
      success: true,
      data: {
        flowId,
        versionNumber: version.version,
        nodeCount: merged.nodes.length,
        edgeCount: merged.edges.length,
      },
      uiAction: { action: 'refresh_flow', data: { flowId } },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to save new flow version: ${error instanceof Error ? error.message : String(error)}`,
      data: { stage: 'save' },
    };
  }
}

function formatEvalSuggestion(errors: Array<{ code: string; message: string }>): string {
  const codes = new Set(errors.map((e) => e.code));
  if (codes.has('import-forbidden')) {
    return 'Only imports from @invect/sdk, @invect/action-kit, and @invect/actions/* are allowed in flow source.';
  }
  if (codes.has('dynamic-import')) {
    return 'Dynamic `import()` is not allowed — use top-level import statements only.';
  }
  if (codes.has('no-default-export')) {
    return 'Flow source must export the flow as default: `export default defineFlow({...})`.';
  }
  if (codes.has('default-export-not-a-flow')) {
    return 'The default export must be the return value of defineFlow({...}).';
  }
  return 'Review the errors and regenerate the flow source.';
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert a human-entered flow name into a JS-safe export identifier for the
 * emitter. Non-alphanumeric runs collapse to camelCase; leading digits get
 * prefixed with `_`; a trailing `Flow` is added when absent so generated
 * names read naturally as `myFlow`, `greetingFlow`, etc.
 *
 * Mirrors the helper the sync plugin uses so chat-emitted and sync-emitted
 * flow files produce identical exports.
 */
function toFlowExportName(raw: string): string {
  const segments = raw.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (segments.length === 0) {
    return 'myFlow';
  }
  const camel = segments
    .map((s, i) =>
      i === 0 ? s.charAt(0).toLowerCase() + s.slice(1) : s.charAt(0).toUpperCase() + s.slice(1),
    )
    .join('');
  const base = /^[0-9]/.test(camel) ? `_${camel}` : camel;
  return /[Ff]low$/.test(base) ? base : `${base}Flow`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Export bundle
// ═══════════════════════════════════════════════════════════════════════════

export const sdkTools: ChatToolDefinition[] = [
  getFlowSourceTool,
  editFlowSourceTool,
  writeFlowSourceTool,
];
