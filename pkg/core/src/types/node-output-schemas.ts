/**
 * Common Node Output Schema Utilities
 *
 * Provides Zod schema building blocks for validating node output shapes.
 * These schemas are used by legacy executors that define an `outputSchema`.
 * New actions don't need these — their output shape is validated generically.
 */

import { z, ZodType } from 'zod/v4';

// =============================================================================
// COMMON VARIABLE SCHEMAS
// =============================================================================

/** Schema for a string variable in node output */
export const stringVariableSchema = z.object({
  value: z.string(),
  type: z.literal('string'),
});

/** Schema for an object variable in node output */
export const objectVariableSchema = z.object({
  value: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]),
  type: z.literal('object'),
});

/** Schema for a variable that can be either string or object */
export const anyVariableSchema = z.union([stringVariableSchema, objectVariableSchema]);

/** Schema for the variables object (record of named outputs) */
export const variablesRecordSchema = z.record(z.string(), anyVariableSchema);

// =============================================================================
// OUTPUT SCHEMA FACTORY
// =============================================================================

/**
 * Create a node output schema with proper typing.
 *
 * @param nodeType - A string literal for the node type (informational)
 * @param variablesSchema - Zod schema for the variables object
 * @param metadataSchema - Optional Zod schema for metadata
 */
export function createOutputSchema<
  TVariables extends ZodType,
  TMetadata extends ZodType = z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>,
>(nodeType: string, variablesSchema: TVariables, metadataSchema?: TMetadata) {
  return z.object({
    nodeType: z.literal(nodeType),
    data: z.object({
      variables: variablesSchema,
      metadata: metadataSchema ?? z.record(z.string(), z.unknown()).optional(),
    }),
  });
}

/** Infer the TypeScript type from an output schema */
export type InferOutputType<T extends ZodType> = z.infer<T>;

// =============================================================================
// DEFAULT OUTPUT SCHEMA
// =============================================================================

/**
 * Default output schema for nodes that don't define their own.
 * Uses a flexible structure that accepts any valid node output.
 */
export const defaultOutputSchema = z.object({
  nodeType: z.string(),
  data: z.object({
    variables: variablesRecordSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type DefaultNodeOutput = z.infer<typeof defaultOutputSchema>;
