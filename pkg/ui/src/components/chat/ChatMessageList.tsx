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
  ChevronDown,
  Check,
  XCircle,
  X,
  Copy,
  ClipboardCheck,
  Pencil,
  Circle,
  CheckCircle2,
  SkipForward,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible';
import type { ChatMessage } from './chat.store';
import { useChatStore } from './chat.store';
import { MarkdownRenderer } from './MarkdownRenderer';
import { InlineCredentialSetup } from './InlineCredentialSetup';

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
  hasAvailableLlmCredentials: _hasAvailableLlmCredentials,
  onOpenSettings: _onOpenSettings,
  onSendMessage,
}: ChatMessageListProps) {
  const _scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll: only scroll to bottom if already near bottom (within 80px)
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);

  // Capture ref to the ScrollArea viewport for scroll tracking
  const scrollAreaRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      return;
    }
    const viewport = node.querySelector(
      '[data-radix-scroll-area-viewport]',
    ) as HTMLDivElement | null;
    if (viewport) {
      viewportRef.current = viewport;
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }
    const threshold = 80;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current && viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  return (
    <ScrollArea className="flex-1 min-h-0" onScrollCapture={handleScroll} ref={scrollAreaRef}>
      <div className="flex flex-col gap-0.5 p-4">
        {isLoadingHistory && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Loading conversation…</span>
          </div>
        )}

        {!isLoadingHistory && messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center flex-1 text-center min-h-70">
            {!hasConfiguredCredential ? (
              <InlineCredentialSetup />
            ) : (
              <ChatSuggestionPrompts onSelect={onSendMessage} />
            )}
          </div>
        )}

        {messages.map((msg, idx) => {
          // Determine if this plan tool call is the most recent one
          const isPlanMsg =
            msg.role === 'assistant' &&
            msg.toolMeta &&
            (msg.toolMeta.toolName === 'set_plan' || msg.toolMeta.toolName === 'update_plan');
          const isLatestPlan =
            isPlanMsg &&
            !messages
              .slice(idx + 1)
              .some(
                (m) =>
                  m.role === 'assistant' &&
                  m.toolMeta &&
                  (m.toolMeta.toolName === 'set_plan' || m.toolMeta.toolName === 'update_plan'),
              );

          return (
          <ChatMessageBubble
            key={msg.id}
            message={msg}
            isLatestPlan={!!isLatestPlan}
            onEditAndResend={
              !isStreaming
                ? (newContent) => {
                    useChatStore.getState().truncateFrom(msg.id);
                    onSendMessage(newContent);
                  }
                : undefined
            }
          />
          );
        })}

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

        {/* Suggested follow-up actions */}
        <SuggestionChips onSelect={onSendMessage} isStreaming={isStreaming} />
      </div>
    </ScrollArea>
  );
}

// =====================================
// SuggestionChips
// =====================================

