/**
 * Drizzle Schema Generator
 *
 * Generates Drizzle ORM schema files from the merged abstract schema
 * (core + plugins). Produces dialect-specific TypeScript source code.
 *
 * This is the primary generator — Invect uses Drizzle exclusively.
 * The pattern mirrors better-auth's generators/drizzle.ts:
 *   1. getAuthTables() → mergeSchemas() — merge core + plugin schemas
 *   2. Map abstract fields → dialect-specific Drizzle column code
 *   3. Return { code, fileName }
 *
 * Unlike better-auth which generates 1 file, Invect generates 3
 * (sqlite, postgres, mysql) because Invect supports all three dialects
 * simultaneously.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { SchemaGenerator, SchemaGeneratorResult } from './types.js';

export const generateDrizzleSchema: SchemaGenerator = async ({
  plugins,
  file,
  dialect,
}) => {
  // Dynamically import @invect/core to avoid bundling it
  const {
    mergeSchemas,
    generateSqliteSchema,
    generatePostgresSchema,
    generateMysqlSchema,
  } = await import('@invect/core');

  // Merge core + plugin schemas
  const mergedSchema = mergeSchemas(plugins as any);

  // Select the right generator for the dialect
  const generators: Record<string, (schema: typeof mergedSchema) => string> = {
    sqlite: generateSqliteSchema,
    postgresql: generatePostgresSchema,
    mysql: generateMysqlSchema,
  };

  const generator = generators[dialect];
  if (!generator) {
    throw new Error(
      `Unsupported dialect "${dialect}". Expected one of: sqlite, postgresql, mysql`,
    );
  }

  const code = generator(mergedSchema);

  // Default file paths per dialect
  const defaultFiles: Record<string, string> = {
    sqlite: './src/database/schema-sqlite.ts',
    postgresql: './src/database/schema-postgres.ts',
    mysql: './src/database/schema-mysql.ts',
  };

  const fileName = file || defaultFiles[dialect]!;

  // Check if the file already exists with the same content
  if (existsSync(fileName)) {
    const existing = readFileSync(fileName, 'utf-8');
    if (existing === code) {
      return { code: undefined, fileName }; // No changes
    }
  }

  return { code, fileName, overwrite: existsSync(fileName) };
};

/**
 * Generate all three Drizzle schema files at once.
 *
 * This is the main entry point used by `npx invect-cli generate`.
 * Returns results for all three dialects.
 */
export async function generateAllDrizzleSchemas(options: {
  plugins: SchemaGenerator extends (opts: infer O) => any ? O['plugins'] : never;
  outputDir?: string;
}): Promise<{
  results: SchemaGeneratorResult[];
  mergedSchema: any;
  stats: {
    totalTables: number;
    coreTableCount: number;
    pluginTableCount: number;
    pluginsWithSchema: number;
  };
}> {
  const {
    mergeSchemas,
    CORE_SCHEMA,
  } = await import('@invect/core');

  const mergedSchema = mergeSchemas(options.plugins as any);
  const coreTableCount = Object.keys(CORE_SCHEMA).length;
  const pluginsWithSchema = (options.plugins as any[]).filter(
    (p: any) => p.schema,
  ).length;

  const {
    generateSqliteSchema,
    generatePostgresSchema,
    generateMysqlSchema,
  } = await import('@invect/core');

  const dir = options.outputDir || './src/database';

  const dialects: Array<{
    dialect: 'sqlite' | 'postgresql' | 'mysql';
    fileName: string;
    generate: (schema: typeof mergedSchema) => string;
  }> = [
    { dialect: 'sqlite', fileName: `${dir}/schema-sqlite.ts`, generate: generateSqliteSchema },
    { dialect: 'postgresql', fileName: `${dir}/schema-postgres.ts`, generate: generatePostgresSchema },
    { dialect: 'mysql', fileName: `${dir}/schema-mysql.ts`, generate: generateMysqlSchema },
  ];

  const results: SchemaGeneratorResult[] = [];

  for (const { fileName, generate } of dialects) {
    const code = generate(mergedSchema);
    const exists = existsSync(fileName);

    if (exists) {
      const existing = readFileSync(fileName, 'utf-8');
      if (existing === code) {
        results.push({ code: undefined, fileName });
        continue;
      }
    }

    results.push({ code, fileName, overwrite: exists });
  }

  return {
    results,
    mergedSchema,
    stats: {
      totalTables: mergedSchema.tables.length,
      coreTableCount,
      pluginTableCount: mergedSchema.tables.length - coreTableCount,
      pluginsWithSchema,
    },
  };
}

/**
 * Generate Invect table definitions for appending to an existing schema file.
 *
 * This mirrors better-auth's approach: instead of creating separate files,
 * generate only the table + relation code and append it to the user's
 * existing Drizzle schema file.
 *
 * Returns:
 *   - result.imports: import statements that may need to be added
 *   - result.code: table definitions, relations, and type exports
 *   - stats: generation statistics
 */
export async function generateAppendSchema(options: {
  plugins: Array<{ id: string; schema?: Record<string, unknown>; [key: string]: unknown }>;
  dialect: 'sqlite' | 'postgresql' | 'mysql';
}): Promise<{
  result: { imports: string[]; code: string };
  stats: {
    totalTables: number;
    coreTableCount: number;
    pluginTableCount: number;
  };
}> {
  const {
    mergeSchemas,
    CORE_SCHEMA,
    generateSqliteSchemaAppend,
    generatePostgresSchemaAppend,
    generateMysqlSchemaAppend,
  } = await import('@invect/core');

  const mergedSchema = mergeSchemas(options.plugins as any);
  const coreTableCount = Object.keys(CORE_SCHEMA).length;

  const generators: Record<string, (schema: typeof mergedSchema) => { imports: string[]; code: string }> = {
    sqlite: generateSqliteSchemaAppend,
    postgresql: generatePostgresSchemaAppend,
    mysql: generateMysqlSchemaAppend,
  };

  const generator = generators[options.dialect];
  if (!generator) {
    throw new Error(
      `Unsupported dialect "${options.dialect}". Expected one of: sqlite, postgresql, mysql`,
    );
  }

  const result = generator(mergedSchema);

  return {
    result,
    stats: {
      totalTables: mergedSchema.tables.length,
      coreTableCount,
      pluginTableCount: mergedSchema.tables.length - coreTableCount,
    },
  };
}
