import { describe, it, expect, beforeEach } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { useFlowEditorStore } from '../src/stores/flow-editor.store';
import { computeSnapshot } from '../src/utils/flowTransformations';

// ─── Helpers ───

function makeNode(id = 'n1', params: Record<string, unknown> = { prompt: 'hello' }): Node {
  return {
    id,
    type: 'core.model',
    position: { x: 100, y: 200 },
    data: {
      id,
      type: 'core.model',
      display_name: `Node ${id}`,
      reference_id: id,
      params,
    },
  };
}

function makeEdge(id = 'e1', source = 'n1', target = 'n2'): Edge {
  return { id, source, target };
}

/** Reset the store to initial state before each test */
function resetStore() {
  useFlowEditorStore.getState().reset();
}

/** Simulate initial server sync (sets up a "saved" baseline) */
function syncBaseline(nodes: Node[], edges: Edge[], versionId = 'v1') {
  const { syncFromServer } = useFlowEditorStore.getState();
  syncFromServer(nodes, edges, versionId, 'Test Flow');
}

/** Read isDirty (derived from snapshot comparison) */
function isDirty(): boolean {
  const s = useFlowEditorStore.getState();
  return s.currentSnapshot !== null && s.currentSnapshot !== s.lastSavedSnapshot;
}

// ─── Tests ───

describe('flow-editor.store — dirty detection (Phase 1.1)', () => {
  beforeEach(resetStore);

  it('starts clean (not dirty)', () => {
    expect(isDirty()).toBe(false);
  });

  it('is not dirty after initial syncFromServer', () => {
    syncBaseline([makeNode()], [makeEdge()]);

    expect(isDirty()).toBe(false);
    expect(useFlowEditorStore.getState().initialDataLoaded).toBe(true);
    expect(useFlowEditorStore.getState().lastSavedVersionId).toBe('v1');
  });

  it('becomes dirty when a node is added', () => {
    syncBaseline([makeNode('n1')], []);

    useFlowEditorStore.getState().addNode(makeNode('n2'));

    expect(isDirty()).toBe(true);
  });

  it('becomes dirty when a node is removed', () => {
    syncBaseline([makeNode('n1'), makeNode('n2')], []);

    useFlowEditorStore.getState().removeNode('n2');

    expect(isDirty()).toBe(true);
  });

  it('becomes dirty when node data is updated', () => {
    syncBaseline([makeNode('n1', { prompt: 'old' })], []);

    useFlowEditorStore.getState().updateNodeData('n1', { params: { prompt: 'new' } });

    expect(isDirty()).toBe(true);
  });

  it('becomes dirty when an edge is added', () => {
    syncBaseline([makeNode('n1'), makeNode('n2')], []);

    useFlowEditorStore.getState().addEdge(makeEdge('e1', 'n1', 'n2'));

    expect(isDirty()).toBe(true);
  });

  it('becomes dirty when an edge is removed', () => {
    syncBaseline([makeNode('n1'), makeNode('n2')], [makeEdge('e1', 'n1', 'n2')]);

    useFlowEditorStore.getState().removeEdge('e1');

    expect(isDirty()).toBe(true);
  });

  it('returns to clean when change is reverted', () => {
    const nodes = [makeNode('n1')];
    syncBaseline(nodes, []);

    // Add then remove
    useFlowEditorStore.getState().addNode(makeNode('n2'));
    expect(isDirty()).toBe(true);

    useFlowEditorStore.getState().removeNode('n2');
    expect(isDirty()).toBe(false);
  });

  it('returns to clean after markSaved', () => {
    syncBaseline([makeNode()], []);

    useFlowEditorStore.getState().addNode(makeNode('n2'));
    expect(isDirty()).toBe(true);

    useFlowEditorStore.getState().markSaved('v2');
    expect(isDirty()).toBe(false);
    expect(useFlowEditorStore.getState().lastSavedVersionId).toBe('v2');
  });

  it('returns to clean after resetDirty', () => {
    syncBaseline([makeNode()], []);

    useFlowEditorStore.getState().addNode(makeNode('n2'));
    expect(isDirty()).toBe(true);

    useFlowEditorStore.getState().resetDirty();
    expect(isDirty()).toBe(false);
  });
});

