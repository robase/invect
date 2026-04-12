import React from 'react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from '~/components/ui/command';
import { CATEGORY_LABELS, type ShortcutCategory } from './keyboard-shortcuts';
import {
  Save,
  Play,
  Copy,
  Scissors,
  ClipboardPaste,
  CopyPlus,
  Trash2,
  BoxSelect,
  Maximize,
  ZoomIn,
  ZoomOut,
  PanelLeft,
  Moon,
  Keyboard,
  Search,
  MessageSquare,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Command palette for the flow editor (⌘K)
// ---------------------------------------------------------------------------

export interface CommandPaletteAction {
  id: string;
  label: string;
  description?: string;
  category: ShortcutCategory;
  icon?: React.ReactNode;
  shortcutDisplay?: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface FlowCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: CommandPaletteAction[];
}

/** Icons mapped to shortcut IDs for visual consistency */
const SHORTCUT_ICONS: Record<string, React.ReactNode> = {
  'command-palette': <Search className="size-4" />,
  save: <Save className="size-4" />,
  'execute-flow': <Play className="size-4" />,
  'show-shortcuts': <Keyboard className="size-4" />,
  copy: <Copy className="size-4" />,
  cut: <Scissors className="size-4" />,
  paste: <ClipboardPaste className="size-4" />,
  duplicate: <CopyPlus className="size-4" />,
  'delete-selection': <Trash2 className="size-4" />,
  'select-all': <BoxSelect className="size-4" />,
  'fit-view': <Maximize className="size-4" />,
  'zoom-in': <ZoomIn className="size-4" />,
  'zoom-out': <ZoomOut className="size-4" />,
  'toggle-sidebar': <PanelLeft className="size-4" />,
  'toggle-theme': <Moon className="size-4" />,
  'toggle-chat': <MessageSquare className="size-4" />,
};

export function FlowCommandPalette({ open, onOpenChange, actions }: FlowCommandPaletteProps) {
  // Group actions by category
  const grouped = React.useMemo(() => {
    const groups: Record<ShortcutCategory, CommandPaletteAction[]> = {
      general: [],
      editing: [],
      navigation: [],
      view: [],
    };
    for (const action of actions) {
      groups[action.category].push(action);
    }
    return groups;
  }, [actions]);

  const handleSelect = React.useCallback(
    (action: CommandPaletteAction) => {
      onOpenChange(false);
      // Defer execution to let the dialog close first
      requestAnimationFrame(() => {
        action.onSelect();
      });
    },
    [onOpenChange],
  );

  const categoryOrder: ShortcutCategory[] = ['general', 'editing', 'navigation', 'view'];
  const nonEmptyCategories = categoryOrder.filter((cat) => grouped[cat].length > 0);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette"
      description="Search for commands..."
    >
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No commands found.</CommandEmpty>
        {nonEmptyCategories.map((category, index) => (
          <React.Fragment key={category}>
            {index > 0 && <CommandSeparator />}
            <CommandGroup heading={CATEGORY_LABELS[category]}>
              {grouped[category].map((action) => (
                <CommandItem
                  key={action.id}
                  value={`${action.label} ${action.description ?? ''}`}
                  onSelect={() => handleSelect(action)}
                  disabled={action.disabled}
                >
                  {action.icon ?? SHORTCUT_ICONS[action.id] ?? null}
                  <span>{action.label}</span>
                  {action.shortcutDisplay && (
                    <CommandShortcut>{action.shortcutDisplay}</CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
