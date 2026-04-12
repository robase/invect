import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  JsExpressionService,
  JsExpressionError,
} from '../../../src/services/templating/js-expression.service';

describe('JsExpressionService', () => {
  let service: JsExpressionService;

  beforeAll(async () => {
    service = new JsExpressionService();
    await service.initialize();
  });

  afterAll(() => {
    service.dispose();
  });

  // ── Auto-return (one-liner) expressions ────────────────────────────────────

  describe('auto-return (one-liners)', () => {
    it('simple property access', async () => {
      const result = await service.evaluate('user.name', { user: { name: 'alice' } });
      expect(result).toBe('alice');
    });

    it('nested property access', async () => {
      const result = await service.evaluate('user.address.city', {
        user: { address: { city: 'NYC' } },
      });
      expect(result).toBe('NYC');
    });

    it('array filter', async () => {
      const result = await service.evaluate('items.filter(x => x > 2)', { items: [1, 2, 3, 4, 5] });
      expect(result).toEqual([3, 4, 5]);
    });

    it('array map', async () => {
      const result = await service.evaluate('users.map(u => u.name)', {
        users: [{ name: 'alice' }, { name: 'bob' }],
      });
      expect(result).toEqual(['alice', 'bob']);
    });

    it('reduce', async () => {
      const result = await service.evaluate('orders.reduce((s, o) => s + o.amount, 0)', {
        orders: [{ amount: 50 }, { amount: 100 }],
      });
      expect(result).toBe(150);
    });

    it('array length (number)', async () => {
      const result = await service.evaluate('items.length', { items: [1, 2, 3] });
      expect(result).toBe(3);
    });

    it('ternary expression', async () => {
      const result = await service.evaluate("active ? 'yes' : 'no'", { active: true });
      expect(result).toBe('yes');
    });

    it('passthrough array (variable name only)', async () => {
      const result = await service.evaluate('users', {
        users: [{ id: 1 }, { id: 2 }],
      });
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('flatMap cross-product', async () => {
      const result = await service.evaluate(
        'users.flatMap(u => roles.map(r => ({ user: u, role: r })))',
        { users: ['alice', 'bob'], roles: ['admin', 'viewer'] },
      );
      expect(result).toEqual([
        { user: 'alice', role: 'admin' },
        { user: 'alice', role: 'viewer' },
        { user: 'bob', role: 'admin' },
        { user: 'bob', role: 'viewer' },
      ]);
    });

    it('zip two arrays', async () => {
      const result = await service.evaluate('users.map((u, i) => ({ ...u, score: scores[i] }))', {
        users: [{ name: 'alice' }, { name: 'bob' }],
        scores: [95, 87],
      });
      expect(result).toEqual([
        { name: 'alice', score: 95 },
        { name: 'bob', score: 87 },
      ]);
    });

    it('null/undefined returns null', async () => {
      const result = await service.evaluate('data.missing', { data: {} });
      expect(result).toBeUndefined();
    });
  });

  // ── Explicit return (multi-statement) ──────────────────────────────────────

  describe('explicit return (multi-statement)', () => {
    it('filter then map with return', async () => {
      const result = await service.evaluate(
        'const a = items.filter(x => x > 2); return a.map(x => x * 10);',
        { items: [1, 2, 3, 4, 5] },
      );
      expect(result).toEqual([30, 40, 50]);
    });

    it('multiple inputs combined', async () => {
      const result = await service.evaluate(
        `const u = users.filter(u => u.active);
         return u.map((u, i) => ({ ...u, score: scores[i] }));`,
        {
          users: [
            { name: 'alice', active: true },
            { name: 'bob', active: false },
            { name: 'carol', active: true },
          ],
          scores: [95, 87],
        },
      );
      expect(result).toEqual([
        { name: 'alice', active: true, score: 95 },
        { name: 'carol', active: true, score: 87 },
      ]);
    });

    it('object literal return', async () => {
      const result = await service.evaluate('return { name: user.name, count: items.length }', {
        user: { name: 'alice' },
        items: [1, 2, 3],
      });
      expect(result).toEqual({ name: 'alice', count: 3 });
    });

    it('conditional early return', async () => {
      const result = await service.evaluate(
        'if (!items || items.length === 0) return []; return items.filter(x => x > 2);',
        { items: [1, 2, 3, 4, 5] },
      );
      expect(result).toEqual([3, 4, 5]);
    });

    it('conditional early return — empty case', async () => {
      const result = await service.evaluate(
        'if (!items || items.length === 0) return []; return items.filter(x => x > 2);',
        { items: [] },
      );
      expect(result).toEqual([]);
    });

    it('aggregate then return object', async () => {
      const result = await service.evaluate(
        'return { total: orders.reduce((s, o) => s + o.amount, 0), count: orders.length }',
        { orders: [{ amount: 50 }, { amount: 100 }] },
      );
      expect(result).toEqual({ total: 150, count: 2 });
    });
  });

  // ── $input escape hatch ────────────────────────────────────────────────────

  describe('$input escape hatch', () => {
    it('$input provides full context', async () => {
      const result = await service.evaluate('$input.user.name', { user: { name: 'alice' } });
      expect(result).toBe('alice');
    });

    it('$input works when key collides with JS global', async () => {
      // "name" is a valid JS identifier but also a property of Function.name etc.
      const result = await service.evaluate('$input.name', { name: 'my-flow' });
      expect(result).toBe('my-flow');
    });

    it('$input.length works (length is a common collision)', async () => {
      const result = await service.evaluate('$input.length', { length: 42 });
      expect(result).toBe(42);
    });
  });

  // ── Type preservation ──────────────────────────────────────────────────────

  describe('type preservation', () => {
    it('returns number', async () => {
      const result = await service.evaluate('a + b', { a: 1, b: 2 });
      expect(result).toBe(3);
      expect(typeof result).toBe('number');
    });

    it('returns boolean', async () => {
      const result = await service.evaluate('a > b', { a: 5, b: 3 });
      expect(result).toBe(true);
    });

    it('returns string', async () => {
      const result = await service.evaluate("a + ' ' + b", { a: 'hello', b: 'world' });
      expect(result).toBe('hello world');
    });

    it('returns null', async () => {
      const result = await service.evaluate('null', {});
      expect(result).toBeNull();
    });

    it('returns array of objects', async () => {
      const result = await service.evaluate('[{ a: 1 }, { a: 2 }]', {});
      expect(result).toEqual([{ a: 1 }, { a: 2 }]);
    });

    it('returns nested object', async () => {
      const result = await service.evaluate('return { a: { b: { c: 1 } } }', {});
      expect(result).toEqual({ a: { b: { c: 1 } } });
    });
  });

  // ── Sandbox safety ─────────────────────────────────────────────────────────

  describe('sandbox safety', () => {
    it('require is not defined', async () => {
      await expect(service.evaluate("require('fs')", {})).rejects.toThrow(JsExpressionError);
    });

    it('globalThis has no Node.js APIs', async () => {
      await expect(service.evaluate('process.env', {})).rejects.toThrow(JsExpressionError);
    });

    it('import() is not available', async () => {
      await expect(service.evaluate("import('fs')", {})).rejects.toThrow();
    });

    it('fetch is not defined', async () => {
      await expect(service.evaluate("fetch('http://evil.com')", {})).rejects.toThrow(
        JsExpressionError,
      );
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws JsExpressionError on syntax error', async () => {
      await expect(service.evaluate('const x = ;', {})).rejects.toThrow(JsExpressionError);
    });

    it('throws JsExpressionError on runtime error', async () => {
      await expect(service.evaluate('nonexistent.property', {})).rejects.toThrow(JsExpressionError);
    });

    it('error includes the expression text', async () => {
      try {
        await service.evaluate('undefined_var.foo', {});
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(JsExpressionError);
        expect((e as JsExpressionError).expression).toBe('undefined_var.foo');
      }
    });

    it('throws if not initialized', async () => {
      const uninit = new JsExpressionService();
      await expect(uninit.evaluate('1 + 1', {})).rejects.toThrow('not initialized');
    });

    it('interrupts runaway code when the CPU deadline is exceeded', async () => {
      const timeoutService = new JsExpressionService({ cpuTimeLimitMs: 10 });
      await timeoutService.initialize();

      await expect(
        timeoutService.evaluate('while (true) { if (false) { return 1; } }', {}),
      ).rejects.toThrow('CPU time limit exceeded');

      timeoutService.dispose();
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('empty expression returns undefined', async () => {
      const result = await service.evaluate('return undefined', {});
      expect(result).toBeUndefined();
    });

    it('empty context works', async () => {
      const result = await service.evaluate('1 + 2', {});
      expect(result).toBe(3);
    });

    it('large array (1000 items)', async () => {
      const items = Array.from({ length: 1000 }, (_, i) => i);
      const result = await service.evaluate('items.filter(x => x % 2 === 0).length', { items });
      expect(result).toBe(500);
    });

    it('context with special characters in values', async () => {
      const result = await service.evaluate('msg', { msg: 'hello "world" \n\ttab' });
      expect(result).toBe('hello "world" \n\ttab');
    });

    it('auto-return does not trigger on "return" inside a string', async () => {
      // The word "return" appears in the string, but not as a keyword
      const result = await service.evaluate(
        `const msg = "please return the item"; return msg;`,
        {},
      );
      expect(result).toBe('please return the item');
    });

    it('Math built-in works', async () => {
      const result = await service.evaluate('Math.max(...nums)', { nums: [3, 1, 4, 1, 5] });
      expect(result).toBe(5);
    });

    it('JSON built-in works', async () => {
      const result = await service.evaluate('JSON.stringify({ a: 1 })', {});
      expect(result).toBe('{"a":1}');
    });

    it('Date constructor works', async () => {
      const result = await service.evaluate('typeof new Date()', {});
      expect(result).toBe('object');
    });

    it('RegExp works', async () => {
      const result = await service.evaluate('/^hello/.test(msg)', { msg: 'hello world' });
      expect(result).toBe(true);
    });
  });
});
