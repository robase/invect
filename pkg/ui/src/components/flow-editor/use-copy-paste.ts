import { useEffect, useCallback, useRef } from 'react';
import type { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useFlowEditorStore } from './flow-editor.store';
import { useNodeRegistry } from '~/contexts/NodeRegistryContext';
import { generateUniqueDisplayName, generateUniqueReferenceId } from '~/utils/nodeReferenceUtils';
import type { ClipboardData, ClipboardNode, ClipboardEdge } from './use-copy-paste.types';
import { serializeToSDK } from './serialize-to-sdk';
import { parseSDKText, type ParsedSDK } from '@invect/core/sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseCopyPasteOptions {
  flowId: string;
  reactFlowInstance: ReactFlowInstance | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep clone JSON-safe data */
function cloneData<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

/** Check if a keyboard event target is in an editable context (inputs, modals, etc.) */
function isEditingContext(el: HTMLElement): boolean {
  if (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  ) {
    return true;
  }
  if (el.closest('.cm-editor') || el.closest('[role="dialog"]')) {
    return true;
  }
  return false;
}

/**
 * Strip credential IDs from params (used for cross-flow paste).
 * Also strips credentialId from nested addedTools params.
 */
function stripCredentials(params: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...params };
  delete cleaned.credentialId;

  if (Array.isArray(cleaned.addedTools)) {
    cleaned.addedTools = (cleaned.addedTools as Array<Record<string, unknown>>).map((tool) => {
      const toolCleaned = { ...tool };
      if (typeof toolCleaned.params === 'object' && toolCleaned.params !== null) {
        const toolParams = { ...(toolCleaned.params as Record<string, unknown>) };
        delete toolParams.credentialId;
        toolCleaned.params = toolParams;
      }
      return toolCleaned;
    });
  }

  return cleaned;
}

/**
 * Regenerate instanceIds for addedTools in agent node params.
 */
function regenToolInstanceIds(params: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(params.addedTools)) {
    return params;
  }

  return {
    ...params,
    addedTools: (params.addedTools as Array<Record<string, unknown>>).map((tool) => ({
      ...tool,
      instanceId: nanoid(),
    })),
  };
}

/**
 * Convert parseSDKText output into a ClipboardData structure that
 * materializePaste can consume. Maps FlowNodeDefinitions → ClipboardNode
 * and edge tuples → ClipboardEdge.
 */
