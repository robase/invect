/**
 * JsExpressionEvaluator — pluggable JS expression backend.
 *
 * Two implementations ship out of the box:
 *
 *   - QuickJsEvaluator (sandboxed, ~2 MB WASM, safe for multi-tenant hosts)
 *     — the default when running a fully managed server (Express/NestJS/Next.js).
 *
 *   - DirectEvaluator (`new Function` under the hood, no sandbox, trusted only)
 *     — for edge runtimes (Cloudflare Workers with `unsafe_eval`, Vercel
 *       Workflow steps) where bundling WASM is impractical and the flow
 *       author is the same party as the host.
 *
 * Consumers select an evaluator via FlowRunnerConfig (primitives) or
 * InvectConfig (server). Actions read it from `ctx.functions.evaluator`.
 */
import { JsExpressionEvaluationError, type JsExpressionEvaluator } from '@invect/action-kit';
export type { JsExpressionEvaluator };
export { JsExpressionEvaluationError };

/** Matches a valid JavaScript identifier (used to gate context-key destructuring). */
const VALID_JS_IDENT = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Returns true if user code lacks a `return` keyword and should be auto-wrapped
 * as `return (<expression>)`. Strings and comments are stripped before matching
 * so `"return"` inside a string literal doesn't trigger a false positive.
 */
export function needsAutoReturn(code: string): boolean {
  let stripped = '';
  let i = 0;
  while (i < code.length) {
    if (code[i] === '/' && code[i + 1] === '/') {
      i += 2;
      while (i < code.length && code[i] !== '\n') {
        i++;
      }
      continue;
    }
    if (code[i] === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        i++;
      }
      i += 2;
      continue;
    }
    if (code[i] === "'" || code[i] === '"' || code[i] === '`') {
      const quote = code[i];
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') {
          i++;
        }
        i++;
      }
      i++;
      continue;
    }
    stripped += code[i];
    i++;
  }
  return !/\breturn\b/.test(stripped);
}

/**
 * DirectEvaluator — unsandboxed `new Function` backend.
 *
 * Use ONLY when:
 *   - the host trusts the flow author (single-tenant, edge self-deployment), or
 *   - the runtime already isolates at the request level (Vercel Workflow step,
 *     Cloudflare DO with per-flow isolation).
 *
 * Caveats:
 *   - No CPU / memory limits (infinite loops hang the host).
 *   - No syscall sandbox — user code has whatever globals the runtime exposes.
 *   - Cloudflare Workers block `new Function` without `compatibility_flags =
 *     ["unsafe_eval"]` (or nodejs_compat_v2) — ensure that is set.
 */
export class DirectEvaluator implements JsExpressionEvaluator {
  async evaluate(expression: string, context: Record<string, unknown>): Promise<unknown> {
    const safeKeys = Object.keys(context).filter((k) => VALID_JS_IDENT.test(k));
    const userBody = needsAutoReturn(expression) ? `return (${expression})` : expression;
    const destructure = safeKeys.length > 0 ? `const {${safeKeys.join(',')}} = $input;` : '';
    const body = `${destructure}${userBody}`;
    try {
      const fn = new Function('$input', body) as (input: Record<string, unknown>) => unknown;
      const result = fn(context);
      if (result instanceof Promise) {
        throw new Error('Async expressions are not supported in DirectEvaluator');
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new JsExpressionEvaluationError(message, expression);
    }
  }
}
