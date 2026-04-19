// ─── Flow runner (most important export) ─────────────────────────────────────
export { createVercelFlowRunner } from './runner';
export type { VercelFlowRunnerConfig } from './runner';

// ─── Server plugin ────────────────────────────────────────────────────────────
export { vercelWorkflowsPlugin } from './plugin';
export type { VercelWorkflowsPluginOptions } from './plugin';

// ─── Re-export primitives for convenience ────────────────────────────────────
export {
  defineFlow,
  input,
  output,
  model,
  ifElse,
  switchNode,
  agent,
  code,
  edge,
  WaitTimeoutError,
} from '@invect/primitives';
export type {
  PrimitiveFlowDefinition,
  PrimitiveNode,
  PrimitiveEdge,
  NodeContext,
  ParamValue,
  FlowRunResult,
} from '@invect/primitives';
