/**
 * ChatInput — Input area for the chat panel with send/stop controls.
 *
 * Copilot-style layout: textarea on top, toolbar row below with
 * model selector, provider selector, and send button.
 */

import React, { useState, useCallback, useRef } from 'react';
import { Send, Square, KeyRound } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { ChatModelSelector } from './ChatModelSelector';
import { ChatProviderSelector } from './ChatProviderSelector';

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
    <div className="m-3 mt-0">
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
        <div className="overflow-hidden border rounded-lg border-border/60 bg-card ring-0 shadow-sm focus-within:border-primary/50">
          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your flow…"
            className="block w-full px-3 pt-2.5 pb-1 text-sm bg-transparent border-none outline-none ring-0 shadow-none resize-none min-h-15 max-h-40 placeholder:text-muted-foreground/50 focus:ring-0 focus:shadow-none focus:outline-none"
            disabled={isStreaming || isLoadingHistory}
            rows={2}
          />
          {/* Bottom toolbar */}
          <div className="flex items-center gap-1 px-1.5 pb-1.5">
            <ChatModelSelector />
            <ChatProviderSelector />
            <div className="flex-1" />
            {isStreaming ? (
              <Button variant="ghost" size="icon-sm" onClick={onStop} title="Stop generating">
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleSubmit}
                disabled={!inputValue.trim()}
                title="Send (Enter)"
                className={inputValue.trim() ? 'text-primary hover:text-primary' : ''}
              >
                <Send className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
