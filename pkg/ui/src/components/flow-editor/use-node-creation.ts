import { useCallback } from 'react';
import { useReactFlow, type Node } from '@xyflow/react';
import { useNodeRegistry } from '~/contexts/NodeRegistryContext';
import { useFlowEditorStore } from './flow-editor.store';
import { generateUniqueDisplayName, generateUniqueReferenceId } from '~/utils/nodeReferenceUtils';
import {
  findVisiblePlacementPosition,
  NODE_HEIGHT,
  NODE_WIDTH,
  PLACEMENT_OFFSET,
} from './node-placement';

/**
 * Encapsulates the logic for creating new nodes from the sidebar palette.
 * Handles: maxInstances enforcement, default param resolution, unique name
 * generation, and viewport-aware placement.
 */
export function useNodeCreation() {
  const { getNodeDefinition } = useNodeRegistry();
  const addNodeToStore = useFlowEditorStore((s) => s.addNode);
  const reactFlowInstance = useReactFlow();

  const createNewNode = useCallback(
    (type: string) => {
      const definition = getNodeDefinition(type);

      // Enforce maxInstances
      if (definition?.maxInstances !== null && definition?.maxInstances !== undefined) {
        const currentNodes = useFlowEditorStore.getState().nodes;
        const existingCount = currentNodes.filter(
          (n) => (n.data as Record<string, unknown>)?.type === type,
        ).length;
        if (existingCount >= definition.maxInstances) {
          return;
        }
      }

      const id = `${type}-${Date.now()}`;

      const fieldDefaults = (definition?.paramFields || []).reduce<Record<string, unknown>>(
        (acc, field) => {
          if (field.defaultValue !== undefined) {
            acc[field.name] = field.defaultValue;
          }
          return acc;
        },
        {},
      );

      const defaultParams = {
        ...definition?.defaultParams,
        ...fieldDefaults,
      };

      const baseDisplayName = definition?.label || type;
      const currentNodes = useFlowEditorStore.getState().nodes;
      const displayName = generateUniqueDisplayName(baseDisplayName, currentNodes);
      const referenceId = generateUniqueReferenceId(displayName, currentNodes);

      // Determine starting position
      let startX: number;
      let startY: number;
      if (currentNodes.length === 0) {
        const viewportCenter = reactFlowInstance.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        startX = Math.round(viewportCenter.x - NODE_WIDTH / 2);
        startY = Math.round(viewportCenter.y - NODE_HEIGHT / 2);
      } else {
        const lastNode = currentNodes[currentNodes.length - 1];
        startX = lastNode.position.x + PLACEMENT_OFFSET;
        startY = lastNode.position.y + PLACEMENT_OFFSET;
      }

      const position = findVisiblePlacementPosition(startX, startY, currentNodes);

      const newNode: Node = {
        id,
        type,
        position,
        data: {
          display_name: displayName,
          reference_id: referenceId,
          type,
          params: defaultParams,
        },
      };

      addNodeToStore(newNode);
    },
    [getNodeDefinition, addNodeToStore, reactFlowInstance],
  );

  return createNewNode;
}
