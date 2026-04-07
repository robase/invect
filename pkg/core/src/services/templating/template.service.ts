/**
 * Template Service
 *
 * Evaluates {{ expression }} blocks as JavaScript using the JsExpressionService
 * (QuickJS WASM sandbox). Drop-in replacement for NunjucksService.
 *
 * Behavior:
 * - "Pure expression" templates (entire value is a single {{ expr }})
 *   return the raw JS value (object, array, number, etc.).
 * - "Mixed" templates (text with embedded {{ expr }} blocks)
 *   always return a string, with each expression result stringified.
 * - Errors inside {{ }} in mixed templates produce empty string (matches
 *   Nunjucks' throwOnUndefined:false behavior).
 *
 * Context keys are injected as local variables in the QuickJS sandbox.
 * `$input` is always available as the full context object.
 */
import type { JsExpressionService } from './js-expression.service';
import type { Logger } from 'src/schemas';

export interface TemplateRenderResult {
  success: boolean;
  value: unknown;
  error?: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  error?: string;
}

/** Regex to detect at least one {{ … }} block (unrolled loop to avoid backtracking). */
const TEMPLATE_PATTERN = /\{\{[^}]*(?:\}(?!\})[^}]*)*\}\}/;

/** Regex to detect a "pure expression": the entire string is one {{ expr }} with no other text or expressions (unrolled loop). */
const PURE_EXPRESSION_PATTERN = /^\{\{([^}]*(?:\}(?!\})[^}]*)*)\}\}$/;

/**
 * Checks whether a string is a "pure" single-expression template
 * (i.e. the entire string is exactly `{{ expression }}`).
 *
 * We first validate with the regex, then verify no other `{{ }}` blocks exist.
 */
function isPureExpression(template: string): RegExpMatchArray | null {
  const m = template.match(PURE_EXPRESSION_PATTERN);
  if (!m) {
    return null;
  }
  // Trim whitespace from captured expression (moved from regex \s* groups)
  m[1] = m[1].trim();
  return m;
}

/** Regex to match each {{ … }} block for replacement (unrolled loop). */
const EXPRESSION_BLOCK_PATTERN = /\{\{([^}]*(?:\}(?!\})[^}]*)*)\}\}/g;

/** Regex for a valid JavaScript identifier (used for context destructuring). */
const _VALID_JS_IDENT = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Helper functions injected into every QuickJS evaluation context.
 * These provide backward compatibility with the Nunjucks custom filters/globals.
 *
 * Stored as individual entries so we can skip ones that collide with context keys.
 */
const COMPAT_HELPER_ENTRIES: Array<{ name: string; code: string }> = [
  {
    name: 'json',
    code: 'function json(obj, indent) { return JSON.stringify(obj, null, indent ?? 2); }',
  },
  {
    name: 'first',
    code: 'function first(arr) { return Array.isArray(arr) && arr.length > 0 ? arr[0] : null; }',
  },
  {
    name: 'last',
    code: 'function last(arr) { return Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : null; }',
  },
  {
    name: 'keys',
    code: "function keys(obj) { return obj && typeof obj === 'object' ? Object.keys(obj) : []; }",
  },
  {
    name: 'values',
    code: "function values(obj) { return obj && typeof obj === 'object' ? Object.values(obj) : []; }",
  },
  { name: 'exists', code: 'function exists(val) { return val !== null && val !== undefined; }' },
  { name: 'isArray', code: 'function isArray(val) { return Array.isArray(val); }' },
  {
    name: 'isObject',
    code: "function isObject(val) { return val !== null && typeof val === 'object' && !Array.isArray(val); }",
  },
];

export class TemplateService {
  private jsExpressionService: JsExpressionService;
  private logger?: Logger;

  constructor(jsExpressionService: JsExpressionService, logger?: Logger) {
    this.jsExpressionService = jsExpressionService;
    this.logger = logger;
  }

