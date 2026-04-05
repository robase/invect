/**
 * JS Expression Service
 *
 * Provides sandboxed JavaScript evaluation for data mapper expressions.
 * Uses QuickJS (via quickjs-emscripten) for safe, isolated execution.
 *
 * User code is wrapped in a function body — use `return` to produce a value.
 * For single-expression one-liners (no `return` keyword), `return` is auto-prepended.
 *
 * Context keys from upstream nodes are injected as local variables.
 * `$input` is always available as the full context object (escape hatch for name collisions).
 */
import { newQuickJSWASMModule } from 'quickjs-emscripten';
import type { QuickJSWASMModule, QuickJSRuntime } from 'quickjs-emscripten';
import type { Logger } from 'src/schemas';

export interface JsExpressionServiceConfig {
  /** Memory limit for the QuickJS runtime in bytes. Default: 16MB */
  memoryLimitBytes?: number;
  /** Max stack size in bytes. Default: 1MB */
  maxStackSizeBytes?: number;
}

const DEFAULT_MEMORY_LIMIT = 16 * 1024 * 1024; // 16 MB
const DEFAULT_MAX_STACK_SIZE = 1024 * 1024; // 1 MB

export class JsExpressionService {
  private module: QuickJSWASMModule | null = null;
  private runtime: QuickJSRuntime | null = null;
  private logger?: Logger;
  private config: Required<JsExpressionServiceConfig>;

  constructor(config: JsExpressionServiceConfig = {}, logger?: Logger) {
    this.logger = logger;
    this.config = {
      memoryLimitBytes: config.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT,
      maxStackSizeBytes: config.maxStackSizeBytes ?? DEFAULT_MAX_STACK_SIZE,
    };
  }

  /**
   * Initialize the QuickJS WASM module and runtime.
   * Must be called before evaluate(). Safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.runtime) {
      return;
    }

    this.module = await newQuickJSWASMModule();
    this.runtime = this.module.newRuntime();
    this.runtime.setMemoryLimit(this.config.memoryLimitBytes);
    this.runtime.setMaxStackSize(this.config.maxStackSizeBytes);

    this.logger?.debug('JsExpressionService initialized', {
      memoryLimit: this.config.memoryLimitBytes,
      maxStackSize: this.config.maxStackSizeBytes,
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
   * evaluate("users.filter(u => u.active)", { users: [...] })
   *
   * // Explicit return (multi-statement):
   * evaluate(`
   *   const active = users.filter(u => u.active);
   *   return active.map(u => ({ ...u, rank: 1 }));
   * `, { users: [...] })
   */
  evaluate(expression: string, context: Record<string, unknown>): unknown {
    if (!this.runtime) {
      throw new Error('JsExpressionService not initialized. Call initialize() first.');
    }

    const vm = this.runtime.newContext();
    try {
      // Inject context as a JSON-serialized global, then destructure into locals.
      // This avoids per-key handle creation and is faster for large contexts.
      const contextJson = JSON.stringify(context);
      const contextKeys = Object.keys(context);

      // Build the wrapped code:
      // 1. Parse the serialized context into $input
      // 2. Destructure context keys into local variables
      // 3. Execute user code in a function body (with auto-return for one-liners)
      const userBody = needsAutoReturn(expression) ? `return (${expression})` : expression;
      const destructure =
        contextKeys.length > 0 ? `const {${contextKeys.join(',')}} = $input;` : '';
      const wrapped = `(function(){const $input = JSON.parse(${JSON.stringify(contextJson)});${destructure}${userBody}})()`;

      const result = vm.evalCode(wrapped);
      if (result.error) {
        const errorObj = vm.dump(result.error);
        result.error.dispose();
        const message =
          typeof errorObj === 'object' && errorObj !== null && 'message' in errorObj
            ? (errorObj as { message: string }).message
            : String(errorObj);
        throw new JsExpressionError(message, expression);
      }

      const value = vm.dump(result.value);
      result.value.dispose();
      return value;
    } finally {
      vm.dispose();
    }
  }

  /**
   * Dispose the QuickJS runtime. Call on Invect shutdown.
   */
  dispose(): void {
    if (this.runtime) {
      this.runtime.dispose();
      this.runtime = null;
    }
    this.module = null;
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
