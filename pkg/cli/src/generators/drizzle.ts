/**
 * Drizzle Schema Generator
 *
 * Generates Drizzle ORM schema files from the merged abstract schema
 * (core + plugins). Produces dialect-specific TypeScript source code.
 *
 * This is the primary generator — Invect uses Drizzle exclusively.
 * The pattern generates dialect-specific Drizzle schema files from an abstract
 *   1. getAuthTables() → mergeSchemas() — merge core + plugin schemas
 *   2. Map abstract fields → dialect-specific Drizzle column code
 *   3. Return { code, fileName }
 *
 * Generates a single `invect.schema.ts` file for the user's selected dialect.
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

  const fileName = file || './db/invect.schema.ts';

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
 * Generate a single Drizzle schema file for the given dialect.
 *
 * This is the main entry point used by `npx invect-cli generate`.
 * Returns a single result for the specified dialect as `invect.schema.ts`.
 */
export async function generateAllDrizzleSchemas(options: {
  plugins: Array<{ id: string; schema?: Record<string, unknown>; [key: string]: unknown }>;
  outputDir?: string;
  dialect: 'sqlite' | 'postgresql' | 'mysql';
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

  const dir = options.outputDir || './db';

  const generators: Record<string, (schema: typeof mergedSchema) => string> = {
    sqlite: generateSqliteSchema,
    postgresql: generatePostgresSchema,
    mysql: generateMysqlSchema,
  };

  const generate = generators[options.dialect];
  if (!generate) {
    throw new Error(
      `Unsupported dialect "${options.dialect}". Expected one of: sqlite, postgresql, mysql`,
    );
  }

  const fileName = `${dir}/invect.schema.ts`;
  const code = generate(mergedSchema);
  const exists = existsSync(fileName);

  const results: SchemaGeneratorResult[] = [];

  if (exists) {
    const existing = readFileSync(fileName, 'utf-8');
    if (existing === code) {
      results.push({ code: undefined, fileName });
    } else {
      results.push({ code, fileName, overwrite: true });
    }
  } else {
    results.push({ code, fileName });
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
 * This approach appends Invect tables into the user's existing schema file, instead of creating separate files,
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
