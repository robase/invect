import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '~/components/ui/dialog';
import {
  CATEGORY_LABELS,
  getShortcutDisplay,
  getShortcutsByCategory,
  type ShortcutCategory,
} from './keyboard-shortcuts';

// ---------------------------------------------------------------------------
// Keyboard shortcuts help overlay (? key)
// ---------------------------------------------------------------------------

interface ShortcutsHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsHelpDialog({ open, onOpenChange }: ShortcutsHelpDialogProps) {
  const grouped = React.useMemo(() => getShortcutsByCategory(), []);
  const categoryOrder: ShortcutCategory[] = ['general', 'editing', 'navigation', 'view'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Keyboard Shortcuts</DialogTitle>
        <DialogDescription>A reference of all available keyboard shortcuts.</DialogDescription>
      </DialogHeader>
      <DialogContent className="max-w-lg" showCloseButton>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          {categoryOrder.map((category) => {
            const shortcuts = grouped[category];
            if (shortcuts.length === 0) {
              return null;
            }
            return (
              <div key={category}>
                <h3 className="mb-2 text-xs font-medium tracking-wider uppercase text-muted-foreground">
                  {CATEGORY_LABELS[category]}
                </h3>
                <div className="space-y-1">
                  {shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md text-sm"
                    >
                      <span>{shortcut.label}</span>
                      <kbd className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded bg-muted text-muted-foreground border border-border">
                        {getShortcutDisplay(shortcut)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