function SuggestionChips({
  onSelect,
  isStreaming,
}: {
  onSelect: (prompt: string) => void;
  isStreaming: boolean;
}) {
  const suggestions = useChatStore((s) => s.suggestions);
  if (suggestions.length === 0 || isStreaming) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-2 ml-7">
      {suggestions.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(s.prompt)}
          className="px-2.5 py-1 text-xs rounded-full border border-border/60 bg-muted/40 text-foreground/80 hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors"
        >
          {s.label}
        </button>
      ))}
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
  isLatestPlan,
  onEditAndResend,
}: {
  message: ChatMessage;
  isLatestPlan: boolean;
  onEditAndResend?: (content: string) => void;
}) {
  if (message.role === 'user') {
    return <UserMessageBubble message={message} onEditAndResend={onEditAndResend} />;
  }

  if (message.role === 'assistant' && message.toolMeta) {
    return <ToolCallBubble toolMeta={message.toolMeta} isLatestPlan={isLatestPlan} />;
  }

  if (message.role === 'assistant' && message.content.trim()) {
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

  const isLongContent = message.content.length > 300 || message.content.split('\n').length > 8;
  const [collapsed, setCollapsed] = useState(true);

  // For long content, split into typed text (before first newline) and pasted body (after)
  const firstNewline = message.content.indexOf('\n');
  const typedPart = isLongContent && firstNewline > 0 ? message.content.slice(0, firstNewline) : '';
  const pastedPart = isLongContent
    ? (firstNewline > 0 ? message.content.slice(firstNewline + 1) : message.content)
    : '';
  const pastedLineCount = isLongContent ? pastedPart.split('\n').length : 0;
  const pastedCharCount = pastedPart.length;

  return (
    <div className="flex flex-col items-end py-1.5 group/user">
      <div className="relative text-xs leading-relaxed min-w-0 text-foreground bg-primary/10 rounded-2xl rounded-tr-sm px-3 py-2 max-w-[95%]">
        {isLongContent ? (
          <div className="flex flex-col gap-1.5">
            {typedPart && <span className="whitespace-pre-wrap">{typedPart}</span>}
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center gap-1.5 w-full rounded-md border border-foreground/10 bg-foreground/5 px-2 py-1.5 text-[10px] text-foreground/70 hover:bg-foreground/10 transition-colors"
            >
              {collapsed ? (
                <ChevronRight className="size-3 shrink-0" />
              ) : (
                <ChevronDown className="size-3 shrink-0" />
              )}
              <span className="font-medium">Pasted text</span>
              <span className="ml-auto text-foreground/40">{pastedLineCount} lines &middot; {pastedCharCount} chars</span>
            </button>
            {!collapsed && (
              <div className="overflow-y-auto max-h-48 rounded-md border border-foreground/10 bg-foreground/5 px-2.5 py-2 text-[11px] leading-relaxed whitespace-pre-wrap font-mono overscroll-contain">
                {pastedPart}
              </div>
            )}
          </div>
        ) : (
          <span className="whitespace-pre-wrap">{message.content}</span>
        )}
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
      <span className="text-[10px] mt-0.5 text-muted-foreground/0 group-hover/user:text-muted-foreground/40 transition-colors">
        {new Date(message.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
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
    <div className="flex flex-col items-start py-2 group/assistant">
      <div className="flex items-center gap-1.5 mb-1">
        <div className="flex items-center justify-center rounded-full size-4 bg-primary/10">
          <Bot className="size-2.5 text-primary" />
        </div>
        <span className="text-[10px] text-muted-foreground/50 font-medium">Assistant</span>
      </div>
      <div className="relative min-w-0 px-3 py-2 overflow-hidden text-xs border rounded-lg rounded-tl-sm text-foreground bg-muted/30 border-border/40 max-w-[95%]">
        <MarkdownRenderer content={message.content} />
        <button
          type="button"
          onClick={handleCopy}
          className="absolute p-1 transition-opacity rounded opacity-0 right-1 bottom-1 group-hover/assistant:opacity-100 text-muted-foreground hover:text-foreground hover:bg-muted"
          title="Copy message"
        >
          {copied ? (
            <ClipboardCheck className="text-success size-3" />
          ) : (
            <Copy className="size-3" />
          )}
        </button>
      </div>
      <span className="text-[10px] mt-0.5 text-muted-foreground/0 group-hover/assistant:text-muted-foreground/40 transition-colors">
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

function ToolCallBubble({
  toolMeta,
  isLatestPlan,
}: {
  toolMeta: NonNullable<ChatMessage['toolMeta']>;
  isLatestPlan: boolean;
}) {
  const [open, setOpen] = useState(false);

  const isPending = toolMeta.status === 'pending';
  const isError = toolMeta.status === 'error';
  const isPlanTool = toolMeta.toolName === 'set_plan' || toolMeta.toolName === 'update_plan';

  // Plan tools get a special inline rendering instead of collapsed JSON
  if (isPlanTool && !isPending && !isError && toolMeta.result?.data) {
    return (
      <PlanStepsBubble
        data={toolMeta.result.data as Record<string, unknown>}
        isLatestPlan={isLatestPlan}
      />
    );
  }

  const statusIcon = isPending ? (
    <Loader2 className="size-3 animate-spin text-primary/60" />
  ) : isError ? (
    <XCircle className="size-3 text-destructive" />
  ) : (
    <Check className="size-3 text-success" />
  );

  const hasResult = toolMeta.result !== null && toolMeta.result !== undefined;
  const isExpandable = !isPending && hasResult;

  // oxlint-disable typescript/no-non-null-assertion -- guarded by isExpandable which requires hasResult
  const expandableData = isExpandable
    ? isError
      ? { error: toolMeta.result!.error }
      : (toolMeta.result!.data ?? toolMeta.result)
    : undefined;
  // oxlint-enable typescript/no-non-null-assertion

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
    <div className="my-1">
      <Collapsible open={open} onOpenChange={isExpandable ? setOpen : undefined}>
        <CollapsibleTrigger
          disabled={!isExpandable}
          className={cn(
            'flex items-center gap-2 w-full rounded-lg px-2.5 py-0.5 text-[11px] transition-colors',
            isPending && 'text-primary/80',
            isError && 'text-destructive/80',
            isExpandable && 'cursor-pointer hover:bg-muted/40',
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
            <ToolDataScrollable data={expandableData} isError={isError} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// =====================================
// PlanStepsBubble — renders set_plan / update_plan as a step list
// =====================================

function PlanStepsBubble({
  data,
  isLatestPlan,
}: {
  data: Record<string, unknown>;
  isLatestPlan: boolean;
}) {
  const steps = (data.steps ?? []) as Array<{
    index: number;
    title: string;
    status: string;
  }>;
  const summary = data.summary as string | undefined;
  const progress = data.progress as string | undefined;

  const stepIcon = (status: string) => {
    switch (status) {
      case 'done':
        return <CheckCircle2 className="size-3.5 text-success shrink-0" />;
      case 'in_progress':
        // Only animate spinner for the most recent plan bubble
        return isLatestPlan ? (
          <Loader2 className="size-3.5 text-primary animate-spin shrink-0" />
        ) : (
          <CheckCircle2 className="size-3.5 text-success shrink-0" />
        );
      case 'skipped':
        return <SkipForward className="size-3.5 text-muted-foreground/50 shrink-0" />;
      default:
        return <Circle className="size-3.5 text-muted-foreground/40 shrink-0" />;
    }
  };

  return (
    <div className="my-1.5 ml-6">
      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px]">
        {summary && <div className="font-medium text-foreground/80 mb-1.5">{summary}</div>}
        {progress && <div className="text-[10px] text-muted-foreground/60 mb-1.5">{progress}</div>}
        <ol className="space-y-1">
          {steps.map((step) => (
            <li key={step.index} className="flex items-start gap-1.5">
              <span className="mt-0.5">{stepIcon(step.status)}</span>
              <span
                className={cn(
                  'leading-snug',
                  step.status === 'done' &&
                    'text-foreground/60 line-through decoration-foreground/20',
                  step.status === 'skipped' &&
                    'text-muted-foreground/40 line-through decoration-muted-foreground/20',
                  step.status === 'in_progress' &&
                    (isLatestPlan
                      ? 'text-foreground/90 font-medium'
                      : 'text-foreground/60 line-through decoration-foreground/20'),
                  step.status === 'pending' &&
                    (isLatestPlan ? 'text-foreground/70' : 'text-foreground/60'),
                )}
              >
                {step.title}
              </span>
            </li>
          ))}
        </ol>
      </div>
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
  if (data === null || data === undefined) {
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