describe('flow-editor.store — non-structural change filtering (Phase 2.2)', () => {
  beforeEach(resetStore);

  it('selection-only changes do NOT mark dirty', () => {
    syncBaseline([makeNode('n1')], []);
    const snapshotBefore = useFlowEditorStore.getState().currentSnapshot;

    // Apply a select change (ReactFlow sends these on click)
    useFlowEditorStore.getState().applyNodeChanges([{ type: 'select', id: 'n1', selected: true }]);

    expect(isDirty()).toBe(false);
    // Snapshot should be unchanged (no recompute)
    expect(useFlowEditorStore.getState().currentSnapshot).toBe(snapshotBefore);
  });

  it('dimension changes do NOT mark dirty', () => {
    syncBaseline([makeNode('n1')], []);
    const snapshotBefore = useFlowEditorStore.getState().currentSnapshot;

    useFlowEditorStore.getState().applyNodeChanges([
      {
        type: 'dimensions',
        id: 'n1',
        dimensions: { width: 200, height: 100 },
        resizing: false,
      },
    ]);

    expect(isDirty()).toBe(false);
    expect(useFlowEditorStore.getState().currentSnapshot).toBe(snapshotBefore);
  });

  it('position changes DO mark dirty', () => {
    syncBaseline([makeNode('n1')], []);

    useFlowEditorStore
      .getState()
      .applyNodeChanges([{ type: 'position', id: 'n1', position: { x: 999, y: 999 } }]);

    expect(isDirty()).toBe(true);
  });

  it('remove changes DO mark dirty', () => {
    syncBaseline([makeNode('n1'), makeNode('n2')], []);

    useFlowEditorStore.getState().applyNodeChanges([{ type: 'remove', id: 'n2' }]);

    expect(isDirty()).toBe(true);
  });

  it('edge selection changes do NOT mark dirty', () => {
    syncBaseline([makeNode('n1'), makeNode('n2')], [makeEdge('e1', 'n1', 'n2')]);

    useFlowEditorStore.getState().applyEdgeChanges([{ type: 'select', id: 'e1', selected: true }]);

    expect(isDirty()).toBe(false);
  });
});

describe('flow-editor.store — syncFromServer guard', () => {
  beforeEach(resetStore);

  it('applies data on first sync (no prior data)', () => {
    const nodes = [makeNode('n1')];
    const edges = [makeEdge()];

    syncBaseline(nodes, edges, 'v1');

    const state = useFlowEditorStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.edges).toHaveLength(1);
    expect(state.lastSavedVersionId).toBe('v1');
    expect(state.initialDataLoaded).toBe(true);
  });

  it('applies new version when user has no local changes', () => {
    syncBaseline([makeNode('n1')], [], 'v1');

    // Server sends v2 with an additional node
    const newNodes = [makeNode('n1'), makeNode('n2')];
    useFlowEditorStore.getState().syncFromServer(newNodes, [], 'v2', 'Test Flow');

    const state = useFlowEditorStore.getState();
    expect(state.nodes).toHaveLength(2);
    expect(state.lastSavedVersionId).toBe('v2');
  });

  it('rejects new version when user has unsaved local changes', () => {
    syncBaseline([makeNode('n1')], [], 'v1');

    // User makes local changes
    useFlowEditorStore.getState().addNode(makeNode('n-local'));
    expect(isDirty()).toBe(true);

    // Server tries to push v2 — should be rejected
    const serverNodes = [makeNode('n1'), makeNode('n-server')];
    useFlowEditorStore.getState().syncFromServer(serverNodes, [], 'v2', 'Test Flow');

    const state = useFlowEditorStore.getState();
    // Still has local node, not server node
    expect(state.nodes.some((n) => n.id === 'n-local')).toBe(true);
    expect(state.nodes.some((n) => n.id === 'n-server')).toBe(false);
    // Version not updated
    expect(state.lastSavedVersionId).toBe('v1');
  });

  it('does not re-apply same version (no-op)', () => {
    const nodes = [makeNode('n1')];
    syncBaseline(nodes, [], 'v1');

    // Same version, same data — should be a no-op
    useFlowEditorStore.getState().syncFromServer(nodes, [], 'v1', 'Test Flow');

    expect(useFlowEditorStore.getState().lastSavedVersionId).toBe('v1');
    expect(isDirty()).toBe(false);
  });
});