  /**
   * Check if a string contains template expressions {{ … }}.
   */
  isTemplate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    return TEMPLATE_PATTERN.test(value);
  }

  /**
   * Render a template string by evaluating {{ expr }} blocks as JavaScript.
   *
   * - Pure expression (entire value is `{{ expr }}`): returns raw JS value.
   * - Mixed template: returns interpolated string.
   */
  render(template: string, context: Record<string, unknown>): unknown {
    // Pure expression — return raw value (object, array, number, etc.)
    const pureMatch = isPureExpression(template);
    if (pureMatch) {
      return this.evaluateExpression(pureMatch[1].trim(), context);
    }

    // Mixed template — string interpolation, errors → empty string
    return template.replace(EXPRESSION_BLOCK_PATTERN, (_match, expr: string) => {
      try {
        const result = this.evaluateExpression(expr.trim(), context);
        if (result === null || result === undefined) {
          return '';
        }
        if (typeof result === 'object') {
          return JSON.stringify(result);
        }
        return String(result);
      } catch (error) {
        this.logger?.debug('Template expression error (swallowed)', {
          expression: expr.trim(),
          error: error instanceof Error ? error.message : String(error),
        });
        return '';
      }
    });
  }

  /**
   * Render a template with error handling, returning a result object.
   */
  safeRender(template: string, context: Record<string, unknown>): TemplateRenderResult {
    try {
      const value = this.render(template, context);
      return { success: true, value };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, value: '', error: errorMessage };
    }
  }

  /**
   * Validate a template string by checking expression syntax without executing.
   */
  validate(template: string): TemplateValidationResult {
    const expressions: string[] = [];
    let match;
    // oxlint-disable-next-line security/detect-non-literal-regexp -- creating global variant of existing pattern
    const pattern = new RegExp(EXPRESSION_BLOCK_PATTERN.source, 'g');
    while ((match = pattern.exec(template)) !== null) {
      expressions.push(match[1].trim());
    }

    if (expressions.length === 0) {
      return { valid: true };
    }

    // Try to evaluate with an empty context — syntax errors will surface
    for (const expr of expressions) {
      try {
        // Use a dummy context to check syntax; runtime errors are fine
        this.evaluateExpression(expr, {});
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // Only treat syntax errors as invalid; runtime errors (undefined vars) are OK
        if (msg.includes('SyntaxError') || msg.includes('Unexpected token')) {
          return { valid: false, error: `Invalid expression: ${expr} — ${msg}` };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Extract root-level variable references from a template.
   * Returns the first identifier in each {{ expr }} block.
   */
  extractVariableReferences(template: string): string[] {
    const refs: string[] = [];
    const pattern = /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    let match;
    while ((match = pattern.exec(template)) !== null) {
      if (!refs.includes(match[1])) {
        refs.push(match[1]);
      }
    }
    return refs;
  }

  /**
   * Get root-level keys referenced in a template.
   */
  getRootReferences(template: string): string[] {
    return this.extractVariableReferences(template);
  }

  /**
   * Evaluate a single JS expression against a context.
   *
   * Wraps the expression with compat helpers and context destructuring,
   * then delegates to JsExpressionService.evaluate().
   */
  private evaluateExpression(expression: string, context: Record<string, unknown>): unknown {
    // Build compat helpers, skipping any whose name collides with a context key
    // (QuickJS disallows re-declaring a `const`-destructured variable as a function).
    const contextKeys = new Set(Object.keys(context));
    const helpers = COMPAT_HELPER_ENTRIES.filter((h) => !contextKeys.has(h.name))
      .map((h) => h.code)
      .join('\n');

    const wrapped = helpers ? `${helpers}\nreturn (${expression});` : `return (${expression});`;
    return this.jsExpressionService.evaluate(wrapped, context);
  }
}

// ── Singleton helpers ──────────────────────────────────────────────────────────

let defaultInstance: TemplateService | null = null;

/**
 * Get (or create) the global TemplateService singleton.
 * Requires an initialized JsExpressionService.
 */
export function getTemplateService(
  jsExpressionService: JsExpressionService,
  logger?: Logger,
): TemplateService {
  if (!defaultInstance) {
    defaultInstance = new TemplateService(jsExpressionService, logger);
  }
  return defaultInstance;
}

export function createTemplateService(
  jsExpressionService: JsExpressionService,
  logger?: Logger,
): TemplateService {
  return new TemplateService(jsExpressionService, logger);
}

/**
 * Reset the singleton (for testing).
 */
export function resetTemplateService(): void {
  defaultInstance = null;
}
