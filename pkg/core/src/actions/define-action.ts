/**
 * defineAction helper
 *
 * A simple identity function that gives full type inference when
 * authoring action files.  Usage:
 *
 * ```ts
 * import { defineAction } from "src/actions/define-action";
 * import { z } from "zod/v4";
 *
 * export default defineAction({
 *   id: "gmail.list_messages",
 *   name: "List Emails",
 *   // …rest of ActionDefinition
 * });
 * ```
 */

import type { ActionDefinition } from './types';

/**
 * Define an action with full TypeScript inference on `params` and `execute`.
 *
 * The generic `TParams` is inferred from `definition.params.schema` so
 * the `execute` callback receives fully-typed params automatically.
 */
export function defineAction<TParams>(
  definition: ActionDefinition<TParams>,
): ActionDefinition<TParams> {
  return definition;
}