function sdkResultToClipboard({ nodes, edges }: ParsedSDK, flowId: string): ClipboardData {
  // Compute absolute positions for each node (use parsed position or default horizontal layout)
  const positions = nodes.map((n, i) => n.position ?? { x: i * 250, y: 0 });

  // Compute bounding box origin for relative positioning
  const minX = positions.length > 0 ? Math.min(...positions.map((p) => p.x)) : 0;
  const minY = positions.length > 0 ? Math.min(...positions.map((p) => p.y)) : 0;

  const clipboardNodes: ClipboardNode[] = nodes.map((n, i) => {
    const ref = n.referenceId ?? n.id;
    const pos = positions[i];
    return {
      originalId: n.id,
      type: n.type,
      relativePosition: { x: pos.x - minX, y: pos.y - minY },
      absolutePosition: pos,
      data: {
        display_name: n.label ?? ref,
        reference_id: ref,
        params: n.params ?? {},
        ...(n.mapper !== undefined && { mapper: n.mapper }),
      },
    };
  });

  // Build referenceId → node id mapping for edge resolution
  const refToId = new Map<string, string>();
  for (const n of nodes) {
    const ref = n.referenceId ?? n.id;
    refToId.set(ref, n.id);
  }

  const clipboardEdges: ClipboardEdge[] = [];
  for (const e of edges) {
    if (Array.isArray(e)) {
      const sourceId = refToId.get(e[0]) ?? `node-${e[0]}`;
      const targetId = refToId.get(e[1]) ?? `node-${e[1]}`;
      clipboardEdges.push({
        originalId: `edge-${nanoid()}`,
        source: sourceId,
        target: targetId,
        ...(e[2] ? { sourceHandle: e[2] } : {}),
      });
    } else {
      const sourceId = refToId.get(e.from) ?? `node-${e.from}`;
      const targetId = refToId.get(e.to) ?? `node-${e.to}`;
      clipboardEdges.push({
        originalId: `edge-${nanoid()}`,
        source: sourceId,
        target: targetId,
        ...(e.handle ? { sourceHandle: e.handle } : {}),
      });
    }
  }

  return {
    sourceFlowId: flowId,
    nodes: clipboardNodes,
    edges: clipboardEdges,
    copyTime: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCopyPaste({ flowId, reactFlowInstance }: UseCopyPasteOptions) {
  const clipboardRef = useRef<ClipboardData | null>(null);
  const mousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const { getNodeDefinition } = useNodeRegistry();

  // Track mouse position over the react-flow canvas for paste anchoring
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePositionRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // -------------------------------------------------------------------------
  // Serialize selection into ClipboardData
  // -------------------------------------------------------------------------
  const serializeSelection = useCallback((): ClipboardData | null => {
    const { nodes, edges } = useFlowEditorStore.getState();
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) {
      return null;
    }

    const selectedIdSet = new Set(selectedNodes.map((n) => n.id));

    // Only capture edges where both endpoints are selected
    const internalEdges = edges.filter(
      (e) => selectedIdSet.has(e.source) && selectedIdSet.has(e.target),
    );

    // Compute bounding box origin
    const minX = Math.min(...selectedNodes.map((n) => n.position.x));
    const minY = Math.min(...selectedNodes.map((n) => n.position.y));

    const clipboardNodes: ClipboardNode[] = selectedNodes.map((node) => {
      const data = node.data as Record<string, unknown>;
      const params = (data.params as Record<string, unknown>) ?? {};

      return {
        originalId: node.id,
        type: (data.type as string) ?? node.type ?? 'unknown',
        relativePosition: {
          x: node.position.x - minX,
          y: node.position.y - minY,
        },
        absolutePosition: {
          x: node.position.x,
          y: node.position.y,
        },
        data: {
          display_name: (data.display_name as string) ?? '',
          reference_id: (data.reference_id as string) ?? '',
          params: cloneData(params),
          ...(data.mapper !== undefined && { mapper: cloneData(data.mapper) }),
          ...(data._loop !== undefined && { _loop: cloneData(data._loop) }),
        },
      };
    });

    const clipboardEdges: ClipboardEdge[] = internalEdges.map((edge) => ({
      originalId: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle !== undefined && { sourceHandle: edge.sourceHandle }),
      ...(edge.targetHandle !== undefined && { targetHandle: edge.targetHandle }),
    }));

    return {
      sourceFlowId: flowId,
      nodes: clipboardNodes,
      edges: clipboardEdges,
      copyTime: Date.now(),
    };
  }, [flowId]);

  // -------------------------------------------------------------------------
  // Materialize ClipboardData into the store
  // -------------------------------------------------------------------------
  const materializePaste = useCallback(
    (clipboard: ClipboardData, anchor: { x: number; y: number }) => {
      const { nodes: existingNodes } = useFlowEditorStore.getState();
      const isCrossFlow = clipboard.sourceFlowId !== flowId;
      const isEmptyFlow = existingNodes.length === 0;

      // Build the ID remap table
      const idMap = new Map<string, string>();
      for (const cn of clipboard.nodes) {
        idMap.set(cn.originalId, `${cn.type}-${nanoid()}`);
      }

      // Track nodes we add so dedup works across the paste batch
      const batchNodes: Array<{ data?: { display_name?: string; reference_id?: string } }> = [
        ...existingNodes,
      ];

      const skippedNodeIds = new Set<string>();
      const newNodes: Node[] = [];

      for (const cn of clipboard.nodes) {
        // maxInstances check
        const definition = getNodeDefinition(cn.type);
        if (definition?.maxInstances !== undefined) {
          const currentCount = existingNodes.filter(
            (n) => (n.data as Record<string, unknown>)?.type === cn.type,
          ).length;
          const pastedCount = newNodes.filter(
            (n) => (n.data as Record<string, unknown>)?.type === cn.type,
          ).length;
          if (currentCount + pastedCount >= definition.maxInstances) {
            skippedNodeIds.add(cn.originalId);
            continue;
          }
        }

        const newId = idMap.get(cn.originalId);
        if (!newId) {
          continue;
        }
        const displayName = generateUniqueDisplayName(cn.data.display_name, batchNodes);
        const referenceId = generateUniqueReferenceId(displayName, batchNodes);

        let params = cloneData(cn.data.params);
        if (isCrossFlow) {
          params = stripCredentials(params);
        }
        params = regenToolInstanceIds(params);

        // When the flow is empty, use the absolute/content positions directly;
        // otherwise anchor relative positions to the cursor/viewport point.
        const position =
          isEmptyFlow && cn.absolutePosition
            ? { x: cn.absolutePosition.x, y: cn.absolutePosition.y }
            : { x: anchor.x + cn.relativePosition.x, y: anchor.y + cn.relativePosition.y };

        const node: Node = {
          id: newId,
          type: cn.type,
          position,
          selected: true,
          data: {
            id: newId,
            type: cn.type,
            display_name: displayName,
            reference_id: referenceId,
            status: 'idle',
            params,
            ...(cn.data.mapper !== undefined && { mapper: cloneData(cn.data.mapper) }),
            ...(cn.data._loop !== undefined && { _loop: cloneData(cn.data._loop) }),
          },
        };

        newNodes.push(node);
        batchNodes.push(node);
      }

      // Remap edges — drop any whose endpoint was skipped
      const newEdges: Edge[] = [];
      for (const ce of clipboard.edges) {
        if (skippedNodeIds.has(ce.source) || skippedNodeIds.has(ce.target)) {
          continue;
        }
        const newSource = idMap.get(ce.source);
        const newTarget = idMap.get(ce.target);
        if (!newSource || !newTarget) {
          continue;
        }

        newEdges.push({
          id: `edge-${nanoid()}`,
          source: newSource,
          target: newTarget,
          ...(ce.sourceHandle !== undefined && { sourceHandle: ce.sourceHandle }),
          ...(ce.targetHandle !== undefined && { targetHandle: ce.targetHandle }),
        });
      }

      if (newNodes.length > 0) {
        console.log(
          '[Copy/Paste] materializePaste: adding',
          newNodes.length,
          'nodes,',
          newEdges.length,
          'edges',
        );
        console.log(
          '[Copy/Paste] newNodes:',
          newNodes.map((n) => ({
            id: n.id,
            type: n.type,
            pos: n.position,
            data: {
              type: (n.data as Record<string, unknown>).type,
              display_name: (n.data as Record<string, unknown>).display_name,
            },
          })),
        );
        useFlowEditorStore.getState().pasteNodesAndEdges(newNodes, newEdges);
        const storeState = useFlowEditorStore.getState();
        console.log('[Copy/Paste] Store after paste: total nodes =', storeState.nodes.length);
      } else {
        console.log('[Copy/Paste] materializePaste: no nodes to add (all skipped?)');
      }

      if (skippedNodeIds.size > 0) {
        console.log(
          `[Copy/Paste] Skipped ${skippedNodeIds.size} node(s) — maxInstances limit reached`,
        );
      }
    },
    [flowId, getNodeDefinition],
  );

  // -------------------------------------------------------------------------
  // Compute paste anchor point
  // -------------------------------------------------------------------------
  const getPasteAnchor = useCallback(
    (offset?: { x: number; y: number }): { x: number; y: number } => {
      if (offset) {
        return offset;
      }

      // Try to paste at mouse cursor position in flow coords
      if (reactFlowInstance && mousePositionRef.current) {
        return reactFlowInstance.screenToFlowPosition(mousePositionRef.current);
      }

      // Fallback: center of viewport
      if (reactFlowInstance) {
        return reactFlowInstance.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
      }

      return { x: 250, y: 150 };
    },
    [reactFlowInstance],
  );

  // -------------------------------------------------------------------------
  // Read clipboard (in-memory first → system SDK parse fallback)
  // -------------------------------------------------------------------------
  const readClipboard = useCallback(async (): Promise<ClipboardData | null> => {
    // Prefer in-memory ref — has correct relative positions from serializeSelection.
    // This covers same-session copy/paste (the common case).
    if (clipboardRef.current) {
      return clipboardRef.current;
    }

    // Fall back to system clipboard — handles cross-app paste (SDK text from
    // a text editor, another browser tab, etc.)
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parseSDKText(text);
      if (parsed.nodes.length > 0) {
        return sdkResultToClipboard(parsed, flowId);
      }
    } catch {
      // Permission denied, parse failed, or empty
    }

    return null;
  }, [flowId]);

  // -------------------------------------------------------------------------
  // Write to clipboard (system + in-memory)
  // -------------------------------------------------------------------------
  const writeClipboard = useCallback(async (data: ClipboardData) => {
    clipboardRef.current = data;
    try {
      // Write SDK code to the system clipboard so pasting into a text editor
      // (VS Code, etc.) produces importable TypeScript helper calls.
      // Internal paste always reads from clipboardRef (in-memory).
      const sdkText = serializeToSDK(data.nodes, data.edges);
      await navigator.clipboard.writeText(sdkText);
    } catch {
      // System clipboard write failed — in-memory ref is still set
    }
  }, []);

  // -------------------------------------------------------------------------
  // Operations
  // -------------------------------------------------------------------------

  const copy = useCallback(async () => {
    const data = serializeSelection();
    if (!data) {
      return;
    }
    await writeClipboard(data);
  }, [serializeSelection, writeClipboard]);

  const paste = useCallback(async () => {
    console.log('[Copy/Paste] Paste triggered');
    const clipboard = await readClipboard();
    if (!clipboard) {
      console.log('[Copy/Paste] No clipboard data available');
      return;
    }
    console.log('[Copy/Paste] Clipboard data:', {
      nodeCount: clipboard.nodes.length,
      edgeCount: clipboard.edges.length,
    });
    const anchor = getPasteAnchor();
    console.log('[Copy/Paste] Paste anchor:', anchor);
    materializePaste(clipboard, anchor);
  }, [readClipboard, getPasteAnchor, materializePaste]);

  const cut = useCallback(async () => {
    const data = serializeSelection();
    if (!data) {
      return;
    }
    await writeClipboard(data);

    const selectedIds = useFlowEditorStore
      .getState()
      .nodes.filter((n) => n.selected)
      .map((n) => n.id);

    if (selectedIds.length > 0) {
      useFlowEditorStore.getState().removeNodes(selectedIds);
    }
  }, [serializeSelection, writeClipboard]);

  const duplicate = useCallback(() => {
    const data = serializeSelection();
    if (!data) {
      return;
    }

    // Don't write to system clipboard — duplicate is internal
    clipboardRef.current = data;

    // Compute offset from original positions
    const { nodes } = useFlowEditorStore.getState();
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) {
      return;
    }

    const minX = Math.min(...selectedNodes.map((n) => n.position.x));
    const minY = Math.min(...selectedNodes.map((n) => n.position.y));

    materializePaste(data, { x: minX + 50, y: minY + 50 });
  }, [serializeSelection, materializePaste]);

  const deleteSelection = useCallback(() => {
    const selectedIds = useFlowEditorStore
      .getState()
      .nodes.filter((n) => n.selected)
      .map((n) => n.id);

    if (selectedIds.length > 0) {
      useFlowEditorStore.getState().removeNodes(selectedIds);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Keyboard handler
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;

      // Only handle when focus is on the ReactFlow canvas, not on editable elements
      const isOnCanvas = el.closest('.react-flow') !== null;
      const isBodyFocused = el.tagName === 'BODY';
      const isEditing = isEditingContext(el);

      if (e.metaKey || e.ctrlKey) {
        console.log('[Copy/Paste] Keydown:', e.key, {
          isOnCanvas,
          isBodyFocused,
          isEditing,
          tagName: el.tagName,
          classList: el.className.substring(0, 80),
        });
      }

      if ((!isOnCanvas && !isBodyFocused) || isEditing) {
        return;
      }

      // If the user has a text selection anywhere in the document, let the
      // browser handle copy/cut natively (e.g. copying AI assistant output).
      const hasTextSelection = (window.getSelection()?.toString().length ?? 0) > 0;

      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === 'c') {
        if (hasTextSelection) {
          return;
        } // let browser copy selected text
        e.preventDefault();
        await copy();
      } else if (isMod && e.key === 'x') {
        if (hasTextSelection) {
          return;
        }
        e.preventDefault();
        await cut();
      } else if (isMod && e.key === 'v') {
        e.preventDefault();
        await paste();
      } else if (isMod && e.key === 'd') {
        e.preventDefault();
        duplicate();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [copy, cut, paste, duplicate, deleteSelection]);
}
