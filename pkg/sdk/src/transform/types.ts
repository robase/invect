/**
 * Arrow-to-string transform types.
 *
 * The transform takes a parsed SDK flow (with function-valued params from
 * user-authored arrows like `(ctx) => ctx.x > 5`) and produces a DB-ready
 * version where those functions are serialised to QuickJS-compatible string
 * expressions.
 *
 * Diagnostics are precise — each diagnostic names the node referenceId, the
 * param path, and a human-readable reason. The save pipeline aborts on any
 * `error`-level diagnostic; `warning`s are informational.
 */

import type { SdkFlowNode } from '../types';

export interface TransformDiagnostic {
  level: 'error' | 'warning';
  /** Node `referenceId` where the issue lives. */
  nodeRef: string;
  /** Dot-path into the node's params (e.g. `"code"`, `"cases[0].expression"`). */
  path: string;
  /** Short reason code — stable, machine-consumable. */
  code: TransformDiagnosticCode;
  /** Human-readable message. */
  message: string;
  /** Optional 1-indexed line within the original arrow source. */
  line?: number;
}

export type TransformDiagnosticCode =
  | 'not-a-function'
  | 'not-an-arrow'
  | 'parse-failed'
  | 'unsupported-syntax'
  | 'unknown-identifier'
  | 'async-arrow'
  | 'generator'
  | 'await-expression'
  | 'dynamic-import'
  | 'try-catch'
  | 'loop'
  | 'class-declaration'
  | 'bad-ctx-param';

export interface TransformOptions {
  /**
   * Additional global identifiers that are safe to reference in arrow bodies.
   * Merged with the built-in allowlist (Math, JSON, Array, Object, …).
   */
  allowedGlobals?: string[];
}

export interface TransformResult {
  /** Parsed flow with function params replaced by QuickJS-compatible strings. */
  nodes: SdkFlowNode[];
  /** Every diagnostic emitted during the walk — both errors and warnings. */
  diagnostics: TransformDiagnostic[];
  /** True when no `error`-level diagnostics were emitted. */
  ok: boolean;
}
