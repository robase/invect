import type { z } from 'zod/v4';
import type { ActionDefinition, ActionOutputDef, ParamField } from './action';
import type { MapperOptions, NodeOptions, SdkFlowNode } from './sdk-node';

/**
 * Resolve a `THandles` tuple to its declared `id` string union.
 * Defaults to `'output'` when no outputs are declared (matches single-output
 * runtime behaviour where the action returns under the `output` handle).
 */
export type HandleIdsOf<H extends readonly ActionOutputDef[]> = H extends readonly []
  ? 'output'
  : H extends readonly ActionOutputDef<infer Id>[]
    ? Id
    : 'output';

/**
 * Result of calling a defined action as an SDK helper.
 *
 * `defineAction()` returns a value that is simultaneously:
 *   - the `ActionDefinition` object (all fields accessible — `id`, `params.schema`, etc.)
 *   - a function callable in two forms:
 *       - `helper(params, options?)` — named-record `defineFlow` form;
 *         `defineFlow` injects the referenceId from the object key.
 *       - `helper(referenceId, params, options?)` — legacy positional form
 *         used by the array `defineFlow` form, the emitter, and direct
 *         action-callable imports.
 *
 * Authoring code invokes the helper; the runtime reads the definition fields.
 *
 * The helper accepts `TParamsIn` (Zod **input** shape — defaults stay
 * optional) and produces an `SdkFlowNode<R, string, HandleIdsOf<H>>` where
 * `R` is the caller's referenceId literal (or `''` for the named-form path)
 * and `H` is the declared output handles. Edge-narrowing reads the latter
 * via the phantom symbol on `SdkFlowNode`.
 */
export interface ActionHelper<
  TParamsIn,
  TParamsOut,
  THandles extends readonly ActionOutputDef[],
> extends ActionDefinition<TParamsIn, TParamsOut, THandles> {
  // Named-record form (preferred): defineFlow assigns referenceId from the key.
  (params: TParamsIn, options?: NodeOptions): SdkFlowNode<string, string, HandleIdsOf<THandles>>;
  // Positional form (legacy): explicit referenceId.
  <R extends string = string>(
    referenceId: R,
    params: TParamsIn,
    options?: NodeOptions,
  ): SdkFlowNode<R, string, HandleIdsOf<THandles>>;
}

/**
 * Shape passed to `defineAction()`. Schema-as-generic lets us infer Zod's
 * input + output sides separately; outputs use the `const H` modifier so
 * the literal handle ids propagate without `as const` at the call site.
 */
type DefineActionInput<S extends z.ZodTypeAny, H extends readonly ActionOutputDef[]> = Omit<
  ActionDefinition<z.input<S>, z.output<S>, H>,
  'params' | 'outputs'
> & {
  params: {
    schema: S;
    fields: ParamField[];
  };
  outputs?: H;
};

/**
 * Define an action with full TypeScript inference on `params` and `execute`.
 *
 * Three generics are inferred from `definition`:
 *   - `S` is the Zod schema type (`z.ZodTypeAny`); `z.input<S>` is the
 *     helper's caller-facing param shape, `z.output<S>` is the runtime
 *     `execute()` param shape (defaults filled in).
 *   - `H` is the `outputs` tuple, captured with the `const` modifier so
 *     declared handle ids propagate as literal types.
 *
 * The returned value doubles as an SDK helper:
 *   ```ts
 *   export const sendMessage = defineAction({
 *     id: 'gmail.send_message',
 *     params: { schema: z.object({ to: z.string(), body: z.string() }), fields: [...] },
 *     execute: async (params, ctx) => { ... },
 *   });
 *
 *   // In a flow file:
 *   sendMessage('notify', { to: 'x@y.z', body: 'hi' })
 *   // → { referenceId: 'notify', type: 'gmail.send_message', params: { ... } }
 *   ```
 *
 * Built-in and user-defined actions use identical mechanics — no codegen step.
 */
export function defineAction<
  S extends z.ZodTypeAny,
  const H extends readonly ActionOutputDef[] = readonly [],
>(definition: DefineActionInput<S, H>): ActionHelper<z.input<S>, z.output<S>, H> {
  // Discriminates the two call forms by the first argument:
  //   helper(referenceId: string, params, options?) — positional form
  //   helper(params: object,             options?) — named-record form
  const helper = ((arg0: unknown, arg1?: unknown, arg2?: unknown): SdkFlowNode => {
    let referenceId: string;
    let params: Record<string, unknown>;
    let options: NodeOptions | undefined;
    if (typeof arg0 === 'string') {
      referenceId = arg0;
      params = (arg1 ?? {}) as Record<string, unknown>;
      options = arg2 as NodeOptions | undefined;
    } else {
      // Named-record form — defineFlow will overwrite referenceId from the
      // object key. Default to '' so any leak into the runtime fails loudly
      // at the validateStructure step.
      referenceId = '';
      params = (arg0 ?? {}) as Record<string, unknown>;
      options = arg1 as NodeOptions | undefined;
    }
    const node: SdkFlowNode = {
      referenceId,
      type: definition.id,
      params,
    };
    if (options?.label !== undefined) {
      node.label = options.label;
    }
    if (options?.position !== undefined) {
      node.position = options.position;
    }
    if (options?.mapper !== undefined) {
      node.mapper = normalizeMapperOptions(options.mapper);
    }
    if (options?.id !== undefined) {
      node.id = options.id;
    }
    return node;
  }) as ActionHelper<z.input<S>, z.output<S>, H>;

  // Copy all ActionDefinition fields onto the function so consumers that read
  // `action.id`, `action.params`, etc. continue to work unchanged.
  //
  // `name` and `length` are non-writable own properties on every function, so
  // they need `defineProperty` rather than plain assignment. Every other field
  // can be assigned directly.
  for (const [key, value] of Object.entries(definition)) {
    if (key === 'name' || key === 'length') {
      Object.defineProperty(helper, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      (helper as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return helper;
}

/**
 * Expand a `MapperOptions` shorthand into the full `MapperConfig` shape the
 * runtime consumes. Callers that already have a fully-formed `MapperConfig`
 * pass it through untouched.
 */
function normalizeMapperOptions(opts: MapperOptions): Record<string, unknown> {
  return {
    enabled: opts.enabled ?? true,
    expression: opts.expression,
    mode: opts.mode ?? 'auto',
    outputMode: opts.outputMode ?? 'array',
    ...(opts.keyField !== undefined ? { keyField: opts.keyField } : {}),
    concurrency: opts.concurrency ?? 1,
    onEmpty: opts.onEmpty ?? 'skip',
  };
}
