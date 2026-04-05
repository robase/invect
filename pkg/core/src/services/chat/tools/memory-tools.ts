/**
 * Chat Tools — Memory (browser-local)
 *
 * Tools for reading and writing persistent notes across chat sessions.
 * Notes are stored in the browser's localStorage (not in the database).
 *
 * Two scopes:
 *   - "flow"      → notes about a specific flow
 *   - "workspace"  → user preferences and patterns (shared across all flows)
 *
 * The tools emit ui_action events so the frontend can persist changes.
 * On each request, the frontend sends current notes via context.memoryNotes.
 */

import { z } from 'zod/v4';
import type { ChatToolDefinition, ChatToolContext, ChatToolResult } from '../chat-types';

// =====================================
// save_note
// =====================================

export const saveNoteTool: ChatToolDefinition = {
  id: 'save_note',
  name: 'Save Note',
  description:
    'Save a persistent note that will be remembered across chat sessions. ' +
    'Use this to record important context like:\n' +
    '- Flow-specific info: "This flow processes support tickets from Zendesk"\n' +
    '- User preferences: "User prefers claude-sonnet for AI nodes"\n' +
    '- Credential mappings: "Gmail credential is called gmail-work"\n' +
    '- Patterns: "Always add retry logic on HTTP request nodes"\n\n' +
    'Notes are automatically loaded at the start of each conversation.',
  parameters: z.object({
    content: z
      .string()
      .describe('The note content. Keep it concise — one key fact or preference per note.'),
    scope: z
      .enum(['flow', 'workspace'])
      .default('flow')
      .describe(
        '"flow" for notes about the current flow (default), "workspace" for global preferences',
      ),
  }),
  async execute(params: unknown, ctx: ChatToolContext): Promise<ChatToolResult> {
    const { content, scope } = params as { content: string; scope: 'flow' | 'workspace' };
    const flowId = ctx.chatContext.flowId;

    if (scope === 'flow' && !flowId) {
      return { success: false, error: 'Cannot save flow-scoped note — no flow is open' };
    }

    return {
      success: true,
      data: {
        scope,
        message: `Note saved (${scope} scope). It will be available in future conversations.`,
      },
      uiAction: {
        action: 'save_memory_note',
        data: { scope, content, flowId: flowId ?? '' },
      },
    };
  },
};

// =====================================
// recall_notes
// =====================================

export const recallNotesTool: ChatToolDefinition = {
  id: 'recall_notes',
  name: 'Recall Notes',
  description:
    'Retrieve previously saved notes. ' +
    'Flow-scoped notes are loaded automatically at conversation start, but use this tool to:\n' +
    '- Check workspace-wide preferences\n' +
    '- Refresh your memory about what was noted\n' +
    '- See all notes for the current flow',
  parameters: z.object({
    scope: z
      .enum(['flow', 'workspace', 'both'])
      .default('both')
      .describe(
        '"flow" for current flow notes, "workspace" for global preferences, "both" for all',
      ),
  }),
  async execute(params: unknown, ctx: ChatToolContext): Promise<ChatToolResult> {
    const { scope } = params as { scope: 'flow' | 'workspace' | 'both' };
    const memory = ctx.chatContext.memoryNotes;

    const results: Array<{ scope: string; content: string }> = [];

    if (memory) {
      if ((scope === 'flow' || scope === 'both') && memory.flowNotes) {
        results.push(...memory.flowNotes.map((n) => ({ scope: 'flow', content: n })));
      }
      if ((scope === 'workspace' || scope === 'both') && memory.workspaceNotes) {
        results.push(...memory.workspaceNotes.map((n) => ({ scope: 'workspace', content: n })));
      }
    }

    return {
      success: true,
      data: {
        total: results.length,
        notes: results,
        ...(results.length === 0 && {
          hint: 'No notes saved yet. Use save_note to record important context.',
        }),
      },
    };
  },
};

// =====================================
// delete_note
// =====================================

export const deleteNoteTool: ChatToolDefinition = {
  id: 'delete_note',
  name: 'Delete Note',
  description:
    'Delete a previously saved note by its content (exact match). ' +
    'Use recall_notes first to see all notes, then specify the content of the one to delete.',
  parameters: z.object({
    content: z.string().describe('The exact content of the note to delete'),
    scope: z
      .enum(['flow', 'workspace'])
      .default('flow')
      .describe('The scope of the note to delete'),
  }),
  async execute(params: unknown, ctx: ChatToolContext): Promise<ChatToolResult> {
    const { content, scope } = params as { content: string; scope: 'flow' | 'workspace' };
    const flowId = ctx.chatContext.flowId;

    return {
      success: true,
      data: { message: 'Note deleted.' },
      uiAction: {
        action: 'delete_memory_note',
        data: { scope, content, flowId: flowId ?? '' },
      },
    };
  },
};

// =====================================
// Export
// =====================================

export const memoryTools: ChatToolDefinition[] = [saveNoteTool, recallNotesTool, deleteNoteTool];
