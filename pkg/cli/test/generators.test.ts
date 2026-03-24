/**
 * Generator Integration Tests
 *
 * Tests the CLI generator functions from `src/generators/drizzle.ts`.
 * These exercise the full pipeline: config → merge → generate → file detection.
 *
 * Uses a temp directory for file-based tests so we can verify:
 *   - File creation (new files)
 *   - Change detection (unchanged = code: undefined)
 *   - Overwrite detection (existing but different = overwrite: true)
 *   - All three dialect files generated simultaneously
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { generateDrizzleSchema } from '../src/generators/drizzle';
import { generateAllDrizzleSchemas } from '../src/generators/drizzle';
import { generateSchema, adapters } from '../src/generators/index';

import {
  multiTenantPlugin,
  auditLogPlugin,
  ecommercePlugin,
  minimalPlugin,
} from './fixtures/example-schemas';

// =============================================================================
// Temp directory management
// =============================================================================

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'invect-cli-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// =============================================================================
// 1. generateDrizzleSchema — single dialect
// =============================================================================

describe('generateDrizzleSchema (single dialect)', () => {
  it('should generate SQLite schema for core-only', async () => {
    const result = await generateDrizzleSchema({
      plugins: [],
      dialect: 'sqlite',
      file: path.join(tmpDir, 'schema-sqlite.ts'),
    });

    expect(result.code).toBeDefined();
    expect(result.code).toContain("sqliteTable('flows'");
    expect(result.fileName).toContain('schema-sqlite.ts');
    expect(result.overwrite).toBeFalsy();
  });

  it('should generate PostgreSQL schema for core-only', async () => {
    const result = await generateDrizzleSchema({
      plugins: [],
      dialect: 'postgresql',
      file: path.join(tmpDir, 'schema-postgres.ts'),
    });

    expect(result.code).toBeDefined();
    expect(result.code).toContain("pgTable('flows'");
    expect(result.code).toContain('pgEnum(');
  });

  it('should generate MySQL schema for core-only', async () => {
    const result = await generateDrizzleSchema({
      plugins: [],
      dialect: 'mysql',
      file: path.join(tmpDir, 'schema-mysql.ts'),
    });

    expect(result.code).toBeDefined();
    expect(result.code).toContain("mysqlTable('flows'");
    expect(result.code).toContain('mysqlEnum(');
  });

  it('should throw on unsupported dialect', async () => {
    await expect(
      generateDrizzleSchema({
        plugins: [],
        dialect: 'oracle' as any,
        file: path.join(tmpDir, 'schema.ts'),
      }),
    ).rejects.toThrow(/Unsupported dialect/);
  });

  it('should return code: undefined when file exists with same content', async () => {
    const filePath = path.join(tmpDir, 'schema-sqlite.ts');

    // First generate
    const first = await generateDrizzleSchema({
      plugins: [],
      dialect: 'sqlite',
      file: filePath,
    });
    expect(first.code).toBeDefined();

    // Write it to disk
    fs.writeFileSync(filePath, first.code!, 'utf-8');

    // Second generate — should detect no change
    const second = await generateDrizzleSchema({
      plugins: [],
      dialect: 'sqlite',
      file: filePath,
    });
    expect(second.code).toBeUndefined();
  });

  it('should return overwrite: true when file exists with different content', async () => {
    const filePath = path.join(tmpDir, 'schema-sqlite.ts');

    // Write old content
    fs.writeFileSync(filePath, '// old schema\n', 'utf-8');

    // Generate new schema
    const result = await generateDrizzleSchema({
      plugins: [],
      dialect: 'sqlite',
      file: filePath,
    });

    expect(result.code).toBeDefined();
    expect(result.overwrite).toBe(true);
  });

  it('should include plugin tables in generated output', async () => {
    const result = await generateDrizzleSchema({
      plugins: [multiTenantPlugin],
      dialect: 'sqlite',
      file: path.join(tmpDir, 'schema.ts'),
    });

    expect(result.code).toContain("sqliteTable('tenants'");
    expect(result.code).toContain("sqliteTable('tenant_members'");
    expect(result.code).toContain('tenant_id'); // Foreign key from flows
  });

  it('should use default file path when file not specified', async () => {
    const result = await generateDrizzleSchema({
      plugins: [],
      dialect: 'sqlite',
    });

    expect(result.fileName).toBe('./src/database/schema-sqlite.ts');
  });

  it('should use correct default for each dialect', async () => {
    const sqlite = await generateDrizzleSchema({ plugins: [], dialect: 'sqlite' });
    const pg = await generateDrizzleSchema({ plugins: [], dialect: 'postgresql' });
    const mysql = await generateDrizzleSchema({ plugins: [], dialect: 'mysql' });

    expect(sqlite.fileName).toContain('schema-sqlite.ts');
    expect(pg.fileName).toContain('schema-postgres.ts');
    expect(mysql.fileName).toContain('schema-mysql.ts');
  });
});

// =============================================================================
// 2. generateAllDrizzleSchemas — all dialects at once
// =============================================================================

describe('generateAllDrizzleSchemas (all dialects)', () => {
  it('should generate all 3 dialect files', async () => {
    const { results, stats } = await generateAllDrizzleSchemas({
      plugins: [],
      outputDir: tmpDir,
    });

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.fileName)).toEqual([
      `${tmpDir}/schema-sqlite.ts`,
      `${tmpDir}/schema-postgres.ts`,
      `${tmpDir}/schema-mysql.ts`,
    ]);

    // All should have code (new files)
    for (const r of results) {
      expect(r.code).toBeDefined();
      expect(r.overwrite).toBeFalsy();
    }
  });

  it('should return correct stats for core-only', async () => {
    const { stats } = await generateAllDrizzleSchemas({
      plugins: [],
      outputDir: tmpDir,
    });

    expect(stats.totalTables).toBeGreaterThan(0);
    expect(stats.coreTableCount).toBe(stats.totalTables);
    expect(stats.pluginTableCount).toBe(0);
    expect(stats.pluginsWithSchema).toBe(0);
  });

  it('should return correct stats with plugins', async () => {
    const { stats } = await generateAllDrizzleSchemas({
      plugins: [ecommercePlugin, auditLogPlugin],
      outputDir: tmpDir,
    });

    expect(stats.pluginTableCount).toBe(5); // 4 ecommerce + 1 audit
    expect(stats.pluginsWithSchema).toBe(2);
    expect(stats.totalTables).toBe(stats.coreTableCount + stats.pluginTableCount);
  });

  it('should detect unchanged files across all dialects', async () => {
    // First run: generate all
    const first = await generateAllDrizzleSchemas({
      plugins: [minimalPlugin],
      outputDir: tmpDir,
    });

    // Write to disk
    for (const r of first.results) {
      if (r.code) {
        fs.writeFileSync(r.fileName, r.code, 'utf-8');
      }
    }

    // Second run: should detect no changes
    const second = await generateAllDrizzleSchemas({
      plugins: [minimalPlugin],
      outputDir: tmpDir,
    });

    for (const r of second.results) {
      expect(r.code).toBeUndefined();
    }
  });

  it('should detect changes when a plugin is added', async () => {
    // First run: core only
    const first = await generateAllDrizzleSchemas({
      plugins: [],
      outputDir: tmpDir,
    });

    // Write to disk
    for (const r of first.results) {
      if (r.code) {
        fs.writeFileSync(r.fileName, r.code, 'utf-8');
      }
    }

    // Second run: add a plugin
    const second = await generateAllDrizzleSchemas({
      plugins: [auditLogPlugin],
      outputDir: tmpDir,
    });

    // All should have changes (new table added)
    for (const r of second.results) {
      expect(r.code).toBeDefined();
      expect(r.overwrite).toBe(true);
    }
  });

  it('should use default output dir when not specified', async () => {
    const { results } = await generateAllDrizzleSchemas({
      plugins: [],
    });

    for (const r of results) {
      expect(r.fileName).toContain('./src/database/');
    }
  });
});

// =============================================================================
// 3. generateSchema — router API
// =============================================================================

describe('generateSchema (router)', () => {
  it('should route to drizzle adapter', async () => {
    const result = await generateSchema({
      adapter: 'drizzle',
      dialect: 'sqlite',
      plugins: [],
      file: path.join(tmpDir, 'test.ts'),
    });

    expect(result.code).toBeDefined();
    expect(result.code).toContain("sqliteTable('flows'");
  });

  it('should route to prisma adapter', async () => {
    const result = await generateSchema({
      adapter: 'prisma',
      provider: 'postgresql',
      plugins: [],
      file: path.join(tmpDir, 'schema.prisma'),
    });

    expect(result.code).toBeDefined();
    expect(result.code).toContain('model Flows');
  });

  it('should throw on unsupported adapter', async () => {
    await expect(
      generateSchema({
        adapter: 'kysely' as any,
        dialect: 'sqlite',
        plugins: [],
      }),
    ).rejects.toThrow(/Unsupported adapter/);
  });
});

// =============================================================================
// 4. Adapters registry
// =============================================================================

describe('adapters registry', () => {
  it('should have drizzle adapter', () => {
    expect(adapters.drizzle).toBeDefined();
    expect(typeof adapters.drizzle).toBe('function');
  });

  it('should have prisma adapter', () => {
    expect(adapters.prisma).toBeDefined();
    expect(typeof adapters.prisma).toBe('function');
  });

  it('should have drizzle and prisma adapters', () => {
    expect(Object.keys(adapters).sort()).toEqual(['drizzle', 'prisma']);
  });
});
