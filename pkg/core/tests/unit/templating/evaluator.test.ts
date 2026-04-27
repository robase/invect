/**
 * Unit tests: DirectEvaluator runtime feature detection + QuickJS fallback.
 *
 * Verifies the PR-9 changes:
 *   1. The module-load `HAS_EVAL` probe never throws on import (so the
 *      module is safe to ship to Cloudflare Workers / strict-CSP browsers
 *      that forbid `new Function`).
 *   2. When `disableNativeEval: true`, `DirectEvaluator` delegates to the
 *      configured `fallback` (e.g. QuickJsExpressionService) instead of
 *      using `new Function`.
 *   3. When `disableNativeEval: true` and no fallback is configured,
 *      `evaluate()` throws a clear `JsExpressionEvaluationError`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  DirectEvaluator,
  HAS_EVAL,
  JsExpressionEvaluationError,
} from '../../../src/services/templating/evaluator';
import { JsExpressionService } from '../../../src/services/templating/js-expression.service';

describe('DirectEvaluator (PR 9 — runtime feature detection)', () => {
  describe('HAS_EVAL', () => {
    it('is a boolean (the module-load probe never throws)', () => {
      // The exported constant exists and the module didn't throw at import.
      expect(typeof HAS_EVAL).toBe('boolean');
    });

    it('is true on Node.js (used to confirm the test runtime supports eval)', () => {
      // Node always allows `new Function`, so the test runtime should observe
      // HAS_EVAL === true. If this ever fails, the runtime sniffing is broken.
      expect(HAS_EVAL).toBe(true);
    });
  });

  describe('default (native eval) path', () => {
    it('evaluates a simple expression via `new Function`', async () => {
      const evaluator = new DirectEvaluator();
      const result = await evaluator.evaluate('a + b', { a: 1, b: 2 });
      expect(result).toBe(3);
    });

    it('exposes context keys as locals via destructuring', async () => {
      const evaluator = new DirectEvaluator();
      const result = await evaluator.evaluate('user.name', { user: { name: 'alice' } });
      expect(result).toBe('alice');
    });

    it('throws JsExpressionEvaluationError on syntax errors', async () => {
      const evaluator = new DirectEvaluator();
      await expect(evaluator.evaluate('const x =;', {})).rejects.toThrow(
        JsExpressionEvaluationError,
      );
    });
  });

  describe('disableNativeEval — fallback to a sandboxed evaluator', () => {
    let quickjs: JsExpressionService;

    beforeAll(async () => {
      quickjs = new JsExpressionService();
      await quickjs.initialize();
    });

    afterAll(() => {
      quickjs.dispose();
    });

    it('delegates to the configured fallback when disableNativeEval is true', async () => {
      const fallbackSpy = vi.fn(async (expr: string, ctx: Record<string, unknown>) => {
        return quickjs.evaluate(expr, ctx);
      });
      const evaluator = new DirectEvaluator({
        disableNativeEval: true,
        fallback: { evaluate: fallbackSpy },
      });

      const result = await evaluator.evaluate('a * 10', { a: 4 });
      expect(result).toBe(40);
      expect(fallbackSpy).toHaveBeenCalledOnce();
      expect(fallbackSpy).toHaveBeenCalledWith('a * 10', { a: 4 });
    });

    it('end-to-end: QuickJS fallback produces the same result as native eval', async () => {
      const direct = new DirectEvaluator();
      const sandboxed = new DirectEvaluator({
        disableNativeEval: true,
        fallback: quickjs,
      });

      const ctx = { items: [1, 2, 3, 4, 5] };
      const expr = 'items.filter(x => x > 2).length';

      const directResult = await direct.evaluate(expr, ctx);
      const sandboxedResult = await sandboxed.evaluate(expr, ctx);
      expect(sandboxedResult).toBe(directResult);
      expect(sandboxedResult).toBe(3);
    });

    it('throws a clear error when disableNativeEval is true and no fallback is configured', async () => {
      const evaluator = new DirectEvaluator({ disableNativeEval: true });
      await expect(evaluator.evaluate('1 + 1', {})).rejects.toThrow(JsExpressionEvaluationError);
      await expect(evaluator.evaluate('1 + 1', {})).rejects.toThrow(/disableNativeEval/);
    });

    it('initialize() forwards to the fallback when present', async () => {
      const initSpy = vi.fn(async () => {});
      const evaluator = new DirectEvaluator({
        disableNativeEval: true,
        fallback: { evaluate: async () => null, initialize: initSpy },
      });
      await evaluator.initialize();
      expect(initSpy).toHaveBeenCalledOnce();
    });

    it('initialize() is a no-op when no fallback is configured', async () => {
      const evaluator = new DirectEvaluator();
      await expect(evaluator.initialize()).resolves.toBeUndefined();
    });
  });
});
