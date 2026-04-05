import { NODE_COMPONENTS, getNodeComponent } from './nodeRegistry';
import { withNodeContext } from './withNodeContext';

/**
 * Create context-wrapped node components for all known node types.
 * Returns the base mapping; for dynamic action-based types that aren't
 * in NODE_COMPONENTS, use `getContextAwareComponent()` at lookup time.
 */
// eslint-disable-next-line typescript/no-explicit-any -- React node components require generic any props
export function createContextAwareNodes(): Record<string, React.ComponentType<any>> {
  return Object.entries(NODE_COMPONENTS).reduce(
    (acc, [nodeType, Component]) => {
      acc[nodeType] = withNodeContext(Component);
      return acc;
    },
    // eslint-disable-next-line typescript/no-explicit-any -- React node components require generic any props
    {} as Record<string, React.ComponentType<any>>,
  );
}

/**
 * Build a context-aware node type mapping that includes both static types
 * and dynamically registered action-based types.
 */
function createContextAwareNodesFromDefinitions(
  nodeTypes: string[],
  // eslint-disable-next-line typescript/no-explicit-any -- React node components require generic any props
): Record<string, React.ComponentType<any>> {
  const base = createContextAwareNodes();
  for (const type of nodeTypes) {
    if (!(type in base)) {
      base[type] = withNodeContext(getNodeComponent(type));
    }
  }
  return base;
}
