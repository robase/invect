import type { ActionDefinition } from './action';
import type { MapperOptions, NodeOptions, SdkFlowNode } from './sdk-node';

/**
 * Result of calling a defined action as an SDK helper.
 *
 * `defineAction()` returns a value that is simultaneously:
 *   - the `ActionDefinition` object (all fields accessible — `id`, `params.schema`, etc.)
 *   - a function `(ref, params, options?) => SdkFlowNode`
 *
 * Authoring code invokes the helper; the runtime reads the definition fields.
 */
export interface ActionHelper<TParams> extends ActionDefinition<TParams> {
  (referenceId: string, params: TParams, options?: NodeOptions): SdkFlowNode;
}

/**
 * Define an action with full TypeScript inference on `params` and `execute`.
 *
 * The generic `TParams` is inferred from `definition.params.schema` so the
 * `execute` callback receives fully-typed params automatically.
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
export function defineAction<TParams>(
  definition: ActionDefinition<TParams>,
): ActionHelper<TParams> {
  const helper = ((referenceId: string, params: TParams, options?: NodeOptions): SdkFlowNode => {
    const node: SdkFlowNode = {
      referenceId,
      type: definition.id,
      params: params as Record<string, unknown>,
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
  }) as ActionHelper<TParams>;

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
