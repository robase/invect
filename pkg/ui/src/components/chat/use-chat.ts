/**
 * useChat Hook
 *
 * Manages the SSE streaming connection to POST /chat.
 * Reads events from the response body and dispatches them to the chat store.
 * Handles ui_action events from tools to refresh data and navigate.
 *
 * Messages are scoped per flow and automatically persisted to the backend.
 * When the active flowId changes, existing messages are saved and the new
 * flow's history is loaded from the server.
 */

import { useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiContext';
import { useChatStore } from './chat.store';
import { useFlowEditorStore } from '~/stores/flow-editor.store';
import { queryKeys } from '../../api/query-keys';
import { getAllMemoryNotes, saveMemoryNote, deleteMemoryNote } from './chat-memory';
import type { ChatStreamEvent, ChatMessage } from './chat.store';

interface UseChatOptions {
  flowId?: string;
  selectedNodeId?: string;
  selectedRunId?: string;
  viewMode?: 'edit' | 'runs';
  basePath?: string;
}

export function useChat(options: UseChatOptions = {}) {
  const apiClient = useApiClient();
  const store = useChatStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Refs for stable access inside the streaming loop (avoids stale closures)
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const apiClientRef = useRef(apiClient);
  apiClientRef.current = apiClient;

  // ─── Flow-scoped history: load/save on flow switch ───

  // Save current messages to backend
  const saveMessages = useCallback(async () => {
    const state = useChatStore.getState();
    if (!state.activeFlowId || !state.isDirty() || state.messages.length === 0) {
      return;
    }
    try {
      await apiClientRef.current.saveChatMessages(
        state.activeFlowId,
        state.getSerializableMessages(),
      );
      state.markClean();
    } catch (err) {
      // Non-critical — log but don't disrupt UX
      console.warn('[chat] Failed to save messages:', err);
    }
  }, []);

  // Load messages from backend for a given flow
  const loadMessages = useCallback(async (flowId: string) => {
    const state = useChatStore.getState();
    state.setLoadingHistory(true);
    try {
      const records = await apiClientRef.current.getChatMessages(flowId);
      const messages: ChatMessage[] = records.map((r, idx) => ({
        id: r.id || `loaded_${idx}`,
        role: r.role,
        content: r.content,
        toolMeta: r.toolMeta ? (r.toolMeta as ChatMessage['toolMeta']) : undefined,
        createdAt: new Date(r.createdAt).getTime(),
      }));
      useChatStore.getState().loadMessages(messages);
    } catch (err) {
      console.warn('[chat] Failed to load messages:', err);
      useChatStore.getState().setLoadingHistory(false);
    }
  }, []);

  // When flowId changes, save old conversation and load new one
  useEffect(() => {
    const currentActiveFlow = useChatStore.getState().activeFlowId;
    const newFlowId = options.flowId ?? null;

    if (currentActiveFlow === newFlowId) {
      return;
    }

    // Save messages for the old flow (fire-and-forget)
    saveMessages();

    // Switch to new flow
    useChatStore.getState().setActiveFlow(newFlowId);

    // Load messages for the new flow
    if (newFlowId) {
      loadMessages(newFlowId);
    }
  }, [options.flowId, saveMessages, loadMessages]);

  // Save messages when the window is about to unload
  useEffect(() => {
    const onBeforeUnload = () => {
      const state = useChatStore.getState();
      if (!state.activeFlowId || !state.isDirty() || state.messages.length === 0) {
        return;
      }
      // Use fetch with keepalive for reliability on tab close
      const url = `${apiClientRef.current.getBaseURL()}/chat/messages/${state.activeFlowId}`;
      const body = JSON.stringify({ messages: state.getSerializableMessages() });
      fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        // best-effort save on tab close — nothing to handle
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const sendMessage = useCallback(
    async (content: string, opts?: { isEdit?: boolean }) => {
      if (store.isStreaming || !content.trim()) {
        return;
      }

      // Add user message to store
      store.addUserMessage(content);

      // Build message history for the API (only user/assistant messages)
      const historyMessages = store.messages
        .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content))
        .map((m) => ({ role: m.role, content: m.content }));

      // When this is an edit+resend, inject a system-level note so the LLM
      // knows the flow may contain nodes/edges from the deleted conversation.
      if (opts?.isEdit) {
        historyMessages.push({
          role: 'user' as const,
          content:
            '[Note: I edited an earlier message. The conversation was rewound to this point, ' +
            'but the flow may still contain nodes or edges from the previous conversation that ' +
            'no longer match this chat history. Please use get_current_flow_context to check ' +
            'the actual flow state before making changes.]\n\n' +
            content,
        });
      } else {
        historyMessages.push({ role: 'user' as const, content });
      }

      const context = {
        flowId: optionsRef.current.flowId,
        selectedNodeId: optionsRef.current.selectedNodeId,
        selectedRunId: optionsRef.current.selectedRunId,
        viewMode: optionsRef.current.viewMode,
        maxSteps: useChatStore.getState().settings.maxSteps,
        credentialId: useChatStore.getState().settings.credentialId ?? undefined,
        model: useChatStore.getState().settings.model ?? undefined,
        memoryNotes: getAllMemoryNotes(optionsRef.current.flowId),
      };

      // Create abort controller
      const controller = new AbortController();
      store.startStreaming(controller);

      try {
        const response = await apiClient.sendChatMessage(
          historyMessages,
          context,
          controller.signal,
        );

        if (!response.body) {
          store.setError('No response body from chat endpoint');
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE frames from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              // Event type is parsed from the JSON payload, not the SSE frame header
            } else if (line.startsWith('data: ')) {
              const data = line.slice(6);
              try {
                const event: ChatStreamEvent = JSON.parse(data);
                handleEvent(event, store, {
                  queryClient,
                  navigate,
                  optionsRef,
                });
              } catch {
                // Ignore malformed JSON
              }
            }
            // Empty line = end of SSE frame (already handled by split)
          }
        }

        // Finalize: clean up pending tool calls and commit assistant text
        store.finalizePendingToolCalls();
        store.finalizeAssistantMessage();

        // Auto-save after stream completes
        saveMessages();
      } catch (error: unknown) {
        if ((error as Error).name === 'AbortError') {
          // User cancelled — clean up pending tool calls
          store.finalizePendingToolCalls();
          saveMessages();
          return;
        }
        // Clean up pending tool calls before showing the error
        store.finalizePendingToolCalls();
        saveMessages();
        const msg = (error as Error).message || 'Chat request failed';
        // Friendly error messages for common failures
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          store.setError('Connection lost — check that the server is running and try again.');
        } else if (msg.includes('503') || msg.includes('initializing')) {
          store.setError('Server is still starting up — please try again in a moment.');
        } else {
          store.setError(msg);
        }
      }
    },
    [
      apiClient,
      options.flowId,
      options.selectedNodeId,
      options.viewMode,
      store,
      queryClient,
      navigate,
      saveMessages,
    ],
  );

  // Wrap clearMessages to also delete from backend
  const clearMessages = useCallback(async () => {
    store.clearMessages();
    const flowId = options.flowId;
    if (flowId) {
      try {
        await apiClient.deleteChatMessages(flowId);
        store.markClean();
      } catch (err) {
        console.warn('[chat] Failed to delete messages on server:', err);
      }
    }
  }, [store, options.flowId, apiClient]);

  return {
    sendMessage,
    stopStreaming: store.stopStreaming,
    clearMessages,
    messages: store.messages,
    isStreaming: store.isStreaming,
    isLoadingHistory: store.isLoadingHistory,
    streamingText: store.streamingText,
    error: store.error,
    isOpen: store.isOpen,
    togglePanel: store.togglePanel,
    setOpen: store.setOpen,
    // Settings
    settings: store.settings,
    isSettingsPanelOpen: store.isSettingsPanelOpen,
    toggleSettingsPanel: store.toggleSettingsPanel,
    updateSettings: store.updateSettings,
  };
}

