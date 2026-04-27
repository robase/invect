/**
 * Unified database driver abstraction.
 *
 * Every dialect has at least one driver implementation. Consumers use
 * `DatabaseDriver` for raw SQL operations and never touch Drizzle's `$client`.
 */

// ---------------------------------------------------------------------------
// Driver type enum
// ---------------------------------------------------------------------------

/**
 * All supported driver implementations across every dialect.
 */
export type DatabaseDriverType =
  // PostgreSQL
  | 'postgres' // postgres.js (default)
  | 'pg' // node-postgres (Pool)
  | 'neon-serverless' // @neondatabase/serverless
  // SQLite
  | 'better-sqlite3' // native C++ (default)
  | 'libsql' // @libsql/client (WASM / Turso)
  | 'd1' // Cloudflare D1 binding (Workers runtime)
  // MySQL
  | 'mysql2'; // mysql2 (default, only option)

// ---------------------------------------------------------------------------
// Unified driver interface
// ---------------------------------------------------------------------------

/**
 * Uniform async interface for raw SQL execution.
 *
 * All drivers implement this — callers never need to know which
 * underlying npm package is actually running the query.
 *
 * **Placeholder convention**: Callers should use the native placeholder
 * style for the *dialect* (PostgreSQL → `$1, $2`, SQLite/MySQL → `?`).
 * Each driver already expects its dialect's style.
 */
export interface DatabaseDriver {
  /** Which driver implementation backs this instance. */
  readonly type: DatabaseDriverType;

  /** Execute a query and return all result rows. */
  queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Execute a mutation (INSERT / UPDATE / DELETE).
   * Returns the number of affected rows.
   */
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;

  /** Close the underlying connection / pool (best-effort). */
  close(): Promise<void> | void;
}
