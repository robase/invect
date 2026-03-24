/**
 * Chat Stream Session
 *
 * Per-request streaming session that orchestrates the LLM conversation loop.
 * Implements the core streaming loop:
 *   1. Build system prompt with flow context
 *   2. Call LLM via existing adapters (Anthropic/OpenAI)
 *   3. On tool_use → execute tool → feed result back → continue
 *   4. Yield ChatStreamEvents as an async generator
 *
 * The session is stateless between requests — the frontend sends the full
 * message history with each POST. The session only holds per-request state
 * (draft accumulator, abort flag, usage counters).
 */

import type { Logger } from 'src/types/schemas';
import type { AgentMessage, AgentPromptResult } from 'src/types/agent-tool.types';
import type { ProviderAdapter } from '../ai/provider-adapter';
import type { InvectIdentity } from 'src/types/auth.types';
import type {
  ChatMessage,
  ChatContext,
  ChatStreamEvent,
  ChatToolContext,
  ResolvedChatConfig,
  ChatUsage,
} from './chat-types';
import type { ChatToolkit } from './chat-toolkit';
import type { FlowContextData } from './system-prompt';
import { buildSystemPrompt } from './system-prompt';
import type { ActionRegistry } from 'src/actions';

/**
 * Dependencies injected into the session from the ChatStreamService.
 */
export interface ChatStreamSessionDeps {
  logger: Logger;
  toolkit: ChatToolkit;
  config: ResolvedChatConfig;
  adapter: ProviderAdapter;
  identity?: InvectIdentity;
  /** The Invect core instance (passed as unknown to avoid circular import) */
  invect: unknown;
  /** Action registry for provider summary in system prompt */
  actionRegistry: ActionRegistry | null;
}

/**
 * A single chat streaming session (one per user message).
 */
export class ChatStreamSession {
  private aborted = false;
  private usage: ChatUsage = {};

  constructor(private readonly deps: ChatStreamSessionDeps) {}

  /**
   * Main streaming loop — yields ChatStreamEvents.
   *
   * Framework adapters consume this and write SSE frames:
   * ```typescript
   * for await (const event of session.stream(messages, context)) {
   *   res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
   * }
   * ```
   */
  async *stream(
    messages: ChatMessage[],
    context: ChatContext,
    flowContext: FlowContextData | null,
  ): AsyncGenerator<ChatStreamEvent> {
    const { logger, toolkit, config, adapter } = this.deps;

    try {
      // 1. Build system prompt with dynamic context
      const systemPrompt = buildSystemPrompt({
        flowContext,
        actionRegistry: this.deps.actionRegistry,
      });

      // 2. Truncate message history
      const truncatedMessages = this.truncateHistory(messages, config.maxHistoryMessages);

      // 3. Get tool definitions for the LLM — filter contextually
      let toolDefs = toolkit.getToolDefinitions();

      // Remove agent-node-specific tools when no AGENT node exists in the flow.
      // These 6 tools add ~900 tokens of schema noise that degrades tool selection.
      if (flowContext) {
        const hasAgentNode = flowContext.nodes.some(
          (n) => n.type === 'AGENT' || n.type === 'agent',
        );
        if (!hasAgentNode) {
          const agentToolIds = new Set([
            'list_agent_tools',
            'get_agent_node_tools',
            'add_tool_to_agent',
            'remove_tool_from_agent',
            'update_agent_tool',
            'configure_agent',
          ]);
          toolDefs = toolDefs.filter((t) => !agentToolIds.has(t.id));
        }
      }

      // 4. Convert ChatMessages to AgentMessages for the adapter
      const conversationMessages = this.toAgentMessages(truncatedMessages);

      let steps = 0;

      while (steps < config.maxSteps && !this.aborted) {
        steps++;

        logger.debug(`Chat stream step ${steps}/${config.maxSteps}`, {
          messageCount: conversationMessages.length,
          toolCount: toolDefs.length,
        });

        // 5. Call the LLM via the existing adapter
        let response: AgentPromptResult;
        try {
          response = await adapter.executeAgentPrompt({
            model: config.model,
            messages: conversationMessages,
            tools: toolDefs,
            systemPrompt,
            maxTokens: 4096,
          });
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.error('LLM call failed in chat stream:', { error: msg });
          yield { type: 'error', message: `LLM call failed: ${msg}`, recoverable: false };
          return;
        }

        // 6. Yield text content
        if (response.content) {
          yield { type: 'text_delta', text: response.content };
        }

        // 7. If no tool calls, we're done
        if (response.type !== 'tool_use' || !response.toolCalls?.length) {
          break;
        }

        // 8. Execute tool calls
        for (const toolCall of response.toolCalls) {
          if (this.aborted) {
            break;
          }

          yield {
            type: 'tool_call_start',
            toolName: toolCall.toolId,
            toolCallId: toolCall.id,
            args: toolCall.input,
          };

          // Build tool context
          const toolCtx: ChatToolContext = {
            invect: this.deps.invect,
            identity: this.deps.identity,
            chatContext: context,
          };

          // Execute tool
          const result = await toolkit.executeTool(toolCall.toolId, toolCall.input, toolCtx);

          yield {
            type: 'tool_call_result',
            toolName: toolCall.toolId,
            toolCallId: toolCall.id,
            result,
          };

          // Emit UI action if tool requested one
          if (result.uiAction) {
            yield {
              type: 'ui_action',
              action: result.uiAction.action,
              data: result.uiAction.data,
            };
          }

          // Append tool call + result to conversation for next LLM iteration
          conversationMessages.push({
            role: 'assistant',
            content: response.content || '',
            toolCalls: [
              {
                id: toolCall.id,
                toolId: toolCall.toolId,
                input: toolCall.input,
              },
            ],
          });
          conversationMessages.push({
            role: 'tool',
            content: JSON.stringify(result),
            toolCallId: toolCall.id,
          });
        }
      }

      // If we hit the step limit, let the user know
      if (steps >= config.maxSteps && !this.aborted) {
        yield {
          type: 'text_delta',
          text:
            '\n\n---\n' +
            `⚠️ I've reached the maximum number of steps (${config.maxSteps}) for a single message. ` +
            'You can send another message to continue where I left off.',
        };
      }

      // Yield completion event
      yield { type: 'done', usage: this.usage };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Chat stream session error:', { error: msg });
      yield { type: 'error', message: msg, recoverable: false };
    }
  }

