/**
 * JS Expression Service
 *
 * Provides sandboxed JavaScript evaluation for data mapper expressions.
 * Uses secure-exec (V8 isolate sandbox) for safe, isolated execution.
 *
 * User code is wrapped in a function body — use `return` to produce a value.
 * For single-expression one-liners (no `return` keyword), `return` is auto-prepended.
 *
 * Context keys from upstream nodes are injected as local variables.
 * `$input` is always available as the full context object (escape hatch for name collisions).
 */
import { NodeRuntime, createNodeDriver, createNodeRuntimeDriverFactory } from 'secure-exec';
import type { Logger } from 'src/schemas';

export interface JsExpressionServiceConfig {
  /** Memory limit for the sandbox runtime in MB. Default: 16 */
  memoryLimitMB?: number;
  /** CPU time limit per evaluation in milliseconds. Default: 5000 */
  cpuTimeLimitMs?: number;
}

const DEFAULT_MEMORY_LIMIT_MB = 128;
const DEFAULT_CPU_TIME_LIMIT_MS = 5000;

/** Matches a valid JavaScript identifier (used to filter context keys for safe destructuring). */
const VALID_JS_IDENT = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

export class JsExpressionService {
  private runtime: NodeRuntime | null = null;
  private logger?: Logger;
  private config: Required<JsExpressionServiceConfig>;

  constructor(config: JsExpressionServiceConfig = {}, logger?: Logger) {
    this.logger = logger;
    this.config = {
      memoryLimitMB: config.memoryLimitMB ?? DEFAULT_MEMORY_LIMIT_MB,
      cpuTimeLimitMs: config.cpuTimeLimitMs ?? DEFAULT_CPU_TIME_LIMIT_MS,
    };
  }

  /**
   * Initialize the secure-exec runtime.
   * Must be called before evaluate(). Safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.runtime) {
      return;
    }

    this.runtime = new NodeRuntime({
      systemDriver: createNodeDriver(),
      runtimeDriverFactory: createNodeRuntimeDriverFactory(),
      memoryLimit: this.config.memoryLimitMB,
      cpuTimeLimitMs: this.config.cpuTimeLimitMs,
    });

    this.logger?.debug('JsExpressionService initialized', {
      memoryLimitMB: this.config.memoryLimitMB,
      cpuTimeLimitMs: this.config.cpuTimeLimitMs,
    });
  }

  /**
   * Evaluate JS code against a context object.
   *
   * User code is wrapped in a function body. Use `return` to produce a value.
   * For one-liners without `return`, the service auto-prepends it.
   *
   * Context keys are available as local variables. `$input` is the full context.
   *
   * @example
   * // Auto-return (one-liner):
   * await evaluate("users.filter(u => u.active)", { users: [...] })
   *
   * // Explicit return (multi-statement):
   * await evaluate(`
   *   const active = users.filter(u => u.active);
   *   return active.map(u => ({ ...u, rank: 1 }));
   * `, { users: [...] })
   */
  async evaluate(expression: string, context: Record<string, unknown>): Promise<unknown> {
    if (!this.runtime) {
      throw new Error('JsExpressionService not initialized. Call initialize() first.');
    }

    // Inject context as a JSON-serialized global, then destructure into locals.
    const contextJson = JSON.stringify(context);
    // Only destructure keys that are valid JS identifiers to prevent code injection.
    // Non-identifier keys (e.g. "my-key") are still accessible via $input["my-key"].
    const safeKeys = Object.keys(context).filter((k) => VALID_JS_IDENT.test(k));

    // Build the wrapped code:
    // 1. Parse the serialized context into $input
    // 2. Destructure safe context keys into local variables
    // 3. Execute user code in a function body (with auto-return for one-liners)
    const userBody = needsAutoReturn(expression) ? `return (${expression})` : expression;
    const destructure = safeKeys.length > 0 ? `const {${safeKeys.join(',')}} = $input;` : '';
    const fnBody = `const $input = JSON.parse(${JSON.stringify(contextJson)});${destructure}${userBody}`;
    const wrapped = `export default (function(){${fnBody}})()`;

    let result: Awaited<ReturnType<NodeRuntime['run']>>;
    try {
      result = await this.runtime.run<{ default: unknown }>(wrapped);
    } catch (error: unknown) {
      // The V8 isolate may be permanently disposed after certain fatal errors
      // (e.g. dynamic import attempts). Auto-recover by reinitializing the runtime.
      if (error instanceof Error && error.message?.includes('Isolate is disposed')) {
        this.logger?.warn('V8 isolate disposed, reinitializing runtime');
        this.runtime = null;
        await this.initialize();
        throw new JsExpressionError('Runtime was reset after isolate disposal', expression);
      }
      throw error;
    }

    if (result.code !== 0) {
      throw new JsExpressionError(
        result.errorMessage ?? 'Expression evaluation failed',
        expression,
      );
    }

    return result.exports?.default;
  }

  /**
   * Dispose the secure-exec runtime. Call on Invect shutdown.
   */
  dispose(): void {
    if (this.runtime) {
      this.runtime.dispose();
      this.runtime = null;
    }
    this.logger?.debug('JsExpressionService disposed');
  }
}

/**
 * Determine if user code needs auto-return wrapping.
 *
 * Auto-return is applied when the code does NOT contain a `return` keyword
 * (as a word boundary match, to avoid false positives in strings like "returns").
 *
 * This means one-liners like `users.filter(u => u.active)` work without typing `return`,
 * while multi-statement code requires explicit `return`.
 */
function needsAutoReturn(code: string): boolean {
  // Strip string literals and comments using a linear-time character scanner
  // to avoid polynomial backtracking in regex-based stripping.
  let stripped = '';
  let i = 0;
  while (i < code.length) {
    // Line comment
    if (code[i] === '/' && code[i + 1] === '/') {
      i += 2;
      while (i < code.length && code[i] !== '\n') {
        i++;
      }
      continue;
    }
    // Block comment
    if (code[i] === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        i++;
      }
      i += 2; // skip closing */
      continue;
    }
    // Single-quoted string
    if (code[i] === "'") {
      i++;
      while (i < code.length && code[i] !== "'") {
        if (code[i] === '\\') {
          i++;
        }
        i++;
      }
      i++;
      continue;
    }
    // Double-quoted string
    if (code[i] === '"') {
      i++;
      while (i < code.length && code[i] !== '"') {
        if (code[i] === '\\') {
          i++;
        }
        i++;
      }
      i++;
      continue;
    }
    // Template literal
    if (code[i] === '`') {
      i++;
      while (i < code.length && code[i] !== '`') {
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
 * Custom error class for mapper expression errors.
 * Includes the original expression for debugging.
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

// ── Singleton helpers ──────────────────────────────────────────────────────────

let defaultInstance: JsExpressionService | null = null;

export async function getJsExpressionService(logger?: Logger): Promise<JsExpressionService> {
  if (!defaultInstance) {
    defaultInstance = new JsExpressionService({}, logger);
    await defaultInstance.initialize();
  }
  return defaultInstance;
}

export function createJsExpressionService(
  config?: JsExpressionServiceConfig,
  logger?: Logger,
): JsExpressionService {
  return new JsExpressionService(config, logger);
}

/**
 * Dispose the global singleton (call during shutdown).
 */
export function disposeJsExpressionService(): void {
  if (defaultInstance) {
    defaultInstance.dispose();
    defaultInstance = null;
  }
}
