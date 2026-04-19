/**
 * Re-exports the Action Registry from `@invect/actions`. Kept here so
 * existing `src/actions/action-registry` imports inside `@invect/core`
 * (including the `core/` actions that call `actionToNodeDefinition`)
 * continue to resolve.
 */

export {
  ActionRegistry,
  getGlobalActionRegistry,
  initializeGlobalActionRegistry,
  setGlobalActionRegistry,
  resetGlobalActionRegistry,
  actionToNodeDefinition,
} from '@invect/actions/registry';
