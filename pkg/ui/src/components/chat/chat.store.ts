/**
 * Chat Store (Zustand)
 *
 * Manages the chat assistant UI state: messages, streaming status,
 * panel visibility, and the SSE connection lifecycle.
 *
 * Messages are scoped per flow — each flow has its own conversation.
 * The store auto-loads messages from the backend when switching flows
 * and saves them when the conversation changes.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools } from 'zustand/middleware';

// =====================================
// Types
// =====================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  toolCallId?: string;
  /** Metadata for rendering tool call/result UI */
  toolMeta?: {
    toolName: string;
    args?: Record<string, unknown>;
    result?: { success: boolean; data?: unknown; error?: string };
    status: 'pending' | 'done' | 'error';
    startedAt?: number;
    durationMs?: number;
  };
  createdAt: number;
}

export interface ChatStreamEvent {
  type: 'text_delta' | 'tool_call_start' | 'tool_call_result' | 'ui_action' | 'error' | 'done';
  text?: string;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  result?: { success: boolean; data?: unknown; error?: string };
  action?: string;
  data?: Record<string, unknown>;
  message?: string;
  recoverable?: boolean;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

export interface ChatSettings {
  /** Max tool-calling steps per message (1-200, default 50) */
  maxSteps: number;
  /** Selected credential ID for the chat assistant LLM provider */
  credentialId: string | null;
}

const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  maxSteps: 50,
  credentialId: null,
};

// =====================================
// State & Actions
// =====================================

interface ChatState {
  /** Whether the chat panel is open */
  isOpen: boolean;
  /** The flow ID the current messages belong to (null = no flow) */
  activeFlowId: string | null;
  /** All messages in the current conversation (for the active flow) */
  messages: ChatMessage[];
  /** Whether we're loading messages from the backend */
  isLoadingHistory: boolean;
  /** Whether the assistant is currently streaming a response */
  isStreaming: boolean;
  /** Active AbortController for cancelling the stream */
  abortController: AbortController | null;
  /** Accumulated text for the current streaming assistant message */
  streamingText: string;
  /** Error message to display */
  error: string | null;
  /** Prompt queued from the overlay — ChatPanel consumes and clears it */
  pendingPrompt: string | null;
  /** Whether messages have been modified since last save */
  _dirty: boolean;
  /** Whether the settings panel is open */
  isSettingsPanelOpen: boolean;
  /** Chat settings (persisted to localStorage) */
  settings: ChatSettings;
}

interface ChatActions {
  togglePanel: () => void;
  setOpen: (open: boolean) => void;
  /** Switch to a different flow's conversation. Clears current messages in-memory. */
  setActiveFlow: (flowId: string | null) => void;
  /** Load messages from the backend into the store */
  loadMessages: (messages: ChatMessage[]) => void;
  setLoadingHistory: (loading: boolean) => void;
  addUserMessage: (content: string) => string;
  startStreaming: (controller: AbortController) => void;
  appendStreamingText: (text: string) => void;
  addToolCallMessage: (toolName: string, toolCallId: string, args: Record<string, unknown>) => void;
  updateToolCallResult: (
    toolCallId: string,
    result: { success: boolean; data?: unknown; error?: string },
  ) => void;
  finalizeAssistantMessage: () => void;
  stopStreaming: () => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  /** Mark any pending tool calls as errored (stream ended before result arrived) */
  finalizePendingToolCalls: () => void;
  /** Queue a prompt from the overlay — opens the panel automatically */
  setPendingPrompt: (prompt: string) => void;
  /** Consume (clear) the pending prompt — called by ChatPanel after sending */
  consumePendingPrompt: () => string | null;
  /** Mark messages as synced (not dirty) */
  markClean: () => void;
  /** Check if messages need saving */
  isDirty: () => boolean;
  /** Get messages suitable for backend persistence */
  getSerializableMessages: () => Array<{
    role: ChatMessage['role'];
    content: string;
    toolMeta?: Record<string, unknown> | null;
  }>;
  /** Toggle the settings panel open/closed */
  toggleSettingsPanel: () => void;
  /** Update chat settings (merges with existing) */
  updateSettings: (patch: Partial<ChatSettings>) => void;
  /** Truncate messages from a given message ID onwards (for edit+resend) */
  truncateFrom: (messageId: string) => void;
}

type ChatStore = ChatState & ChatActions;

let messageIdCounter = 0;
function genId(): string {
  return `msg_${Date.now()}_${++messageIdCounter}`;
}

