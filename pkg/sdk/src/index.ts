/**
 * `@invect/sdk` — the unified authoring SDK for Invect flows.
 *
 * Single entry point for authoring `.flow.ts` files, consuming DB-emitted
 * source, and anywhere else flows are expressed as TypeScript. Replaces the
 * split between `@invect/core/sdk` and the authoring surface of
 * `@invect/primitives` (which becomes a runtime-only package).
 *
 * Use:
 *   ```ts
 *   import { defineFlow, input, code, output } from '@invect/sdk';
 *
 *   export default defineFlow({
 *     nodes: [
 *       input('query'),
 *       code('upper', { code: 'return query.toUpperCase()' }),
 *       output('result', { value: '{{ upper }}' }),
 *     ],
 *     edges: [['query', 'upper'], ['upper', 'result']],
 *   });
 *   ```
 *
 * Custom actions authored via `@invect/action-kit`'s `defineAction()` are
 * callable directly — no codegen step, no separate import path:
 *   ```ts
 *   import { mySlackDigest } from './my-actions';
 *   defineFlow({ nodes: [input('x'), mySlackDigest('notify', { ... })], ... });
 *   ```
 */

// Flow-level helpers
export { defineFlow, FlowValidationError } from './define-flow';
export type { DefinedFlow } from './define-flow';

// Edge helpers
export { edge, isEdgeTuple, resolveEdge } from './edge';

// Agent tool-instance helper
export { tool } from './tool';
export type { ToolInstance } from './tool';

// Core node helpers (ergonomic wrappers over the action callables)
export { input, output, code, javascript, ifElse, switchNode, model, agent } from './nodes/core';
export type { ModelParams, AgentParams, SwitchCase } from './nodes/core';

// Extended node helpers
export { template } from './nodes/template';
export { httpRequest } from './nodes/http';
export type { HttpRequestParams } from './nodes/http';
export { trigger } from './nodes/trigger';
export { node } from './nodes/generic';

// Re-export the canonical shapes so authors can type their own utilities
// without reaching into `@invect/action-kit` directly.
export type {
  SdkFlowNode,
  SdkFlowDefinition,
  SdkEdge,
  SdkEdgeObject,
  SdkEdgeTuple,
  ResolvedEdge,
  NodeOptions,
  MapperOptions,
} from './types';

// `defineAction` itself (so users can author custom actions from the same
// import root they author flows from).
export { defineAction } from '@invect/action-kit';
export type { ActionDefinition, ActionHelper } from '@invect/action-kit';

// Emitter — DB definition → TS source. Single source of truth for every
// surface that renders a flow as code (FlowCodePanel, copy-paste, Vercel
// deploy preview, chat assistant, git sync).
export { emitSdkSource, SdkEmitError } from './emitter';
export type {
  EmitOptions,
  EmitResult,
  DbFlowDefinition,
  DbFlowNode,
  DbFlowEdge,
  NodeSpan,
} from './emitter';

// Merge — parsed SDK flow → canonical DB definition, preserving node ids,
// positions, labels, and agent-tool instanceIds against a prior version.
export { mergeParsedIntoDefinition } from './merge';
export type { MergeInput, MergeOptions } from './merge';

// Browser-safe fragment parser — for clipboard paste in the flow editor and
// light server-side round-trip checks where jiti eval is unnecessary. The
// Node-only evaluator at `@invect/sdk/evaluator` is the preferred path for
// LLM-generated source or anywhere an import allowlist is required.
export { parseSDKText } from './parse-fragment';
export type { ParsedFragment } from './parse-fragment';
