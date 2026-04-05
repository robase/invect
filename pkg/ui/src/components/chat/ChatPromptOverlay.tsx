/**
 * ChatPromptOverlay — Centered empty-flow prompt.
 *
 * Appears in the center of the flow editor viewport when the flow
 * has no nodes. Shows an "Add Node" button, an "or" separator,
 * and a chat input encouraging users to describe what they need.
 * On submit, opens the full ChatPanel and sends the prompt.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, ArrowUp } from 'lucide-react';
import { cn } from '~/lib/utils';
import { useChatStore, useChatOpen } from './chat.store';
import { useNodes } from '~/stores/flow-editor.store';
import { useUIStore } from '~/stores/uiStore';

interface ChatPromptOverlayProps {
  className?: string;
}

export function ChatPromptOverlay({ className }: ChatPromptOverlayProps) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const nodes = useNodes();
  const isChatOpen = useChatOpen();
  const setNodeSidebarOpen = useUIStore((s) => s.setNodeSidebarOpen);

  // Only show when the flow is empty and the full chat panel isn't open
  const isFlowEmpty = nodes.length === 0;
  const shouldShow = isFlowEmpty && !isChatOpen;

  const handleSubmit = useCallback(() => {
    const text = value.trim();
    if (!text) {
      return;
    }

    // Queue the prompt and open the panel — ChatPanel will consume it
    useChatStore.getState().setPendingPrompt(text);
    setValue('');
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleAddNode = useCallback(() => {
    setNodeSidebarOpen(true);
  }, [setNodeSidebarOpen]);

  // Auto-focus the input after a short delay when visible
  useEffect(() => {
    if (shouldShow) {
      const timer = setTimeout(() => inputRef.current?.focus(), 400);
      return () => clearTimeout(timer);
    }
  }, [shouldShow]);

  if (!shouldShow) {
    return null;
  }

  return (
    <div
      className={cn(
        'absolute inset-0 z-20 flex items-center justify-center pointer-events-none',
        'animate-in fade-in duration-500',
        className,
      )}
    >
      <div className="flex items-center gap-4 pointer-events-auto">
        {/* Add Node button */}
        <button
          type="button"
          onClick={handleAddNode}
          className={cn(
            'flex items-center gap-2 px-5 py-3 rounded-xl',
            'bg-primary text-primary-foreground',
            'text-sm font-medium',
            'shadow-md hover:shadow-lg hover:bg-primary/90',
            'transition-all duration-200',
            'cursor-pointer',
          )}
        >
          <Plus className="size-4" />
          Add Node
        </button>

        {/* "or" separator */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
            or
          </span>
        </div>

        {/* Chat input */}
        <div
          className={cn(
            'flex items-end gap-2 w-[420px] rounded-xl px-3 py-2.5',
            'bg-background/95 backdrop-blur-sm',
            'border border-primary/40 ring-1 ring-primary/15',
            'shadow-md shadow-primary/5',
            'transition-all duration-200',
            focused && 'shadow-lg shadow-primary/10 border-primary/60 ring-2 ring-primary/25',
          )}
        >
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Describe what you need done…"
            className={cn(
              'flex-1 resize-none bg-transparent text-sm leading-relaxed',
              'placeholder:text-muted-foreground/50',
              'focus:outline-none',
              'min-h-[72px] max-h-[120px] py-1.5 px-1',
            )}
            rows={3}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!value.trim()}
            className={cn(
              'flex items-center justify-center shrink-0',
              'size-7 rounded-full',
              'transition-all duration-150',
              value.trim()
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer'
                : 'bg-muted text-muted-foreground cursor-default',
            )}
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
