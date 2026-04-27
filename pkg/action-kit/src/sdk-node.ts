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
 *
 * Generics:
 * - `R` — referenceId literal (e.g. `'event'`); defaults to `string` so
 *   non-typed call sites remain compatible.
 * - `T` — action-id literal (e.g. `'core.if_else'`).
 * - `H` — declared output-handle ids as a string union (e.g.
 *   `'true_output' | 'false_output'`). Defaults to `'output'` to match
 *   single-output runtime behaviour. Carried via a phantom `unique symbol`
 *   field so it never appears in serialised JSON.
 */
declare const __outputBrand: unique symbol;

export interface SdkFlowNode<
  R extends string = string,
  T extends string = string,
  H extends string = string,
> {
  referenceId: R;
  type: T;
  params: Record<string, unknown>;
  label?: string;
  position?: { x: number; y: number };
  mapper?: Record<string, unknown>;
  id?: string;
  /**
   * Phantom — TS-only, never emitted, never read at runtime. Symbol-keyed
   * so JSON.stringify skips it automatically. Carries the declared output
   * handles for edge-narrowing in `defineFlow`.
   */
  readonly [__outputBrand]?: H;
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
