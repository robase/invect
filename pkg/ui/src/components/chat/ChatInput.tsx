/**
 * ChatInput — Input area for the chat panel with send/stop controls.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Square, KeyRound } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';

interface ChatInputProps {
  isStreaming: boolean;
  isLoadingHistory: boolean;
  hasConfiguredCredential: boolean;
  hasAvailableLlmCredentials: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onOpenSettings: () => void;
}

export function ChatInput({
  isStreaming,
  isLoadingHistory,
  hasConfiguredCredential,
  hasAvailableLlmCredentials,
  onSend,
  onStop,
  onOpenSettings,
}: ChatInputProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isStreaming || !hasConfiguredCredential) {
      return;
    }
    setInputValue('');
    onSend(text);
  }, [hasConfiguredCredential, inputValue, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="p-3 border-t bg-muted/10">
      {!hasConfiguredCredential ? (
        <div
          className="flex items-center gap-2 px-3 py-2 text-xs transition-colors border border-dashed rounded-lg cursor-pointer text-muted-foreground/60 border-border/60 hover:border-primary/30 hover:text-muted-foreground"
          onClick={onOpenSettings}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onOpenSettings();
            }
          }}
        >
          <KeyRound className="size-3.5 shrink-0" />
          <span>
            {hasAvailableLlmCredentials
              ? 'Select an existing LLM provider to start chatting…'
              : 'Create a new LLM provider credential to start chatting…'}
          </span>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your flow…"
            className="min-h-[40px] max-h-[120px] resize-none text-sm py-2"
            disabled={isStreaming || isLoadingHistory}
            rows={1}
          />
          {isStreaming ? (
            <Button variant="outline" size="icon-sm" onClick={onStop} title="Stop">
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="icon-sm"
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              title="Send"
            >
              <Send className="size-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