describe('flow-editor.store — tool panel state (Phase 1.2)', () => {
  beforeEach(resetStore);

  it('starts with all tool panel state closed/null', () => {
    const state = useFlowEditorStore.getState();
    expect(state.toolSelectorOpen).toBe(false);
    expect(state.toolConfigOpen).toBe(false);
    expect(state.toolPanelNodeId).toBeNull();
    expect(state.selectedToolInstanceId).toBeNull();
    expect(state.configPanelToolInstanceId).toBeNull();
  });

  it('openToolSelector sets nodeId and opens selector', () => {
    useFlowEditorStore.getState().openToolSelector('agent-1');

    const state = useFlowEditorStore.getState();
    expect(state.toolSelectorOpen).toBe(true);
    expect(state.toolPanelNodeId).toBe('agent-1');
  });

  it('closeToolSelector resets all tool panel state', () => {
    useFlowEditorStore.getState().openToolSelector('agent-1');
    useFlowEditorStore.getState().openToolConfig('agent-1', 'tool-inst-1');
    useFlowEditorStore.getState().closeToolSelector();

    const state = useFlowEditorStore.getState();
    expect(state.toolSelectorOpen).toBe(false);
    expect(state.toolConfigOpen).toBe(false);
    expect(state.toolPanelNodeId).toBeNull();
    expect(state.selectedToolInstanceId).toBeNull();
  });

  it('openToolConfig sets instance and opens config', () => {
    useFlowEditorStore.getState().openToolConfig('agent-1', 'tool-inst-1');

    const state = useFlowEditorStore.getState();
    expect(state.toolConfigOpen).toBe(true);
    expect(state.toolPanelNodeId).toBe('agent-1');
    expect(state.selectedToolInstanceId).toBe('tool-inst-1');
  });

  it('closeToolConfig clears instance but does not close selector', () => {
    useFlowEditorStore.getState().openToolSelector('agent-1');
    useFlowEditorStore.getState().openToolConfig('agent-1', 'tool-inst-1');
    useFlowEditorStore.getState().closeToolConfig();

    const state = useFlowEditorStore.getState();
    expect(state.toolConfigOpen).toBe(false);
    expect(state.selectedToolInstanceId).toBeNull();
    // Selector stays open
    expect(state.toolSelectorOpen).toBe(true);
    expect(state.toolPanelNodeId).toBe('agent-1');
  });

  it('setConfigPanelToolInstanceId sets pre-selection', () => {
    useFlowEditorStore.getState().setConfigPanelToolInstanceId('tool-inst-5');

    expect(useFlowEditorStore.getState().configPanelToolInstanceId).toBe('tool-inst-5');
  });

  it('setFlowId resets tool panel state', () => {
    useFlowEditorStore.getState().openToolSelector('agent-1');
    useFlowEditorStore.getState().openToolConfig('agent-1', 'tool-inst-1');

    useFlowEditorStore.getState().setFlowId('new-flow');

    const state = useFlowEditorStore.getState();
    expect(state.toolSelectorOpen).toBe(false);
    expect(state.toolConfigOpen).toBe(false);
    expect(state.toolPanelNodeId).toBeNull();
    expect(state.selectedToolInstanceId).toBeNull();
    expect(state.configPanelToolInstanceId).toBeNull();
  });
});

describe('flow-editor.store — setFlowId resets snapshots', () => {
  beforeEach(resetStore);

  it('resets all dirty-tracking state when switching flows', () => {
    syncBaseline([makeNode()], [], 'v1');
    useFlowEditorStore.getState().addNode(makeNode('n2'));
    expect(isDirty()).toBe(true);

    // Switch to different flow
    useFlowEditorStore.getState().setFlowId('other-flow');

    const state = useFlowEditorStore.getState();
    expect(state.currentSnapshot).toBeNull();
    expect(state.lastSavedSnapshot).toBeNull();
    expect(state.lastSavedVersionId).toBeNull();
    expect(state.initialDataLoaded).toBe(false);
    expect(isDirty()).toBe(false);
  });

  it('does not reset when flowId is the same', () => {
    // Set up a flow
    useFlowEditorStore.getState().setFlowId('flow-1');
    syncBaseline([makeNode()], [], 'v1');

    // "Switch" to same flow — should not reset
    useFlowEditorStore.getState().setFlowId('flow-1');

    expect(useFlowEditorStore.getState().initialDataLoaded).toBe(true);
    expect(useFlowEditorStore.getState().lastSavedVersionId).toBe('v1');
  });
});

describe('flow-editor.store — paste and batch operations', () => {
  beforeEach(resetStore);

  it('pasteNodesAndEdges marks dirty', () => {
    syncBaseline([makeNode('n1')], [], 'v1');

    useFlowEditorStore
      .getState()
      .pasteNodesAndEdges([makeNode('n-pasted')], [makeEdge('e-pasted', 'n1', 'n-pasted')]);

    expect(isDirty()).toBe(true);
    expect(useFlowEditorStore.getState().nodes).toHaveLength(2);
    expect(useFlowEditorStore.getState().edges).toHaveLength(1);
  });

  it('removeNodes (batch) marks dirty', () => {
    syncBaseline([makeNode('n1'), makeNode('n2'), makeNode('n3')], [], 'v1');

    useFlowEditorStore.getState().removeNodes(['n2', 'n3']);

    expect(isDirty()).toBe(true);
    expect(useFlowEditorStore.getState().nodes).toHaveLength(1);
  });
});
