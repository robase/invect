/**
 * ChatMessageList — Renders the chat message list, streaming indicator, and empty states.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  MessageSquare,
  Bot,
  Loader2,
  AlertCircle,
  ChevronRight,
  Check,
  XCircle,
  X,
  Copy,
  ClipboardCheck,
  Pencil,
  KeyRound,
  Settings2,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible';
import type { ChatMessage } from './chat.store';
import { useChatStore } from './chat.store';
import { MarkdownRenderer } from './MarkdownRenderer';

// =====================================
// ChatMessageList
// =====================================

interface ChatMessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  isLoadingHistory: boolean;
  streamingText: string;
  error: string | null;
  hasConfiguredCredential: boolean;
  hasAvailableLlmCredentials: boolean;
  onOpenSettings: () => void;
  onSendMessage: (text: string) => void;
}

export function ChatMessageList({
  messages,
  isStreaming,
  isLoadingHistory,
  streamingText,
  error,
  hasConfiguredCredential,
  hasAvailableLlmCredentials,
  onOpenSettings,
  onSendMessage,
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages / streaming text
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div ref={scrollRef} className="flex flex-col gap-0.5 p-4">
        {isLoadingHistory && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Loading conversation…</span>
          </div>
        )}

        {!isLoadingHistory && messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center flex-1 text-center min-h-70">
            {!hasConfiguredCredential ? (
              <div className="mx-2 w-full max-w-sm">
                <EmptyCredentialState
                  hasAvailableCredentials={hasAvailableLlmCredentials}
                  onOpenSettings={onOpenSettings}
                />
              </div>
            ) : (
              <ChatSuggestionPrompts onSelect={onSendMessage} />
            )}
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            message={msg}
            onEditAndResend={
              !isStreaming
                ? (newContent) => {
                    useChatStore.getState().truncateFrom(msg.id);
                    onSendMessage(newContent);
                  }
                : undefined
            }
          />
        ))}

        {/* Streaming indicator */}
        {isStreaming && streamingText && (
          <div className="flex gap-2 py-2">
            <div className="flex items-start pt-1 shrink-0">
              <div className="flex items-center justify-center rounded-full size-5 bg-primary/10">
                <Bot className="size-3 text-primary" />
              </div>
            </div>
            <div className="min-w-0 px-3 py-2 overflow-hidden text-xs border rounded-lg rounded-tl-sm bg-muted/30 border-border/40">
              <MarkdownRenderer content={streamingText} />
              <span className="inline-block ml-0.5 w-1.5 h-4 bg-primary/60 animate-pulse rounded-sm" />
            </div>
          </div>
        )}

        {isStreaming && !streamingText && (
          <div className="flex items-center gap-2 py-2 text-xs ml-7 text-muted-foreground">
            <Loader2 className="size-3 animate-spin text-primary/60" />
            <span>Thinking…</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 mt-2 text-sm rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => useChatStore.getState().setError(null)}
              className="shrink-0 p-0.5 rounded hover:bg-destructive/20 transition-colors"
              title="Dismiss"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

// =====================================
// MissingCredentialNotice
// =====================================

export function MissingCredentialNotice({
  hasAvailableCredentials,
  onOpenSettings,
}: {
  hasAvailableCredentials: boolean;
  onOpenSettings: () => void;
}) {
  return (
    <div className="border-b bg-amber-50/70 px-4 py-3 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">LLM provider required</p>
          <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
            {hasAvailableCredentials
              ? 'Select an existing LLM provider for the chat assistant, or create a new LLM provider credential.'
              : 'Create a new LLM provider credential before using the chat assistant.'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5"
          onClick={onOpenSettings}
        >
          <Settings2 className="size-3.5" />
          {hasAvailableCredentials ? 'Choose Provider' : 'Create Provider'}
        </Button>
      </div>
    </div>
  );
}

// =====================================
// EmptyCredentialState
// =====================================

function EmptyCredentialState({
  hasAvailableCredentials,
  onOpenSettings,
}: {
  hasAvailableCredentials: boolean;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-muted/20 p-5">
      <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
        <KeyRound className="size-5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Set up an LLM provider</p>
        <p className="mt-1 max-w-72 text-xs text-muted-foreground">
          {hasAvailableCredentials
            ? 'Select an existing LLM provider for the chat assistant, or create a new LLM provider credential.'
            : 'Create a new LLM provider credential to start building flows with the assistant.'}
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
        <span>OpenAI</span>
        <span>·</span>
        <span>Anthropic</span>
        <span>·</span>
        <span>OpenRouter</span>
      </div>
      <Button
        variant="default"
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={onOpenSettings}
      >
        <Settings2 className="size-3.5" />
        {hasAvailableCredentials ? 'Select LLM Provider' : 'Create LLM Provider'}
      </Button>
    </div>
  );
}

// =====================================
// ChatSuggestionPrompts
// =====================================

const SUGGESTION_PROMPTS = [
  { label: 'Add a node', text: 'Add a JQ transform node after my input that filters active items' },
  { label: 'Debug flow', text: 'Analyze my current flow and suggest improvements' },
  { label: 'Connect nodes', text: 'Connect the remaining unlinked nodes in my flow' },
  { label: 'Explain flow', text: 'Walk me through what this flow does step by step' },
];

function ChatSuggestionPrompts({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-2">
      <div className="flex items-center justify-center rounded-full size-10 bg-primary/10">
        <MessageSquare className="size-5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">What can I help with?</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Build, edit, or debug your flows.</p>
      </div>
      <div className="flex flex-col w-full gap-1.5">
        {SUGGESTION_PROMPTS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onSelect(s.text)}
            className="flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors border rounded-lg text-foreground/80 border-border/50 bg-muted/20 hover:bg-accent/50 hover:border-border"
          >
            <ChevronRight className="size-3 text-muted-foreground/40 shrink-0" />
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// =====================================
// ChatMessageBubble
// =====================================

function ChatMessageBubble({
  message,
  onEditAndResend,
}: {
  message: ChatMessage;
  onEditAndResend?: (content: string) => void;
}) {
  if (message.role === 'user') {
    return <UserMessageBubble message={message} onEditAndResend={onEditAndResend} />;
  }

  if (message.role === 'assistant' && message.toolMeta) {
    return <ToolCallBubble toolMeta={message.toolMeta} />;
  }

  if (message.role === 'assistant') {
    return <AssistantMessageBubble message={message} />;
  }

  return null;
}

// =====================================
// UserMessageBubble — with edit+resend
// =====================================

function UserMessageBubble({
  message,
  onEditAndResend,
}: {
  message: ChatMessage;
  onEditAndResend?: (content: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [isEditing]);

  const handleSubmitEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (!trimmed || !onEditAndResend) {
      return;
    }
    setIsEditing(false);
    onEditAndResend(trimmed);
  }, [editValue, onEditAndResend]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmitEdit();
      }
      if (e.key === 'Escape') {
        setIsEditing(false);
        setEditValue(message.content);
      }
    },
    [handleSubmitEdit, message.content],
  );

  if (isEditing) {
    return (
      <div className="flex justify-end py-1.5">
        <div className="max-w-[85%] w-full">
          <Textarea
            ref={editRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            className="text-xs min-h-[40px] max-h-[120px] resize-none"
            rows={2}
          />
          <div className="flex justify-end gap-1 mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => {
                setIsEditing(false);
                setEditValue(message.content);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={handleSubmitEdit}
              disabled={!editValue.trim()}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end items-end gap-2 py-1.5 group/user">
      <span className="text-[10px] text-muted-foreground/0 group-hover/user:text-muted-foreground/40 transition-colors shrink-0 pb-1.5">
        {new Date(message.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
      <div className="relative text-xs leading-relaxed whitespace-pre-wrap min-w-0 text-foreground bg-primary/10 rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%]">
        {message.content}
        {onEditAndResend && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="absolute p-1 transition-opacity -translate-y-1/2 rounded opacity-0 -left-7 top-1/2 group-hover/user:opacity-100 text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Edit and resend"
          >
            <Pencil className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// =====================================
// AssistantMessageBubble — with copy
// =====================================

function AssistantMessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [message.content]);

  return (
    <div className="flex items-end gap-2 py-2 group/assistant">
      <div className="flex items-start pt-1 shrink-0">
        <div className="flex items-center justify-center rounded-full size-5 bg-primary/10">
          <Bot className="size-3 text-primary" />
        </div>
      </div>
      <div className="relative min-w-0 px-3 py-2 overflow-hidden text-xs border rounded-lg rounded-tl-sm text-foreground bg-muted/30 border-border/40">
        <MarkdownRenderer content={message.content} />
        <button
          type="button"
          onClick={handleCopy}
          className="absolute p-1 transition-opacity rounded opacity-0 right-1 top-1 group-hover/assistant:opacity-100 text-muted-foreground hover:text-foreground hover:bg-muted"
          title="Copy message"
        >
          {copied ? (
            <ClipboardCheck className="text-green-600 size-3" />
          ) : (
            <Copy className="size-3" />
          )}
        </button>
      </div>
      <span className="text-[10px] text-muted-foreground/0 group-hover/assistant:text-muted-foreground/40 transition-colors shrink-0 pb-1.5">
        {new Date(message.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    </div>
  );
}

// =====================================
// ToolCallBubble
// =====================================

function ToolCallBubble({ toolMeta }: { toolMeta: NonNullable<ChatMessage['toolMeta']> }) {
  const [open, setOpen] = useState(false);

  const isPending = toolMeta.status === 'pending';
  const isError = toolMeta.status === 'error';

  const statusIcon = isPending ? (
    <Loader2 className="size-3 animate-spin text-primary/60" />
  ) : isError ? (
    <XCircle className="size-3 text-destructive" />
  ) : (
    <Check className="size-3 text-emerald-600" />
  );

  const hasResult = toolMeta.result != null;
  const isExpandable = !isPending && hasResult;

  const toolLabel = toolMeta.toolName.replace(/_/g, ' ');

  const durationLabel = useMemo(() => {
    if (!toolMeta.durationMs) {
      return null;
    }
    if (toolMeta.durationMs < 1000) {
      return `${toolMeta.durationMs}ms`;
    }
    return `${(toolMeta.durationMs / 1000).toFixed(1)}s`;
  }, [toolMeta.durationMs]);

  const collapsedSummary = useMemo(() => {
    if (isPending) {
      return 'running…';
    }
    if (isError) {
      return toolMeta.result?.error ?? 'failed';
    }
    if (!toolMeta.result?.data) {
      return 'done';
    }
    const d = toolMeta.result.data;
    if (typeof d === 'string') {
      return d.length > 60 ? d.slice(0, 60) + '…' : d;
    }
    if (typeof d === 'object' && d !== null) {
      const keys = Object.keys(d as Record<string, unknown>);
      if (keys.length <= 3) {
        return keys.join(', ');
      }
      return `${keys.length} fields`;
    }
    return 'done';
  }, [isPending, isError, toolMeta.result]);

  return (
    <div className="my-1 ml-6">
      <Collapsible open={open} onOpenChange={isExpandable ? setOpen : undefined}>
        <CollapsibleTrigger
          disabled={!isExpandable}
          className={cn(
            'flex items-center gap-2 w-full rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors',
            isPending && 'border-primary/20 bg-primary/3',
            isError && 'border-destructive/25 bg-destructive/4',
            !isPending && !isError && 'border-border/60 bg-muted/30',
            isExpandable && 'cursor-pointer hover:bg-accent/50',
            !isExpandable && 'cursor-default',
          )}
        >
          {statusIcon}
          <span className="font-medium capitalize text-foreground/80 shrink-0">{toolLabel}</span>
          {durationLabel && !open && (
            <span className="text-[10px] text-muted-foreground/40 shrink-0">{durationLabel}</span>
          )}
          {!open && (
            <span
              className={cn(
                'truncate text-[10px] ml-1',
                isError ? 'text-destructive/60' : 'text-muted-foreground/50',
              )}
            >
              {collapsedSummary}
            </span>
          )}
          {isExpandable && (
            <ChevronRight
              className={cn(
                'size-3 ml-auto shrink-0 text-muted-foreground/40 transition-transform duration-200',
                open && 'rotate-90',
              )}
            />
          )}
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-1 text-[10px]">
            <ToolDataScrollable
              data={
                isError
                  ? { error: toolMeta.result!.error }
                  : (toolMeta.result!.data ?? toolMeta.result)
              }
              isError={isError}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// =====================================
// ToolDataScrollable
// =====================================

function ToolDataScrollable({ data, isError }: { data: unknown; isError: boolean }) {
  const formatted = useMemo(() => formatToolData(data), [data]);

  return (
    <pre
      className={cn(
        'text-[10px] leading-relaxed whitespace-pre-wrap break-all p-2.5 rounded-lg border overflow-auto max-h-45 font-mono',
        isError
          ? 'text-destructive/80 border-destructive/20 bg-destructive/5'
          : 'text-muted-foreground border-border/50 bg-muted/20',
      )}
    >
      {formatted}
    </pre>
  );
}

function formatToolData(data: unknown): string {
  if (data == null) {
    return '(empty)';
  }
  if (typeof data === 'string') {
    return data;
  }

  try {
    const json = JSON.stringify(data, null, 2);
    if (json.length > 4000) {
      return json.slice(0, 4000) + '\n… (truncated)';
    }
    return json;
  } catch {
    return String(data);
  }
}