function loadPersistedSettings(): ChatSettings {
  try {
    const raw = localStorage.getItem('invect-chat-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CHAT_SETTINGS, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_CHAT_SETTINGS;
}

const initialState: ChatState = {
  isOpen: false,
  activeFlowId: null,
  messages: [],
  isLoadingHistory: false,
  isStreaming: false,
  abortController: null,
  streamingText: '',
  error: null,
  pendingPrompt: null,
  _dirty: false,
  isSettingsPanelOpen: false,
  settings: loadPersistedSettings(),
};

// =====================================
// Store
// =====================================

export const useChatStore = create<ChatStore>()(
  devtools(
    immer((set, get) => ({
      ...initialState,

      togglePanel: () =>
        set((s) => {
          s.isOpen = !s.isOpen;
        }),

      setOpen: (open) =>
        set((s) => {
          s.isOpen = open;
        }),

      setActiveFlow: (flowId) =>
        set((s) => {
          if (s.activeFlowId === flowId) {
            return;
          }
          s.activeFlowId = flowId;
          s.messages = [];
          s.streamingText = '';
          s.error = null;
          s._dirty = false;
          s.isLoadingHistory = false;
        }),

      loadMessages: (messages) =>
        set((s) => {
          s.messages = messages;
          s._dirty = false;
          s.isLoadingHistory = false;
        }),

      setLoadingHistory: (loading) =>
        set((s) => {
          s.isLoadingHistory = loading;
        }),

      addUserMessage: (content) => {
        const id = genId();
        set((s) => {
          s.messages.push({
            id,
            role: 'user',
            content,
            createdAt: Date.now(),
          });
          s.error = null;
          s._dirty = true;
        });
        return id;
      },

      startStreaming: (controller) =>
        set((s) => {
          s.isStreaming = true;
          s.abortController = controller as unknown as AbortController; // immer doesn't proxy AbortController
          s.streamingText = '';
        }),

      appendStreamingText: (text) =>
        set((s) => {
          s.streamingText += text;
        }),

      addToolCallMessage: (toolName, toolCallId, args) =>
        set((s) => {
          // Commit any accumulated streaming text as a separate message BEFORE
          // the tool call so that text and tool calls interleave chronologically.
          if (s.streamingText.trim()) {
            s.messages.push({
              id: genId(),
              role: 'assistant',
              content: s.streamingText,
              createdAt: Date.now(),
            });
            s.streamingText = '';
            s._dirty = true;
          }
          s.messages.push({
            id: genId(),
            role: 'assistant',
            content: '',
            toolMeta: { toolName, args, status: 'pending', startedAt: Date.now() },
            createdAt: Date.now(),
          });
          s._dirty = true;
        }),

      updateToolCallResult: (toolCallId, result) =>
        set((s) => {
          // Find the last tool call message with matching pending status
          for (let i = s.messages.length - 1; i >= 0; i--) {
            const msg = s.messages[i];
            if (msg?.toolMeta && msg.toolMeta.status === 'pending') {
              msg.toolMeta.result = result;
              msg.toolMeta.status = result.success ? 'done' : 'error';
              if (msg.toolMeta.startedAt) {
                msg.toolMeta.durationMs = Date.now() - msg.toolMeta.startedAt;
              }
              s._dirty = true;
              break;
            }
          }
        }),

      finalizeAssistantMessage: () =>
        set((s) => {
          if (s.streamingText.trim()) {
            s.messages.push({
              id: genId(),
              role: 'assistant',
              content: s.streamingText,
              createdAt: Date.now(),
            });
            s._dirty = true;
          }
          s.streamingText = '';
          s.isStreaming = false;
          s.abortController = null;
        }),

      stopStreaming: () => {
        const controller = get().abortController;
        if (controller) {
          try {
            controller.abort();
          } catch {
            // ignore
          }
        }
        set((s) => {
          // Finalize any partial text
          if (s.streamingText.trim()) {
            s.messages.push({
              id: genId(),
              role: 'assistant',
              content: s.streamingText,
              createdAt: Date.now(),
            });
            s._dirty = true;
          }
          s.streamingText = '';
          s.isStreaming = false;
          s.abortController = null;
        });
      },

      setError: (error) =>
        set((s) => {
          s.error = error;
          s.isStreaming = false;
          s.abortController = null;
        }),

      finalizePendingToolCalls: () =>
        set((s) => {
          for (const msg of s.messages) {
            if (msg.toolMeta && msg.toolMeta.status === 'pending') {
              msg.toolMeta.status = 'error';
              msg.toolMeta.result = {
                success: false,
                error: 'Stream ended before tool completed',
              };
              s._dirty = true;
            }
          }
        }),

      setPendingPrompt: (prompt) =>
        set((s) => {
          s.pendingPrompt = prompt;
          s.isOpen = true;
        }),

      consumePendingPrompt: () => {
        const prompt = get().pendingPrompt;
        if (prompt) {
          set((s) => {
            s.pendingPrompt = null;
          });
        }
        return prompt;
      },

      clearMessages: () =>
        set((s) => {
          s.messages = [];
          s.streamingText = '';
          s.error = null;
          s._dirty = true;
        }),

      markClean: () =>
        set((s) => {
          s._dirty = false;
        }),

      isDirty: () => get()._dirty,

      getSerializableMessages: () => {
        return get().messages.map((m) => ({
          role: m.role,
          content: m.content,
          toolMeta: m.toolMeta ? (m.toolMeta as unknown as Record<string, unknown>) : null,
        }));
      },

      toggleSettingsPanel: () =>
        set((s) => {
          s.isSettingsPanelOpen = !s.isSettingsPanelOpen;
        }),

      updateSettings: (patch) =>
        set((s) => {
          const next = { ...s.settings, ...patch };
          s.settings = next;
          // Persist to localStorage
          try {
            localStorage.setItem('invect-chat-settings', JSON.stringify(next));
          } catch {
            // ignore
          }
        }),

      truncateFrom: (messageId) =>
        set((s) => {
          const idx = s.messages.findIndex((m) => m.id === messageId);
          if (idx !== -1) {
            s.messages = s.messages.slice(0, idx);
            s._dirty = true;
          }
        }),
    })),
    { name: 'chat' },
  ),
);

// Selector hooks
export const useChatOpen = () => useChatStore((s) => s.isOpen);
const useChatMessages = () => useChatStore((s) => s.messages);
const useChatStreaming = () => useChatStore((s) => s.isStreaming);
const useChatStreamingText = () => useChatStore((s) => s.streamingText);
const useChatError = () => useChatStore((s) => s.error);
const useChatPendingPrompt = () => useChatStore((s) => s.pendingPrompt);
const useChatSettingsPanelOpen = () => useChatStore((s) => s.isSettingsPanelOpen);
const useChatSettings = () => useChatStore((s) => s.settings);
