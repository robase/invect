/**
 * SDK flow-node shape produced by `defineAction()` helpers.
 *
 * Canonical unified shape = primitives runtime shape (`referenceId`, `type`,
 * `params`) + optional DB/UI metadata (`id`, `label`, `position`, `mapper`).
 *
 * The runtime + executor read `referenceId`, `type`, `params`, `mapper`.
 * The DB persistence layer reads `id`, `label`, `position` (assigned either
 * via `NodeOptions` on the helper call or by the save pipeline).
 *
 * This shape is deliberately permissive (`[key: string]: unknown`) so it
 * remains structurally compatible with `FlowNodeDefinitions` from the DB
 * schema — lets authors pass helper output directly to `defineFlow` without
 * manual conversion.
 */
export interface SdkFlowNode {
  referenceId: string;
  type: string;
  params: Record<string, unknown>;
  label?: string;
  position?: { x: number; y: number };
  mapper?: Record<string, unknown>;
  id?: string;
  [key: string]: unknown;
}

/**
 * Shorthand options accepted by action helpers. Every helper call can
 * optionally include a label, a canvas position, a mapper config, and an
 * explicit node id (the merge pipeline preserves original DB ids when
 * possible, so callers rarely need to set this).
 */
export interface NodeOptions {
  label?: string;
  position?: { x: number; y: number };
  mapper?: MapperOptions;
  id?: string;
}

/**
 * Mapper shorthand — accepts only the fields the author needs to set.
 * `defineAction`'s helper fills in defaults (mode=auto, outputMode=array,
 * concurrency=1, onEmpty=skip) when normalizing to the full `MapperConfig`
 * the runtime consumes.
 */
export interface MapperOptions {
  expression: string;
  enabled?: boolean;
  mode?: 'auto' | 'iterate' | 'reshape';
  outputMode?: 'array' | 'object' | 'first' | 'last' | 'concat';
  keyField?: string;
  concurrency?: number;
  onEmpty?: 'error' | 'skip';
}
