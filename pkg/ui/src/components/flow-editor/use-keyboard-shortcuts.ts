import { useState, useCallback, useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useReactFlow } from '@xyflow/react';
import { useFlowEditorStore, getNodeData } from './flow-editor.store';
import { useFlowActions } from '../../routes/flow-route-layout';
import { useUIStore } from '~/stores/uiStore';
import { useTheme } from '~/contexts/ThemeProvider';
import { useChatStore } from '~/components/chat/chat.store';
import { SHORTCUTS, getShortcutDisplay } from './keyboard-shortcuts';
import type { CommandPaletteAction } from './FlowCommandPalette';

// ---------------------------------------------------------------------------
// Hook that registers all keyboard shortcuts for the flow editor
// and exposes command palette state + actions.
// ---------------------------------------------------------------------------

/** Options to control which canvas-level shortcuts to skip (handled elsewhere) */
interface UseKeyboardShortcutsOptions {
  /** Whether copy/paste shortcuts are handled by useCopyPaste (avoid double-binding) */
  copyPasteHandledExternally?: boolean;
}

export function useKeyboardShortcuts(opts: UseKeyboardShortcutsOptions = {}) {
  const { copyPasteHandledExternally = true } = opts;

  // --- State for command palette and help dialog ---
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);

  // --- External hooks ---
  const reactFlow = useReactFlow();
  const flowActions = useFlowActions();
  const toggleNodeSidebar = useUIStore((s) => s.toggleNodeSidebar);
  const { resolvedTheme, setTheme } = useTheme();
  const toggleChat = useChatStore((s) => s.togglePanel);

  // Subscribe to raw nodes; project identity fields via useMemo so the
  // command palette has something to search over.
  const storeNodes = useFlowEditorStore((s) => s.nodes);
  const nodeIdentities = useMemo(
    () =>
      storeNodes.map((n) => {
        const data = getNodeData(n);
        return {
          id: n.id,
          displayName: data?.display_name ?? '',
          referenceId: data?.reference_id ?? '',
          type: data?.type ?? '',
        };
      }),
    [storeNodes],
  );

  // --- Actions ---
  const handleSave = useCallback(() => {
    if (flowActions?.onSave) {
      flowActions.onSave();
    }
  }, [flowActions]);

  const handleExecute = useCallback(() => {
    if (flowActions?.onExecute) {
      flowActions.onExecute();
    }
  }, [flowActions]);

  const handleFitView = useCallback(() => {
    reactFlow.fitView({ padding: 0.2, duration: 200 });
  }, [reactFlow]);

  const handleZoomIn = useCallback(() => {
    reactFlow.zoomIn({ duration: 200 });
  }, [reactFlow]);

  const handleZoomOut = useCallback(() => {
    reactFlow.zoomOut({ duration: 200 });
  }, [reactFlow]);

  const handleSelectAll = useCallback(() => {
    const nodes = useFlowEditorStore.getState().nodes;
    const changes = nodes.map((n) => ({
      id: n.id,
      type: 'select' as const,
      selected: true,
    }));
    useFlowEditorStore.getState().applyNodeChanges(changes);
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  const handleGoToNode = useCallback(
    (nodeId: string) => {
      const { nodes, applyNodeChanges } = useFlowEditorStore.getState();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) {return;}
      const width = node.measured?.width ?? node.width ?? 200;
      const height = node.measured?.height ?? node.height ?? 100;
      const x = node.position.x + width / 2;
      const y = node.position.y + height / 2;
      reactFlow.setCenter(x, y, { zoom: reactFlow.getZoom(), duration: 400 });
      applyNodeChanges(
        nodes.map((n) => ({ id: n.id, type: 'select' as const, selected: n.id === nodeId })),
      );
    },
    [reactFlow],
  );

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const openShortcutsHelp = useCallback(() => setShortcutsHelpOpen(true), []);

  // --- Register hotkeys ---

  // General
  useHotkeys(
    SHORTCUTS.commandPalette.keys,
    (e) => {
      e.preventDefault();
      openCommandPalette();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
  );

  useHotkeys(
    SHORTCUTS.save.keys,
    (e) => {
      e.preventDefault();
      handleSave();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
  );

  useHotkeys(
    SHORTCUTS.executeFlow.keys,
    (e) => {
      e.preventDefault();
      handleExecute();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
  );

  useHotkeys(SHORTCUTS.showShortcuts.keys, (e) => {
    // Don't fire when typing in inputs — only from canvas
    const el = e.target as HTMLElement;
    if (
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.isContentEditable ||
      el.closest('.cm-editor') ||
      el.closest('[role="dialog"]')
    ) {
      return;
    }
    e.preventDefault();
    openShortcutsHelp();
  });

  // Navigation
  useHotkeys(SHORTCUTS.fitView.keys, (e) => {
    e.preventDefault();
    handleFitView();
  });

  useHotkeys(SHORTCUTS.zoomIn.keys, (e) => {
    e.preventDefault();
    handleZoomIn();
  });

  useHotkeys(SHORTCUTS.zoomOut.keys, (e) => {
    e.preventDefault();
    handleZoomOut();
  });

  // Editing (only if not handled by useCopyPaste)
  if (!copyPasteHandledExternally) {
    // These would be registered here if useCopyPaste was removed.
    // For now, copy/paste/cut/duplicate/delete are in useCopyPaste.
  }

  // Select all
  useHotkeys(SHORTCUTS.selectAll.keys, (e) => {
    const el = e.target as HTMLElement;
    if (
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.isContentEditable ||
      el.closest('.cm-editor') ||
      el.closest('[role="dialog"]')
    ) {
      return;
    }
    e.preventDefault();
    handleSelectAll();
  });

  // View
  useHotkeys(SHORTCUTS.toggleSidebar.keys, (e) => {
    e.preventDefault();
    toggleNodeSidebar();
  });

  useHotkeys(SHORTCUTS.toggleTheme.keys, (e) => {
    e.preventDefault();
    handleToggleTheme();
  });

  useHotkeys(SHORTCUTS.toggleChat.keys, (e) => {
    e.preventDefault();
    toggleChat();
  });

  // --- Build command palette actions ---
  const nodeActions: CommandPaletteAction[] = useMemo(
    () =>
      nodeIdentities.map((n) => {
        const label = n.displayName.trim() || n.referenceId || n.id;
        const descriptionParts = [
          n.referenceId && n.referenceId !== label ? n.referenceId : null,
          n.type || null,
        ].filter((part): part is string => Boolean(part));
        return {
          id: `goto-node-${n.id}`,
          label,
          description: descriptionParts.join(' · ') || undefined,
          category: 'nodes' as const,
          onSelect: () => handleGoToNode(n.id),
        };
      }),
    [nodeIdentities, handleGoToNode],
  );

  const commandPaletteActions: CommandPaletteAction[] = useMemo(
    () => [
      ...nodeActions,
      {
        id: SHORTCUTS.save.id,
        label: SHORTCUTS.save.label,
        category: SHORTCUTS.save.category,
        shortcutDisplay: getShortcutDisplay(SHORTCUTS.save),
        onSelect: handleSave,
        disabled: !flowActions?.onSave,
      },
      {
        id: SHORTCUTS.executeFlow.id,
        label: SHORTCUTS.executeFlow.label,
        category: SHORTCUTS.executeFlow.category,
        shortcutDisplay: getShortcutDisplay(SHORTCUTS.executeFlow),
        onSelect: handleExecute,
        disabled: !flowActions?.onExecute,
      },
      {
        id: SHORTCUTS.showShortcuts.id,
        label: SHORTCUTS.showShortcuts.label,
        category: SHORTCUTS.showShortcuts.category,
        shortcutDisplay: getShortcutDisplay(SHORTCUTS.showShortcuts),
        onSelect: openShortcutsHelp,
      },
      // Editing
      {
        id: SHORTCUTS.selectAll.id,
        label: SHORTCUTS.selectAll.label,
        category: SHORTCUTS.selectAll.category,
        shortcutDisplay: getShortcutDisplay(SHORTCUTS.selectAll),
        onSelect: handleSelectAll,
      },
      // Navigation
      {
        id: SHORTCUTS.fitView.id,
        label: SHORTCUTS.fitView.label,
        category: SHORTCUTS.fitView.category,
        shortcutDisplay: getShortcutDisplay(SHORTCUTS.fitView),
        onSelect: handleFitView,
      },
      {
        id: SHORTCUTS.zoomIn.id,
        label: SHORTCUTS.zoomIn.label,
        category: SHORTCUTS.zoomIn.category,
        shortcutDisplay: getShortcutDisplay(SHORTCUTS.zoomIn),
        onSelect: handleZoomIn,
      },
      {
        id: SHORTCUTS.zoomOut.id,
        label: SHORTCUTS.zoomOut.label,
        category: SHORTCUTS.zoomOut.category,
        shortcutDisplay: getShortcutDisplay(SHORTCUTS.zoomOut),
        onSelect: handleZoomOut,
      },
      // View
      {
        id: SHORTCUTS.toggleSidebar.id,
        label: SHORTCUTS.toggleSidebar.label,
        category: SHORTCUTS.toggleSidebar.category,
        shortcutDisplay: getShortcutDisplay(SHORTCUTS.toggleSidebar),
        onSelect: toggleNodeSidebar,
      },
      {
        id: SHORTCUTS.toggleTheme.id,
        label: SHORTCUTS.toggleTheme.label,
        category: SHORTCUTS.toggleTheme.category,
        shortcutDisplay: getShortcutDisplay(SHORTCUTS.toggleTheme),
        onSelect: handleToggleTheme,
      },
      {
        id: SHORTCUTS.toggleChat.id,
        label: SHORTCUTS.toggleChat.label,
        category: SHORTCUTS.toggleChat.category,
        shortcutDisplay: getShortcutDisplay(SHORTCUTS.toggleChat),
        onSelect: toggleChat,
      },
    ],
    [
      nodeActions,
      handleSave,
      handleExecute,
      openShortcutsHelp,
      handleSelectAll,
      handleFitView,
      handleZoomIn,
      handleZoomOut,
      toggleNodeSidebar,
      handleToggleTheme,
      toggleChat,
      flowActions,
    ],
  );

  return {
    commandPaletteOpen,
    setCommandPaletteOpen,
    shortcutsHelpOpen,
    setShortcutsHelpOpen,
    commandPaletteActions,
  };
}
