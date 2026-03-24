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
    it('simple property access', () => {
      const result = service.evaluate('user.name', { user: { name: 'alice' } });
      expect(result).toBe('alice');
    });

    it('nested property access', () => {
      const result = service.evaluate('user.address.city', {
        user: { address: { city: 'NYC' } },
      });
      expect(result).toBe('NYC');
    });

    it('array filter', () => {
      const result = service.evaluate('items.filter(x => x > 2)', { items: [1, 2, 3, 4, 5] });
      expect(result).toEqual([3, 4, 5]);
    });

    it('array map', () => {
      const result = service.evaluate('users.map(u => u.name)', {
        users: [{ name: 'alice' }, { name: 'bob' }],
      });
      expect(result).toEqual(['alice', 'bob']);
    });

    it('reduce', () => {
      const result = service.evaluate('orders.reduce((s, o) => s + o.amount, 0)', {
        orders: [{ amount: 50 }, { amount: 100 }],
      });
      expect(result).toBe(150);
    });

    it('array length (number)', () => {
      const result = service.evaluate('items.length', { items: [1, 2, 3] });
      expect(result).toBe(3);
    });

    it('ternary expression', () => {
      const result = service.evaluate("active ? 'yes' : 'no'", { active: true });
      expect(result).toBe('yes');
    });

    it('passthrough array (variable name only)', () => {
      const result = service.evaluate('users', {
        users: [{ id: 1 }, { id: 2 }],
      });
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('flatMap cross-product', () => {
      const result = service.evaluate(
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

    it('zip two arrays', () => {
      const result = service.evaluate(
        'users.map((u, i) => ({ ...u, score: scores[i] }))',
        {
          users: [{ name: 'alice' }, { name: 'bob' }],
          scores: [95, 87],
        },
      );
      expect(result).toEqual([
        { name: 'alice', score: 95 },
        { name: 'bob', score: 87 },
      ]);
    });

    it('null/undefined returns null', () => {
      const result = service.evaluate('data.missing', { data: {} });
      expect(result).toBeUndefined();
    });
  });

  // ── Explicit return (multi-statement) ──────────────────────────────────────

  describe('explicit return (multi-statement)', () => {
    it('filter then map with return', () => {
      const result = service.evaluate(
        'const a = items.filter(x => x > 2); return a.map(x => x * 10);',
        { items: [1, 2, 3, 4, 5] },
      );
      expect(result).toEqual([30, 40, 50]);
    });

    it('multiple inputs combined', () => {
      const result = service.evaluate(
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

    it('object literal return', () => {
      const result = service.evaluate('return { name: user.name, count: items.length }', {
        user: { name: 'alice' },
        items: [1, 2, 3],
      });
      expect(result).toEqual({ name: 'alice', count: 3 });
    });

    it('conditional early return', () => {
      const result = service.evaluate(
        'if (!items || items.length === 0) return []; return items.filter(x => x > 2);',
        { items: [1, 2, 3, 4, 5] },
      );
      expect(result).toEqual([3, 4, 5]);
    });

    it('conditional early return — empty case', () => {
      const result = service.evaluate(
        'if (!items || items.length === 0) return []; return items.filter(x => x > 2);',
        { items: [] },
      );
      expect(result).toEqual([]);
    });

    it('aggregate then return object', () => {
      const result = service.evaluate(
        'return { total: orders.reduce((s, o) => s + o.amount, 0), count: orders.length }',
        { orders: [{ amount: 50 }, { amount: 100 }] },
      );
      expect(result).toEqual({ total: 150, count: 2 });
    });
  });

  // ── $input escape hatch ────────────────────────────────────────────────────

  describe('$input escape hatch', () => {
    it('$input provides full context', () => {
      const result = service.evaluate('$input.user.name', { user: { name: 'alice' } });
      expect(result).toBe('alice');
    });

    it('$input works when key collides with JS global', () => {
      // "name" is a valid JS identifier but also a property of Function.name etc.
      const result = service.evaluate('$input.name', { name: 'my-flow' });
      expect(result).toBe('my-flow');
    });

    it('$input.length works (length is a common collision)', () => {
      const result = service.evaluate('$input.length', { length: 42 });
      expect(result).toBe(42);
    });
  });

  // ── Type preservation ──────────────────────────────────────────────────────

  describe('type preservation', () => {
    it('returns number', () => {
      const result = service.evaluate('a + b', { a: 1, b: 2 });
      expect(result).toBe(3);
      expect(typeof result).toBe('number');
    });

    it('returns boolean', () => {
      const result = service.evaluate('a > b', { a: 5, b: 3 });
      expect(result).toBe(true);
    });

    it('returns string', () => {
      const result = service.evaluate("a + ' ' + b", { a: 'hello', b: 'world' });
      expect(result).toBe('hello world');
    });

    it('returns null', () => {
      const result = service.evaluate('null', {});
      expect(result).toBeNull();
    });

    it('returns array of objects', () => {
      const result = service.evaluate('[{ a: 1 }, { a: 2 }]', {});
      expect(result).toEqual([{ a: 1 }, { a: 2 }]);
    });

    it('returns nested object', () => {
      const result = service.evaluate('return { a: { b: { c: 1 } } }', {});
      expect(result).toEqual({ a: { b: { c: 1 } } });
    });
  });

  // ── Sandbox safety ─────────────────────────────────────────────────────────

  describe('sandbox safety', () => {
    it('require is not defined', () => {
      expect(() => service.evaluate("require('fs')", {})).toThrow(JsExpressionError);
    });

    it('globalThis has no Node.js APIs', () => {
      expect(() => service.evaluate('process.env', {})).toThrow(JsExpressionError);
    });

    it('import() is not available', () => {
      expect(() => service.evaluate("import('fs')", {})).toThrow();
    });

    it('fetch is not defined', () => {
      expect(() => service.evaluate("fetch('http://evil.com')", {})).toThrow(JsExpressionError);
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws JsExpressionError on syntax error', () => {
      expect(() => service.evaluate('const x = ;', {})).toThrow(JsExpressionError);
    });

    it('throws JsExpressionError on runtime error', () => {
      expect(() => service.evaluate('nonexistent.property', {})).toThrow(JsExpressionError);
    });

    it('error includes the expression text', () => {
      try {
        service.evaluate('undefined_var.foo', {});
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(JsExpressionError);
        expect((e as JsExpressionError).expression).toBe('undefined_var.foo');
      }
    });

    it('throws if not initialized', () => {
      const uninit = new JsExpressionService();
      expect(() => uninit.evaluate('1 + 1', {})).toThrow('not initialized');
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('empty expression returns undefined', () => {
      const result = service.evaluate('return undefined', {});
      expect(result).toBeUndefined();
    });

    it('empty context works', () => {
      const result = service.evaluate('1 + 2', {});
      expect(result).toBe(3);
    });

    it('large array (1000 items)', () => {
      const items = Array.from({ length: 1000 }, (_, i) => i);
      const result = service.evaluate('items.filter(x => x % 2 === 0).length', { items });
      expect(result).toBe(500);
    });

    it('context with special characters in values', () => {
      const result = service.evaluate('msg', { msg: 'hello "world" \n\ttab' });
      expect(result).toBe('hello "world" \n\ttab');
    });

    it('auto-return does not trigger on "return" inside a string', () => {
      // The word "return" appears in the string, but not as a keyword
      const result = service.evaluate(
        `const msg = "please return the item"; return msg;`,
        {},
      );
      expect(result).toBe('please return the item');
    });

    it('Math built-in works', () => {
      const result = service.evaluate('Math.max(...nums)', { nums: [3, 1, 4, 1, 5] });
      expect(result).toBe(5);
    });

    it('JSON built-in works', () => {
      const result = service.evaluate('JSON.stringify({ a: 1 })', {});
      expect(result).toBe('{"a":1}');
    });

    it('Date constructor works', () => {
      const result = service.evaluate('typeof new Date()', {});
      expect(result).toBe('object');
    });

    it('RegExp works', () => {
      const result = service.evaluate('/^hello/.test(msg)', { msg: 'hello world' });
      expect(result).toBe(true);
    });
  });
});
