/**
 * Backend endpoints for `@invect/vercel-workflows`.
 *
 * The Deploy button in the flow editor calls these routes to fetch the two
 * pieces of source the user copy-pastes into their Next.js app:
 *
 *   GET /vercel-workflows/preview/:flowId
 *     → { success, workflowSource, sdkSource, warnings, metadata }
 *
 *   GET /vercel-workflows/supported-actions
 *     → { nativeSupport, description }
 *
 * No state is persisted — compilation is deterministic from the flow version.
 */
import type { InvectPlugin } from '@invect/core';
import { emitSdkSource } from '@invect/primitives';
import { compile } from '../compiler/flow-compiler';

export interface VercelWorkflowsBackendOptions {
  /** Import path the generated workflow file will use to reach the SDK flow. */
  defaultFlowImport?: string;
  /** Import path to the user's flow config (`getFlowConfig`). */
  defaultConfigImport?: string;
}

export function buildBackendPlugin(options: VercelWorkflowsBackendOptions = {}): InvectPlugin {
  const defaultFlowImport = options.defaultFlowImport ?? './flow';
  const defaultConfigImport = options.defaultConfigImport ?? './flow.config';

  return {
    id: 'vercel-workflows',
    name: 'Vercel Workflows',

    endpoints: [
      {
        method: 'GET',
        path: '/vercel-workflows/preview/:flowId',
        handler: async (ctx) => {
          const { flowId } = ctx.params;
          if (!flowId) {
            return { status: 400, body: { error: 'flowId is required' } };
          }

          const invect = ctx.getInvect();
          const flow = await invect.flows.get(flowId);
          if (!flow) {
            return { status: 404, body: { error: `Flow ${flowId} not found` } };
          }

          const version = ctx.query.version ?? 'latest';
          const flowVersion = await invect.versions.get(flowId, version);
          if (!flowVersion?.invectDefinition) {
            return { status: 404, body: { error: `Flow version not found` } };
          }

          const workflowName = sanitizeIdent(flow.name || 'myWorkflow');
          const flowExport = sanitizeIdent(`${flow.name || 'my'}Flow`, { initialLower: true });

          let sdkSource: string;
          try {
            const sdkResult = emitSdkSource(flowVersion.invectDefinition, {
              flowName: flowExport,
            });
            sdkSource = sdkResult.code;
          } catch (error) {
            return {
              status: 422,
              body: {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                stage: 'sdk-emit',
              },
            };
          }

          try {
            const compileResult = compile(
              {
                nodes: flowVersion.invectDefinition.nodes.map((n) => ({
                  referenceId: n.referenceId ?? n.id,
                  type: n.type,
                  params: n.params as Record<string, unknown>,
                })),
                edges: flowVersion.invectDefinition.edges.map((e) =>
                  e.sourceHandle
                    ? [
                        edgeRef(flowVersion.invectDefinition.nodes, e.source),
                        edgeRef(flowVersion.invectDefinition.nodes, e.target),
                        e.sourceHandle,
                      ]
                    : [
                        edgeRef(flowVersion.invectDefinition.nodes, e.source),
                        edgeRef(flowVersion.invectDefinition.nodes, e.target),
                      ],
                ),
              },
              {
                workflowName,
                flowImport: ctx.query.flowImport ?? defaultFlowImport,
                flowExport,
                configImport: ctx.query.configImport ?? defaultConfigImport,
                configExport: 'getFlowConfig',
              },
            );

            return {
              status: 200,
              body: {
                success: true,
                workflowSource: compileResult.code,
                sdkSource,
                warnings: compileResult.warnings,
                metadata: {
                  stepCount: compileResult.stepCount,
                  outputCount: compileResult.outputCount,
                  workflowName,
                  flowExport,
                },
              },
            };
          } catch (error) {
            return {
              status: 422,
              body: {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                stage: 'compile',
                sdkSource,
              },
            };
          }
        },
      },

      {
        method: 'GET',
        path: '/vercel-workflows/supported-actions',
        handler: async () => ({
          status: 200,
          body: {
            nativeSupport: [
              'core.input',
              'core.output',
              'core.javascript',
              'core.if_else',
              'core.switch',
              'primitives.input',
              'primitives.output',
              'primitives.javascript',
              'primitives.if_else',
              'primitives.switch',
            ],
            description:
              'Only primitive action types compile to Vercel Workflows. Integration actions ' +
              '(gmail, slack, http, etc.) require either a companion Invect runtime call from ' +
              'inside the workflow or must be replaced with equivalent fetch-based code nodes.',
          },
        }),
      },
    ],
  };
}

function edgeRef(nodes: ReadonlyArray<{ id: string; referenceId?: string }>, id: string): string {
  const match = nodes.find((n) => n.id === id);
  return match?.referenceId ?? match?.id ?? id;
}

function sanitizeIdent(input: string, opts?: { initialLower?: boolean }): string {
  let cleaned = input.replace(/[^a-zA-Z0-9_$]/g, '_');
  if (/^[0-9]/.test(cleaned)) {
    cleaned = `_${cleaned}`;
  }
  if (cleaned.length === 0) {
    cleaned = 'myFlow';
  }
  if (opts?.initialLower && /^[A-Z]/.test(cleaned)) {
    cleaned = cleaned[0]!.toLowerCase() + cleaned.slice(1);
  }
  return cleaned;
}
