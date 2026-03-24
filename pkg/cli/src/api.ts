/**
 * Programmatic API for @invect/cli
 *
 * Mirrors better-auth's packages/cli/src/api.ts pattern.
 * Import this to use schema generators in tests or build scripts.
 *
 * @example
 * ```ts
 * import { generateSchema, generateAllDrizzleSchemas } from '@invect/cli/api';
 *
 * const result = await generateSchema({
 *   adapter: 'drizzle',
 *   dialect: 'sqlite',
 *   plugins: myPlugins,
 * });
 * ```
 */

export { adapters, generateSchema, generateDrizzleSchema, generateAllDrizzleSchemas, generateAppendSchema, generatePrismaSchema } from './generators/index.js';
export type { PrismaSchemaGeneratorOptions } from './generators/prisma.js';
export type { SchemaGenerator, SchemaGeneratorResult, SchemaGeneratorOptions } from './generators/types.js';