  /**
   * Abort the stream (called when client disconnects or user clicks Stop).
   */
  abort(): void {
    this.aborted = true;
  }

  // =====================================
  // PRIVATE HELPERS
  // =====================================

  /**
   * Truncate message history to keep within token budget.
   * Keeps the most recent N messages.
   */
  private truncateHistory(messages: ChatMessage[], maxMessages: number): ChatMessage[] {
    if (messages.length <= maxMessages) {
      return messages;
    }

    // Keep the last maxMessages messages
    let truncated = messages.slice(-maxMessages);

    // Rough token safety rail: ~4 chars per token, cap at 100k tokens
    // to prevent large tool results from blowing the context window.
    const TOKEN_BUDGET = 100_000;
    const estimateTokens = (msgs: ChatMessage[]) =>
      msgs.reduce((sum, m) => sum + Math.ceil((m.content?.length ?? 0) / 4), 0);

    let estimatedTokens = estimateTokens(truncated);
    while (estimatedTokens > TOKEN_BUDGET && truncated.length > 2) {
      truncated = truncated.slice(1);
      estimatedTokens = estimateTokens(truncated);
    }

    this.deps.logger.debug(
      `Truncated chat history from ${messages.length} to ${truncated.length} messages (~${estimatedTokens} est. tokens)`,
    );

    return truncated;
  }

  /**
   * Convert ChatMessage[] to AgentMessage[] for the existing adapters.
   * The adapters expect AgentMessage format.
   */
  private toAgentMessages(messages: ChatMessage[]): AgentMessage[] {
    return messages
      .filter((m) => m.role !== 'system') // System prompt is passed separately
      .map((m) => ({
        role: m.role as 'user' | 'assistant' | 'tool',
        content: m.content,
        toolCalls: m.toolCalls?.map((tc) => ({
          id: tc.id,
          toolId: tc.name,
          input: tc.input,
        })),
        toolCallId: m.toolCallId,
      }));
  }
}
