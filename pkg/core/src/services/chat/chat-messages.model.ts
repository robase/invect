/**
 * Chat Messages Model — adapter-based implementation
 *
 * CRUD operations for persisted chat messages, scoped to flows.
 */

import type { InvectAdapter } from '../../database/adapter';
import type { Logger } from 'src/schemas';
import { randomUUID } from 'crypto';

// =====================================
// Entity types
// =====================================

export interface ChatMessageRecord {
  id: string;
  flowId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolMeta?: Record<string, unknown> | null;
  createdAt: string | Date;
}

export interface CreateChatMessageInput {
  flowId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolMeta?: Record<string, unknown> | null;
}

// =====================================
// Model
// =====================================

const TABLE = 'chat_messages';

export class ChatMessagesModel {
  constructor(
    private readonly adapter: InvectAdapter,
    private readonly logger: Logger,
  ) {}

  /**
   * Get all messages for a flow, ordered by creation time (oldest first).
   */
  async getByFlowId(flowId: string): Promise<ChatMessageRecord[]> {
    try {
      const results = await this.adapter.findMany<Record<string, unknown>>({
        model: TABLE,
        where: [{ field: 'flow_id', value: flowId }],
        sortBy: { field: 'created_at', direction: 'asc' },
      });
      return results.map((r) => this.normalize(r));
    } catch (error) {
      this.logger.error('Failed to get chat messages by flowId', { flowId, error });
      throw error;
    }
  }

  /**
   * Create a single chat message.
   */
  async create(input: CreateChatMessageInput): Promise<ChatMessageRecord> {
    const id = randomUUID();
    try {
      await this.adapter.create({
        model: TABLE,
        data: {
          id,
          flow_id: input.flowId,
          role: input.role,
          content: input.content,
          tool_meta: input.toolMeta ?? null,
          created_at: new Date(),
        },
      });

      return {
        id,
        flowId: input.flowId,
        role: input.role,
        content: input.content,
        toolMeta: input.toolMeta ?? null,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to create chat message', { input, error });
      throw error;
    }
  }

  /**
   * Create multiple chat messages in bulk (for saving an entire conversation).
   */
  async createMany(inputs: CreateChatMessageInput[]): Promise<ChatMessageRecord[]> {
    if (inputs.length === 0) {
      return [];
    }

    const records: ChatMessageRecord[] = [];
    const now = new Date().toISOString();

    try {
      for (const input of inputs) {
        const id = randomUUID();
        await this.adapter.create({
          model: TABLE,
          data: {
            id,
            flow_id: input.flowId,
            role: input.role,
            content: input.content,
            tool_meta: input.toolMeta ?? null,
            created_at: new Date(),
          },
        });
        records.push({
          id,
          flowId: input.flowId,
          role: input.role,
          content: input.content,
          toolMeta: input.toolMeta ?? null,
          createdAt: now,
        });
      }

      return records;
    } catch (error) {
      this.logger.error('Failed to create chat messages in bulk', { count: inputs.length, error });
      throw error;
    }
  }

  /**
   * Delete all chat messages for a flow.
   */
  async deleteByFlowId(flowId: string): Promise<void> {
    try {
      await this.adapter.delete({
        model: TABLE,
        where: [{ field: 'flow_id', value: flowId }],
      });
    } catch (error) {
      this.logger.error('Failed to delete chat messages by flowId', { flowId, error });
      throw error;
    }
  }

  // =====================================
  // Normalize
  // =====================================

  private normalize(raw: Record<string, unknown>): ChatMessageRecord {
    const toolMetaRaw = raw.tool_meta ?? raw.toolMeta;
    let toolMeta: Record<string, unknown> | null = null;
    if (toolMetaRaw) {
      toolMeta =
        typeof toolMetaRaw === 'string'
          ? JSON.parse(toolMetaRaw)
          : (toolMetaRaw as Record<string, unknown>);
    }

    return {
      id: String(raw.id),
      flowId: String(raw.flow_id ?? raw.flowId),
      role: String(raw.role) as ChatMessageRecord['role'],
      content: String(raw.content ?? ''),
      toolMeta,
      createdAt: (raw.created_at ?? raw.createdAt ?? new Date()) as string | Date,
    };
  }
}