// =====================================
// UI Action Handler
// =====================================

interface UiActionContext {
  queryClient: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
  optionsRef: React.RefObject<UseChatOptions>;
}

/**
 * Handle a ui_action event from the chat stream.
 * Maps tool-emitted actions to query invalidation, navigation, and store updates.
 */
function handleUiAction(action: string, data: Record<string, unknown>, ctx: UiActionContext) {
  const { queryClient, navigate, optionsRef } = ctx;
  const basePath = optionsRef.current?.basePath ?? '';

  switch (action) {
    // ─── Flow was modified (new version published) ───
    case 'refresh_flow': {
      const flowId = (data.flowId as string) || optionsRef.current?.flowId;
      if (!flowId) {
        break;
      }

      // Reset dirty flag so syncFromServer accepts the new data
      const editorStore = useFlowEditorStore.getState();
      editorStore.resetDirty();

      // Invalidate React Query caches to trigger refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.reactFlow(flowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.flowVersions(flowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.flow(flowId) });

      // Select a specific node if the tool requested it
      const selectNodeId = data.selectNodeId as string | undefined;
      if (selectNodeId) {
        // Small delay to let the refetch land before selecting
        setTimeout(() => {
          useFlowEditorStore.getState().selectNode(selectNodeId);
        }, 300);
      }
      break;
    }

    // ─── Navigate to a different flow ───
    case 'navigate_to_flow': {
      const flowId = data.flowId as string;
      if (!flowId) {
        break;
      }
      navigate(`${basePath}/flow/${flowId}`);
      break;
    }

    // ─── Open a flow run (after execution) ───
    case 'open_flow_run': {
      const flowId = (data.flowId as string) || optionsRef.current?.flowId;
      const flowRunId = data.flowRunId as string;
      if (!flowId || !flowRunId) {
        break;
      }

      // Invalidate runs list so it includes the new run
      queryClient.invalidateQueries({ queryKey: queryKeys.executions(flowId) });

      // Navigate to runs view with the specific run selected
      navigate(`${basePath}/flow/${flowId}/runs?runId=${flowRunId}`);
      break;
    }

    // ─── Open credential setup modal ───
    case 'open_credential_setup': {
      // Navigate to credentials page
      navigate(`${basePath}/credentials`);
      break;
    }

    // ─── Plan tracking ───
    case 'show_plan':
    case 'update_plan': {
      const steps = data.steps as
        | Array<{
            index: number;
            title: string;
            status: string;
          }>
        | undefined;
      if (steps) {
        useChatStore.getState().setPlan({
          summary: (data.summary as string) ?? '',
          steps: steps.map((s) => ({
            index: s.index,
            title: s.title,
            status: s.status as 'pending' | 'in_progress' | 'done' | 'skipped',
          })),
        });
      }
      break;
    }

    // ─── Memory persistence (browser-local) ───
    case 'save_memory_note': {
      const scope = data.scope as 'flow' | 'workspace';
      const content = data.content as string;
      const flowId = data.flowId as string;
      if (content) {
        saveMemoryNote(scope, content, flowId || undefined);
      }
      break;
    }
    case 'delete_memory_note': {
      const scope = data.scope as 'flow' | 'workspace';
      const content = data.content as string;
      const flowId = data.flowId as string;
      if (content) {
        deleteMemoryNote(scope, content, flowId || undefined);
      }
      break;
    }

    default:
      console.log('[chat] Unhandled ui_action:', action, data);
  }
}

// =====================================
// Event Dispatcher
// =====================================

/**
 * Dispatch a single SSE event to the chat store.
 */
function handleEvent(
  event: ChatStreamEvent,
  store: ReturnType<typeof useChatStore.getState>,
  uiCtx: UiActionContext,
) {
  switch (event.type) {
    case 'text_delta':
      if (event.text) {
        store.appendStreamingText(event.text);
      }
      break;

    case 'tool_call_start':
      if (event.toolName && event.toolCallId) {
        store.addToolCallMessage(event.toolName, event.toolCallId, event.args ?? {});
      }
      break;

    case 'tool_call_result':
      if (event.toolCallId && event.result) {
        store.updateToolCallResult(event.toolCallId, event.result);
      }
      break;

    case 'error':
      if (event.message) {
        store.setError(event.message);
      }
      break;

    case 'done':
      // Stream complete — finalizeAssistantMessage is called by the main loop
      break;

    case 'suggestions':
      if (event.suggestions && Array.isArray(event.suggestions)) {
        useChatStore.getState().setSuggestions(event.suggestions);
      }
      break;

    case 'ui_action':
      if (event.action) {
        handleUiAction(event.action, event.data ?? {}, uiCtx);
      }
      break;
  }
}
