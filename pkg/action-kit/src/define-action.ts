import type { ActionDefinition } from './action';

/**
 * Define an action with full TypeScript inference on `params` and `execute`.
 *
 * The generic `TParams` is inferred from `definition.params.schema` so the
 * `execute` callback receives fully-typed params automatically.
 */
export function defineAction<TParams>(
  definition: ActionDefinition<TParams>,
): ActionDefinition<TParams> {
  return definition;
}
