import type { PrimitiveEdge, NodeContext } from './types';
import { edgeSource, edgeTarget } from './types';

export function buildNodeContext(
  nodeRef: string,
  edges: PrimitiveEdge[],
  completedOutputs: Record<string, unknown>,
): NodeContext {
  const directParents = edges.filter((e) => edgeTarget(e) === nodeRef).map((e) => edgeSource(e));

  const ctx: Record<string, unknown> = {};

  for (const parentRef of directParents) {
    if (Object.prototype.hasOwnProperty.call(completedOutputs, parentRef)) {
      ctx[parentRef] = completedOutputs[parentRef];
    }
  }

  ctx.previous_nodes = { ...completedOutputs };

  return ctx as NodeContext;
}
