/**
 * Node I/O Types
 *
 * Generic types for node inputs and outputs.
 * These are NOT parameterised by node type — every node (whether a legacy
 * executor or a provider-action) uses the same shapes. This keeps the type
 * system scalable as hundreds of new actions are added.
 *
 * IMPORTANT: This file must NOT import from src/nodes/* to avoid pulling
 * Node.js runtime code into the frontend bundle via @invect/core/types.
 */

import { z } from 'zod/v4';

// =============================================================================
// COMMON NODE INPUT MAPPING TYPES
// =============================================================================

export const NodeInputMappingSchema = z.record(z.string(), z.string());

export type InputMappingConfig = Record<string, string>;

/**
 * Node incoming data is a simple object keyed by upstream node slug.
 * Values are the direct output values from upstream nodes (JSON-parsed if valid).
 *
 * Example: { "fetch_user": { "id": 123, "name": "Alice" }, "get_config": "production" }
 */
export type NodeIncomingDataObject = Record<string, unknown>;

/**
 * Generic input data passed to a node executor's `execute()` method.
 * Always a flat key→value record (slug-keyed incoming data from upstream nodes).
 */
export type NodeInputData = Record<string, unknown>;

// =============================================================================
// OUTPUT TYPES
// =============================================================================

/**
 * A single output variable produced by a node.
 *
 * The `type` discriminator categorises the runtime `value`:
 *   - `'string'`  → value is a `string`, or a primitive (`number | boolean | null | undefined`)
 *   - `'object'`  → value is a non-null `object` (plain object or array)
 *
 * In practice every action returns one of:
 *   • a plain string (JQ, model, template_string, output)
 *   • a JSON-serializable object (http.request, gmail.*, trigger.*, sql_query)
 *   • `undefined` (batch-pending sentinel — only `core.model`)
 *
 * No action returns raw numbers, booleans, `null`, Buffers, Dates, or class instances.
 */
export type OutputVariable = {
  value: unknown;
  type: 'string' | 'object';
};

/**
 * Record of named output variables.
 */
export type OutputVariables = Record<string, OutputVariable>;

/**
 * Structured output envelope produced by every node.
 */
export interface StructuredOutput {
  /** Named outputs produced by node execution (e.g. `output`, `true_output`). */
  variables: OutputVariables;
  /** Optional metadata about the execution (model, timing, etc.). */
  metadata?: Record<string, unknown>;
}

/**
 * The generic node output shape stored in execution traces and passed
 * downstream.  `nodeType` is the action/executor ID string (e.g.
 * `"core.model"`, `"AGENT"`).
 */
export interface NodeOutput {
  nodeType: string;
  data: StructuredOutput;
}

/**
 * Union kept as an alias for backwards compatibility — it is simply
 * `NodeOutput` now that output types are no longer per-node-type.
 */
export type NodeOutputs = NodeOutput;
