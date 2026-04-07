/**
 * Chat Toolkit
 *
 * Registry of all chat tools available to the AI assistant.
 * Handles tool registration, parameter validation (Zod), and execution dispatch.
 *
 * Phase 1: Ships with zero tools — the LLM can only have text conversations.
 * Phase 2+: Tools are added in groups (flow, node, run, action, credential, trigger).
 */

import { z } from 'zod/v4';
import type { AgentToolDefinition } from 'src/types/agent-tool.types';
import type { Logger } from 'src/schemas';
import type { ChatToolDefinition, ChatToolContext, ChatToolResult } from './chat-types';
import { allChatTools } from './tools';

/**
 * ChatToolkit manages the set of tools available to the chat assistant.
 *
 * Tools are plain objects with Zod schemas and execute functions.
 * The toolkit converts them to AgentToolDefinition format for the LLM adapters.
 */
export class ChatToolkit {
  private tools = new Map<string, ChatToolDefinition>();

  constructor(private readonly logger: Logger) {
    this.registerBuiltinTools();
  }

  // =====================================
  // REGISTRATION
  // =====================================

  /**
   * Register a single chat tool.
   */
  register(tool: ChatToolDefinition): void {
    if (this.tools.has(tool.id)) {
      this.logger.warn(`Chat tool "${tool.id}" already registered, overwriting`);
    }
    this.tools.set(tool.id, tool);
  }

  /**
   * Register multiple chat tools.
   */
  registerMany(tools: ChatToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  // =====================================
  // TOOL LOOKUP
  // =====================================

  /**
   * Get a tool by ID.
   */
  get(id: string): ChatToolDefinition | undefined {
    return this.tools.get(id);
  }

  /**
   * Get all registered tool definitions.
   */
  getAll(): ChatToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool count.
   */
  get size(): number {
    return this.tools.size;
  }

  // =====================================
  // LLM TOOL FORMAT CONVERSION
  // =====================================

  /**
   * Convert all registered tools to AgentToolDefinition format.
   * This is what the existing OpenAI/Anthropic adapters expect.
   */
  getToolDefinitions(): AgentToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      inputSchema: this.zodToJsonSchema(tool.parameters),
      category: 'utility' as const,
    }));
  }

  // =====================================
  // EXECUTION
  // =====================================

  /**
   * Execute a tool by name with the given input.
   * Handles Zod validation and error wrapping.
   */
  async executeTool(
    toolName: string,
    rawInput: unknown,
    ctx: ChatToolContext,
  ): Promise<ChatToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: "${toolName}". Available tools: ${Array.from(this.tools.keys()).join(', ')}`,
        errorType: 'UnknownToolError',
      };
    }

    // LLMs sometimes send JSON-encoded strings for object/array fields.
    // Pre-process to parse them before Zod validation.
    const preprocessed = this.coerceJsonStringFields(rawInput);

    // Validate parameters with Zod
    const parsed = tool.parameters.safeParse(preprocessed);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid parameters for "${toolName}": ${parsed.error?.message ?? 'Validation failed'}`,
        errorType: 'ValidationError',
      };
    }

    // Execute with error wrapping
    try {
      return await tool.execute(parsed.data, ctx);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';

      this.logger.error(`Chat tool "${toolName}" execution failed:`, { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
        errorType,
      };
    }
  }

  // =====================================
  // PRIVATE
  // =====================================

  /**
   * Register built-in tools.
   */
  private registerBuiltinTools(): void {
    this.registerMany(allChatTools);
    this.logger.debug(`ChatToolkit initialized with ${this.tools.size} tools`);
  }

  /**
   * Convert a Zod schema to JSON Schema for the LLM tool definitions.
   * Uses Zod v4's built-in JSON Schema support.
   */
  private zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
    try {
      return z.toJSONSchema(schema) as Record<string, unknown>;
    } catch {
      // Fallback for schemas that can't be converted
      return { type: 'object', properties: {} };
    }
  }

  /**
   * LLMs sometimes send JSON-encoded strings for fields that should be objects or arrays.
   * For example, params: '{"key": "value"}' instead of params: {"key": "value"}.
   * This method walks the top-level fields of the input and attempts to JSON.parse
   * any string values that look like JSON objects or arrays.
   */
  private coerceJsonStringFields(input: unknown): unknown {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return input;
    }
    const result: Record<string, unknown> = { ...(input as Record<string, unknown>) };
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (
          (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
          try {
            result[key] = JSON.parse(trimmed);
          } catch {
            // Not valid JSON — keep the original string
          }
        }
      }
    }
    return result;
  }
}
