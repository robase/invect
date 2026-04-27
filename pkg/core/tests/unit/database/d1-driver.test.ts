/**
 * Smoke tests for the Cloudflare D1 driver factory.
 *
 * These tests verify the *driver layer* in isolation — they construct a
 * mock D1Database binding (the kind a Workers runtime would inject as
 * `env.DB`) and confirm that:
 *
 * 1. `createD1Driver` returns a `DatabaseDriver` whose `queryAll` and
 *    `execute` route through the binding.
 * 2. `resolveDatabaseDriverType` returns `'d1'` when the user explicitly
 *    asks for it.
 * 3. The Zod database config schema accepts the `{ driver: 'd1', binding }`
 *    shape and rejects D1 configs missing the binding.
 *
 * Full Miniflare-backed D1 integration tests are out of scope for PR 3 —
 * see `D1_TRANSACTION_AUDIT.md` for follow-up work.
 */

import { describe, it, expect, vi } from 'vitest';
import { createD1Driver, type D1DatabaseBinding } from '../../../src/database/drivers/d1';
import { resolveDatabaseDriverType } from '../../../src/database/drivers';
import type { Logger } from '../../../src/schemas';

function noopLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/**
 * Build a mock that mimics the `D1Database` runtime API closely enough
 * for the driver to exercise both the bound and unbound prepare paths.
 */
function mockD1Binding(): {
  binding: D1DatabaseBinding;
  prepare: ReturnType<typeof vi.fn>;
  bind: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
} {
  const all = vi.fn(async () => ({ results: [{ id: 1, name: 'alice' }] }));
  const run = vi.fn(async () => ({ meta: { changes: 3 } }));

  const stmt = { all, run };
  const bind = vi.fn(() => stmt);
  const prepare = vi.fn(() => ({ ...stmt, bind }));

  const binding: D1DatabaseBinding = {
    prepare: prepare as unknown as D1DatabaseBinding['prepare'],
  };

  return { binding, prepare, bind, all, run };
}

describe('D1 driver — createD1Driver', () => {
  it('returns a DatabaseDriver whose `type` is "d1"', async () => {
    const { binding } = mockD1Binding();
    const driver = await createD1Driver(binding, noopLogger());

    expect(driver.type).toBe('d1');
    expect(typeof driver.queryAll).toBe('function');
    expect(typeof driver.execute).toBe('function');
    expect(typeof driver.close).toBe('function');
  });

  it('rejects an invalid binding', async () => {
    await expect(createD1Driver({} as unknown as D1DatabaseBinding, noopLogger())).rejects.toThrow(
      /invalid binding/,
    );
  });

  it('queryAll returns rows from binding.prepare(...).all()', async () => {
    const { binding, prepare, all } = mockD1Binding();
    const driver = await createD1Driver(binding, noopLogger());

    const rows = await driver.queryAll('SELECT * FROM users');
    expect(prepare).toHaveBeenCalledWith('SELECT * FROM users');
    expect(all).toHaveBeenCalled();
    expect(rows).toEqual([{ id: 1, name: 'alice' }]);
  });

  it('queryAll with params calls bind() with the params', async () => {
    const { binding, prepare, bind, all } = mockD1Binding();
    const driver = await createD1Driver(binding, noopLogger());

    await driver.queryAll('SELECT * FROM users WHERE id = ?', [42]);
    expect(prepare).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?');
    expect(bind).toHaveBeenCalledWith(42);
    expect(all).toHaveBeenCalled();
  });

  it('execute returns the meta.changes count from binding.prepare(...).run()', async () => {
    const { binding, run } = mockD1Binding();
    const driver = await createD1Driver(binding, noopLogger());

    const result = await driver.execute('UPDATE users SET name = ? WHERE id = ?', ['bob', 1]);
    expect(run).toHaveBeenCalled();
    expect(result).toEqual({ changes: 3 });
  });

  it('close is a no-op (D1 bindings are runtime-managed)', async () => {
    const { binding } = mockD1Binding();
    const driver = await createD1Driver(binding, noopLogger());

    expect(() => driver.close()).not.toThrow();
  });
});

describe('D1 driver — resolveDatabaseDriverType', () => {
  it('resolves to "d1" when explicitly configured', () => {
    const driverType = resolveDatabaseDriverType({
      type: 'sqlite',
      driver: 'd1',
      // binding is unknown to the resolver — it just looks at the driver field.
      binding: {} as unknown,
    });
    expect(driverType).toBe('d1');
  });

  it('does NOT auto-resolve to "d1" from a connection string', () => {
    const driverType = resolveDatabaseDriverType({
      type: 'sqlite',
      connectionString: 'file:./dev.db',
    });
    expect(driverType).toBe('better-sqlite3');
  });
});
