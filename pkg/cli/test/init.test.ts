/**
 * Init Command Tests
 *
 * Tests the utility/generator functions used by `npx invect-cli init`:
 * - generateConfigFile()       — creates invect.config.ts content
 * - getInstallCommand()        — builds install commands for each PM
 * - generateDrizzleConfigFile()— creates drizzle.config.ts content
 * - parseDrizzleConfig()       — parses schema/dialect from drizzle config
 * - FRAMEWORKS / DATABASES / SCHEMA_TOOLS constants
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  generateConfigFile,
  getInstallCommand,
  generateDrizzleConfigFile,
  parseDrizzleConfig,
  FRAMEWORKS,
  DATABASES,
  SCHEMA_TOOLS,
  type Framework,
  type Database,
} from 'src/commands/init';

// =============================================================================
// Constants validation
// =============================================================================

describe('FRAMEWORKS constant', () => {
  it('should include Express, NestJS, Next.js, and Other', () => {
    const ids = FRAMEWORKS.map((f) => f.id);
    expect(ids).toContain('express');
    expect(ids).toContain('nestjs');
    expect(ids).toContain('nextjs');
    expect(ids).toContain('other');
  });

  it('should have adapter packages for all except Other', () => {
    for (const fw of FRAMEWORKS) {
      if (fw.id === 'other') {
        expect(fw.adapterPackage).toBeNull();
      } else {
        expect(fw.adapterPackage).toBeTruthy();
        expect(fw.adapterPackage).toContain('@invect/');
      }
    }
  });

  it('should have dependency packages for detection (except Other)', () => {
    for (const fw of FRAMEWORKS) {
      if (fw.id !== 'other') {
        expect(fw.dependency).toBeTruthy();
      }
    }
  });
});

describe('DATABASES constant', () => {
  it('should include SQLite, PostgreSQL, and MySQL variants', () => {
    const ids = new Set(DATABASES.map((d) => d.id));
    expect(ids).toContain('sqlite');
    expect(ids).toContain('postgresql');
    expect(ids).toContain('mysql');
  });

  it('should have multiple PostgreSQL driver options', () => {
    const pgDrivers = DATABASES.filter((d) => d.id === 'postgresql');
    expect(pgDrivers.length).toBeGreaterThanOrEqual(3);
    const drivers = pgDrivers.map((d) => d.driver);
    expect(drivers).toContain('postgres');
    expect(drivers).toContain('pg');
    expect(drivers).toContain('neon-serverless');
  });

  it('should have multiple SQLite driver options', () => {
    const sqliteDrivers = DATABASES.filter((d) => d.id === 'sqlite');
    expect(sqliteDrivers.length).toBeGreaterThanOrEqual(2);
    const drivers = sqliteDrivers.map((d) => d.driver);
    expect(drivers).toContain('better-sqlite3');
    expect(drivers).toContain('libsql');
  });

  it('should have dependency packages for all databases', () => {
    for (const db of DATABASES) {
      expect(db.dependency).toBeTruthy();
    }
  });

  it('should detect @vercel/postgres as alternative for Neon', () => {
    const neon = DATABASES.find((d) => d.driver === 'neon-serverless');
    expect(neon).toBeDefined();
    expect(neon!.alsoDetect).toContain('@vercel/postgres');
  });
});

describe('SCHEMA_TOOLS constant', () => {
  it('should include Drizzle, Prisma, and Raw SQL', () => {
    const ids = SCHEMA_TOOLS.map((s) => s.id);
    expect(ids).toContain('drizzle');
    expect(ids).toContain('prisma');
    expect(ids).toContain('sql');
  });

  it('should have descriptions for all tools', () => {
    for (const tool of SCHEMA_TOOLS) {
      expect(tool.description).toBeTruthy();
    }
  });
});

// =============================================================================
// generateConfigFile()
// =============================================================================

describe('generateConfigFile()', () => {
  const expressFramework = FRAMEWORKS.find((f) => f.id === 'express')!;
  const nestjsFramework = FRAMEWORKS.find((f) => f.id === 'nestjs')!;
  const nextjsFramework = FRAMEWORKS.find((f) => f.id === 'nextjs')!;
  const otherFramework = FRAMEWORKS.find((f) => f.id === 'other')!;
  const sqliteDb = DATABASES.find((d) => d.driver === 'better-sqlite3')!;
  const postgresDb = DATABASES.find((d) => d.driver === 'postgres')!;
  const pgDb = DATABASES.find((d) => d.driver === 'pg')!;
  const neonDb = DATABASES.find((d) => d.driver === 'neon-serverless')!;
  const libsqlDb = DATABASES.find((d) => d.driver === 'libsql')!;
  const mysqlDb = DATABASES.find((d) => d.driver === 'mysql2')!;

  it('should generate SQLite config with file path', () => {
    const config = generateConfigFile(expressFramework, sqliteDb);
    expect(config).toContain("type: 'sqlite'");
    expect(config).toContain("connectionString: 'file:./dev.db'");
    expect(config).toContain("import { defineConfig } from '@invect/core'");
  });

  it('should generate PostgreSQL config with connection string', () => {
    const config = generateConfigFile(expressFramework, postgresDb);
    expect(config).toContain("type: 'postgresql'");
    expect(config).toContain('process.env.DATABASE_URL');
    expect(config).toContain('postgresql://localhost:5432/invect');
  });

  it('should generate MySQL config with connection string', () => {
    const config = generateConfigFile(expressFramework, mysqlDb);
    expect(config).toContain("type: 'mysql'");
    expect(config).toContain('process.env.DATABASE_URL');
    expect(config).toContain('mysql://root@localhost:3306/invect');
  });

  it('should include adapter package import comment for Express', () => {
    const config = generateConfigFile(expressFramework, sqliteDb);
    expect(config).toContain('@invect/express');
  });

  it('should include adapter package import comment for NestJS', () => {
    const config = generateConfigFile(nestjsFramework, sqliteDb);
    expect(config).toContain('@invect/nestjs');
  });

  it('should include adapter package import comment for Next.js', () => {
    const config = generateConfigFile(nextjsFramework, sqliteDb);
    expect(config).toContain('@invect/nextjs');
  });

  it('should not include adapter import for "Other" framework', () => {
    const config = generateConfigFile(otherFramework, sqliteDb);
    expect(config).not.toContain('@invect/express');
    expect(config).not.toContain('@invect/nestjs');
    expect(config).not.toContain('@invect/nextjs');
  });

  it('should include driver field for non-default drivers (libsql)', () => {
    const config = generateConfigFile(expressFramework, libsqlDb);
    expect(config).toContain("driver: 'libsql'");
  });

  it('should include driver field for non-default drivers (pg)', () => {
    const config = generateConfigFile(expressFramework, pgDb);
    expect(config).toContain("driver: 'pg'");
  });

  it('should include driver field for non-default drivers (neon)', () => {
    const config = generateConfigFile(expressFramework, neonDb);
    expect(config).toContain("driver: 'neon-serverless'");
  });

  it('should NOT include driver field for the default sqlite driver (better-sqlite3)', () => {
    const config = generateConfigFile(expressFramework, sqliteDb);
    expect(config).not.toContain('driver:');
  });

  it('should NOT include driver field for the default postgresql driver (postgres)', () => {
    const config = generateConfigFile(expressFramework, postgresDb);
    expect(config).not.toContain('driver:');
  });

  it('should NOT include driver field for the default mysql driver (mysql2)', () => {
    const config = generateConfigFile(expressFramework, mysqlDb);
    expect(config).not.toContain('driver:');
  });

  it('should include export default defineConfig', () => {
    const config = generateConfigFile(expressFramework, sqliteDb);
    expect(config).toContain('export default defineConfig');
  });

  it('should include plugins placeholder comment', () => {
    const config = generateConfigFile(expressFramework, sqliteDb);
    expect(config).toContain('plugins');
  });

  it('should include AI provider configuration comments', () => {
    const config = generateConfigFile(expressFramework, sqliteDb);
    expect(config).toContain('ANTHROPIC_API_KEY');
    expect(config).toContain('OPENAI_API_KEY');
  });

  it('should include encryption key comment', () => {
    const config = generateConfigFile(expressFramework, sqliteDb);
    expect(config).toContain('INVECT_ENCRYPTION_KEY');
  });
});

// =============================================================================
// getInstallCommand()
// =============================================================================

describe('getInstallCommand()', () => {
  // npm
  it('should generate npm install for regular deps', () => {
    const cmd = getInstallCommand('npm', ['@invect/core', '@invect/express'], false);
    expect(cmd).toBe('npm install @invect/core @invect/express');
  });

  it('should generate npm install --save-dev for dev deps', () => {
    const cmd = getInstallCommand('npm', ['@invect/cli'], true);
    expect(cmd).toBe('npm install --save-dev @invect/cli');
  });

  // pnpm
  it('should generate pnpm add for regular deps', () => {
    const cmd = getInstallCommand('pnpm', ['@invect/core'], false);
    expect(cmd).toBe('pnpm add @invect/core');
  });

  it('should generate pnpm add --save-dev for dev deps', () => {
    const cmd = getInstallCommand('pnpm', ['@invect/cli'], true);
    expect(cmd).toBe('pnpm add --save-dev @invect/cli');
  });

  // yarn
  it('should generate yarn add for regular deps', () => {
    const cmd = getInstallCommand('yarn', ['@invect/core'], false);
    expect(cmd).toBe('yarn add @invect/core');
  });

  it('should generate yarn add --dev for dev deps', () => {
    const cmd = getInstallCommand('yarn', ['@invect/cli'], true);
    expect(cmd).toBe('yarn add --dev @invect/cli');
  });

  // bun
  it('should generate bun add for regular deps', () => {
    const cmd = getInstallCommand('bun', ['@invect/core'], false);
    expect(cmd).toBe('bun add @invect/core');
  });

  it('should generate bun add --dev for dev deps', () => {
    const cmd = getInstallCommand('bun', ['@invect/cli'], true);
    expect(cmd).toBe('bun add --dev @invect/cli');
  });

  // Edge cases
  it('should handle multiple packages', () => {
    const cmd = getInstallCommand(
      'npm',
      ['@invect/core', '@invect/express', 'better-sqlite3'],
      false,
    );
    expect(cmd).toBe('npm install @invect/core @invect/express better-sqlite3');
  });

  it('should handle single package', () => {
    const cmd = getInstallCommand('npm', ['@invect/core'], false);
    expect(cmd).toBe('npm install @invect/core');
  });

  it('should collapse extra whitespace', () => {
    const cmd = getInstallCommand('npm', ['@invect/core'], false);
    expect(cmd).not.toMatch(/\s{2,}/);
  });
});

// =============================================================================
// generateDrizzleConfigFile()
// =============================================================================

describe('generateDrizzleConfigFile()', () => {
  const sqliteDb = DATABASES.find((d) => d.driver === 'better-sqlite3')!;
  const postgresDb = DATABASES.find((d) => d.driver === 'postgres')!;
  const mysqlDb = DATABASES.find((d) => d.driver === 'mysql2')!;

  it('should generate SQLite drizzle config', () => {
    const config = generateDrizzleConfigFile(sqliteDb, './db/schema.ts');
    expect(config).toContain("dialect: 'sqlite'");
    expect(config).toContain("schema: './db/schema.ts'");
    expect(config).toContain("out: './drizzle'");
    expect(config).toContain("import { defineConfig } from 'drizzle-kit'");
    expect(config).toContain('./dev.db');
  });

  it('should generate PostgreSQL drizzle config', () => {
    const config = generateDrizzleConfigFile(postgresDb, './db/schema.ts');
    expect(config).toContain("dialect: 'postgresql'");
    expect(config).toContain("schema: './db/schema.ts'");
    expect(config).toContain('postgresql://localhost:5432/invect');
  });

  it('should generate MySQL drizzle config', () => {
    const config = generateDrizzleConfigFile(mysqlDb, './db/schema.ts');
    expect(config).toContain("dialect: 'mysql'");
    expect(config).toContain("schema: './db/schema.ts'");
    expect(config).toContain('mysql://root@localhost:3306/invect');
  });

  it('should use the provided schema path', () => {
    const config = generateDrizzleConfigFile(sqliteDb, './src/database/schema.ts');
    expect(config).toContain("schema: './src/database/schema.ts'");
  });

  it('should reference DATABASE_URL env var for PostgreSQL', () => {
    const config = generateDrizzleConfigFile(postgresDb, './db/schema.ts');
    expect(config).toContain('process.env.DATABASE_URL');
  });

  it('should reference DATABASE_URL env var for MySQL', () => {
    const config = generateDrizzleConfigFile(mysqlDb, './db/schema.ts');
    expect(config).toContain('process.env.DATABASE_URL');
  });

  it('should export default defineConfig', () => {
    const config = generateDrizzleConfigFile(sqliteDb, './db/schema.ts');
    expect(config).toContain('export default defineConfig');
  });
});

// =============================================================================
// parseDrizzleConfig()
// =============================================================================

describe('parseDrizzleConfig()', () => {
  let existsSyncSpy: ReturnType<typeof vi.spyOn>;
  let readFileSyncSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    readFileSyncSpy = vi.spyOn(fs, 'readFileSync');
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('should parse schema path from single-quoted string', () => {
    readFileSyncSpy.mockReturnValue(`
      export default defineConfig({
        schema: './db/schema.ts',
        dialect: 'sqlite',
      });
    `);
    const result = parseDrizzleConfig('drizzle.config.ts');
    expect(result).not.toBeNull();
    expect(result!.schemaPath).toContain('db/schema.ts');
  });

  it('should parse schema path from double-quoted string', () => {
    readFileSyncSpy.mockReturnValue(`
      export default defineConfig({
        schema: "./src/db/schema.ts",
        dialect: "sqlite",
      });
    `);
    const result = parseDrizzleConfig('drizzle.config.ts');
    expect(result).not.toBeNull();
    expect(result!.schemaPath).toContain('src/db/schema.ts');
  });

  it('should parse sqlite dialect', () => {
    readFileSyncSpy.mockReturnValue(`
      export default defineConfig({
        schema: './db/schema.ts',
        dialect: 'sqlite',
      });
    `);
    const result = parseDrizzleConfig('drizzle.config.ts');
    expect(result!.dialect).toBe('sqlite');
  });

  it('should parse postgresql dialect', () => {
    readFileSyncSpy.mockReturnValue(`
      export default defineConfig({
        schema: './db/schema.ts',
        dialect: 'postgresql',
      });
    `);
    const result = parseDrizzleConfig('drizzle.config.ts');
    expect(result!.dialect).toBe('postgresql');
  });

  it('should parse pg as postgresql dialect', () => {
    readFileSyncSpy.mockReturnValue(`
      export default defineConfig({
        schema: './db/schema.ts',
        dialect: 'pg',
      });
    `);
    const result = parseDrizzleConfig('drizzle.config.ts');
    expect(result!.dialect).toBe('postgresql');
  });

  it('should parse postgres as postgresql dialect', () => {
    readFileSyncSpy.mockReturnValue(`
      export default defineConfig({
        schema: './db/schema.ts',
        dialect: 'postgres',
      });
    `);
    const result = parseDrizzleConfig('drizzle.config.ts');
    expect(result!.dialect).toBe('postgresql');
  });

  it('should parse mysql dialect', () => {
    readFileSyncSpy.mockReturnValue(`
      export default defineConfig({
        schema: './db/schema.ts',
        dialect: 'mysql',
      });
    `);
    const result = parseDrizzleConfig('drizzle.config.ts');
    expect(result!.dialect).toBe('mysql');
  });

  it('should add .ts extension to schema path without extension', () => {
    readFileSyncSpy.mockReturnValue(`
      export default defineConfig({
        schema: './db/schema',
        dialect: 'sqlite',
      });
    `);
    const result = parseDrizzleConfig('drizzle.config.ts');
    expect(result!.schemaPath).toContain('db/schema.ts');
  });

  it('should return null when file cannot be read', () => {
    readFileSyncSpy.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(parseDrizzleConfig('nonexistent.ts')).toBeNull();
  });

  it('should return null schema when no schema field found', () => {
    readFileSyncSpy.mockReturnValue(`
      export default defineConfig({
        dialect: 'sqlite',
      });
    `);
    const result = parseDrizzleConfig('drizzle.config.ts');
    expect(result).not.toBeNull();
    expect(result!.schemaPath).toBeNull();
  });

  it('should return null dialect when no dialect field found', () => {
    readFileSyncSpy.mockReturnValue(`
      export default defineConfig({
        schema: './db/schema.ts',
      });
    `);
    const result = parseDrizzleConfig('drizzle.config.ts');
    expect(result).not.toBeNull();
    expect(result!.dialect).toBeNull();
  });

  it('should return null dialect for unknown dialect values', () => {
    readFileSyncSpy.mockReturnValue(`
      export default defineConfig({
        schema: './db/schema.ts',
        dialect: 'cockroachdb',
      });
    `);
    const result = parseDrizzleConfig('drizzle.config.ts');
    expect(result!.dialect).toBeNull();
  });

  it('should handle config with spacing variations', () => {
    readFileSyncSpy.mockReturnValue(`
      export default defineConfig({
        schema :  './db/schema.ts'  ,
        dialect :  'sqlite'  ,
      });
    `);
    const result = parseDrizzleConfig('drizzle.config.ts');
    expect(result!.schemaPath).toContain('db/schema.ts');
    expect(result!.dialect).toBe('sqlite');
  });
});
