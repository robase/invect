// ---------------------------------------------------------------------------
// Keyboard shortcut definitions for the flow editor
// ---------------------------------------------------------------------------

export interface KeyboardShortcut {
  /** Unique identifier */
  id: string;
  /** Human-readable label shown in command palette and help overlay */
  label: string;
  /** Key combo in react-hotkeys-hook format (e.g. "mod+k", "shift+a") */
  keys: string;
  /** Display string for macOS (e.g. "⌘K") */
  macDisplay: string;
  /** Display string for Windows/Linux (e.g. "Ctrl+K") */
  winDisplay: string;
  /** Category for grouping in the command palette */
  category: ShortcutCategory;
  /** Optional description for the command palette */
  description?: string;
  /** If true, this shortcut is also available when editing text inputs */
  enableOnFormTags?: boolean;
}

export type ShortcutCategory = 'general' | 'editing' | 'navigation' | 'view';

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/** Get the platform-appropriate display string for a shortcut */
export function getShortcutDisplay(shortcut: KeyboardShortcut): string {
  return isMac ? shortcut.macDisplay : shortcut.winDisplay;
}

// ---------------------------------------------------------------------------
// Shortcut definitions
// ---------------------------------------------------------------------------

export const SHORTCUTS = {
  // === General ===
  commandPalette: {
    id: 'command-palette',
    label: 'Open Command Palette',
    keys: 'mod+k',
    macDisplay: '⌘K',
    winDisplay: 'Ctrl+K',
    category: 'general',
    enableOnFormTags: true,
  },
  save: {
    id: 'save',
    label: 'Save Flow',
    keys: 'mod+s',
    macDisplay: '⌘S',
    winDisplay: 'Ctrl+S',
    category: 'general',
    enableOnFormTags: true,
  },
  executeFlow: {
    id: 'execute-flow',
    label: 'Run Flow',
    keys: 'mod+enter',
    macDisplay: '⌘↵',
    winDisplay: 'Ctrl+Enter',
    category: 'general',
    enableOnFormTags: true,
  },
  showShortcuts: {
    id: 'show-shortcuts',
    label: 'Show Keyboard Shortcuts',
    keys: 'shift+/',
    macDisplay: '?',
    winDisplay: '?',
    category: 'general',
  },

  // === Editing ===
  copy: {
    id: 'copy',
    label: 'Copy Selected Nodes',
    keys: 'mod+c',
    macDisplay: '⌘C',
    winDisplay: 'Ctrl+C',
    category: 'editing',
  },
  cut: {
    id: 'cut',
    label: 'Cut Selected Nodes',
    keys: 'mod+x',
    macDisplay: '⌘X',
    winDisplay: 'Ctrl+X',
    category: 'editing',
  },
  paste: {
    id: 'paste',
    label: 'Paste Nodes',
    keys: 'mod+v',
    macDisplay: '⌘V',
    winDisplay: 'Ctrl+V',
    category: 'editing',
  },
  duplicate: {
    id: 'duplicate',
    label: 'Duplicate Selected Nodes',
    keys: 'mod+d',
    macDisplay: '⌘D',
    winDisplay: 'Ctrl+D',
    category: 'editing',
  },
  deleteSelection: {
    id: 'delete-selection',
    label: 'Delete Selected Nodes',
    keys: 'backspace',
    macDisplay: '⌫',
    winDisplay: 'Delete',
    category: 'editing',
  },
  selectAll: {
    id: 'select-all',
    label: 'Select All Nodes',
    keys: 'mod+a',
    macDisplay: '⌘A',
    winDisplay: 'Ctrl+A',
    category: 'editing',
  },

  // === Navigation ===
  fitView: {
    id: 'fit-view',
    label: 'Fit View',
    keys: 'mod+shift+f',
    macDisplay: '⌘⇧F',
    winDisplay: 'Ctrl+Shift+F',
    category: 'navigation',
  },
  zoomIn: {
    id: 'zoom-in',
    label: 'Zoom In',
    keys: 'mod+=',
    macDisplay: '⌘+',
    winDisplay: 'Ctrl++',
    category: 'navigation',
  },
  zoomOut: {
    id: 'zoom-out',
    label: 'Zoom Out',
    keys: 'mod+-',
    macDisplay: '⌘−',
    winDisplay: 'Ctrl+-',
    category: 'navigation',
  },

  // === View ===
  toggleSidebar: {
    id: 'toggle-sidebar',
    label: 'Toggle Node Sidebar',
    keys: 'mod+b',
    macDisplay: '⌘B',
    winDisplay: 'Ctrl+B',
    category: 'view',
  },
  toggleTheme: {
    id: 'toggle-theme',
    label: 'Toggle Dark/Light Mode',
    keys: 'mod+shift+l',
    macDisplay: '⌘⇧L',
    winDisplay: 'Ctrl+Shift+L',
    category: 'view',
  },
  toggleChat: {
    id: 'toggle-chat',
    label: 'Toggle AI Chat Assistant',
    keys: 'mod+shift+a',
    macDisplay: '⌘⇧A',
    winDisplay: 'Ctrl+Shift+A',
    category: 'view',
  },
} as const satisfies Record<string, KeyboardShortcut>;

export type ShortcutId = keyof typeof SHORTCUTS;

/** All shortcuts as a flat array, for iteration */
export const ALL_SHORTCUTS: KeyboardShortcut[] = Object.values(SHORTCUTS);

/** Shortcuts grouped by category */
export function getShortcutsByCategory(): Record<ShortcutCategory, KeyboardShortcut[]> {
  const grouped: Record<ShortcutCategory, KeyboardShortcut[]> = {
    general: [],
    editing: [],
    navigation: [],
    view: [],
  };
  for (const shortcut of ALL_SHORTCUTS) {
    grouped[shortcut.category].push(shortcut);
  }
  return grouped;
}

/** Human-readable category labels */
export const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  general: 'General',
  editing: 'Editing',
  navigation: 'Navigation',
  view: 'View',
};
