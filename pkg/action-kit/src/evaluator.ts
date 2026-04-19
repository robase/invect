/**
 * Structural interface for a JS expression evaluator.
 *
 * Concrete implementations (QuickJS-backed or direct `new Function`) live in
 * host packages. Actions that need to evaluate user expressions read the
 * evaluator from `ctx.functions.evaluator`.
 */
export interface JsExpressionEvaluator {
  /** Lazy init — safe to call repeatedly. */
  initialize?(): Promise<void>;
  /**
   * Evaluate user code against a context record. Upstream node keys are
   * exposed as local variables; `$input` is always the full context.
   * Single-expression code (no `return` keyword) auto-returns.
   */
  evaluate(expression: string, context: Record<string, unknown>): Promise<unknown>;
  /** Optional cleanup — called on shutdown for long-lived hosts. */
  dispose?(): void;
}

/**
 * Error type thrown by evaluators when user code fails (security violation,
 * syntax error, runtime exception, etc.). Actions can `instanceof`-check this
 * to surface a precise error instead of a generic stack trace.
 *
 * Concrete evaluators (QuickJS, Direct) and the host runtime should throw
 * `JsExpressionError` so the catch sites in actions remain stable.
 */
export class JsExpressionError extends Error {
  constructor(
    message: string,
    public readonly expression: string,
  ) {
    super(`Mapper expression error: ${message}`);
    this.name = 'JsExpressionError';
  }
}

/**
 * Error thrown by the standalone direct-evaluator (and any other backend that
 * surfaces user-code failures without a mapping prefix). Distinct from
 * `JsExpressionError` so call-sites can react differently if they need to.
 */
export class JsExpressionEvaluationError extends Error {
  constructor(
    message: string,
    public readonly expression: string,
  ) {
    super(`JS expression error: ${message}`);
    this.name = 'JsExpressionEvaluationError';
  }
}
