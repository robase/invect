/**
 * Chat Tools — Credential Management
 *
 * Tools for creating and managing credentials via the chat assistant.
 * The `request_credential` tool renders an inline form in the chat
 * for the user to provide their API key / credential details.
 */

import { z } from 'zod/v4';
import type { ChatToolDefinition, ChatToolContext, ChatToolResult } from '../chat-types';
import type { Invect } from 'src/invect-core';

// =====================================
// request_credential
// =====================================

export const requestCredentialTool: ChatToolDefinition = {
  id: 'request_credential',
  name: 'Request Credential',
  description:
    'Ask the user to provide a credential (e.g. API key, bearer token). ' +
    'This renders an inline form in the chat where the user can enter their ' +
    'credential details. Use this when a flow node needs a credential that ' +
    'does not exist yet, or when the user asks to set up a new API key. ' +
    'You must specify the auth type (apiKey, bearer, basic, or custom) and ' +
    'a suggested name for the credential.',
  parameters: z.object({
    suggestedName: z
      .string()
      .describe('Suggested name for the credential (e.g. "OpenAI API Key", "Slack Bot Token")'),
    authType: z
      .enum(['apiKey', 'bearer', 'basic', 'custom'])
      .default('apiKey')
      .describe('Authentication type for the credential'),
    description: z.string().optional().describe('Brief description of what this credential is for'),
    provider: z
      .string()
      .optional()
      .describe('Provider or service name (e.g. "OpenAI", "Anthropic", "Slack")'),
  }),
  async execute(params: unknown, _ctx: ChatToolContext): Promise<ChatToolResult> {
    const { suggestedName, authType, description, provider } = params as {
      suggestedName: string;
      authType: string;
      description?: string;
      provider?: string;
    };

    return {
      success: true,
      data: {
        formType: 'credential',
        suggestedName,
        authType,
        description,
        provider,
      },
      uiAction: {
        action: 'show_credential_form',
        data: {
          suggestedName,
          authType,
          description: description ?? '',
          provider: provider ?? '',
        },
      },
    };
  },
};

// =====================================
// list_credentials
// =====================================

export const listCredentialsTool: ChatToolDefinition = {
  id: 'list_credentials',
  name: 'List Credentials',
  description:
    'List all available credentials. Returns credential names, types, and IDs ' +
    '(not the actual secrets). Use this to check if a credential already exists ' +
    'before asking the user to create a new one.',
  parameters: z.object({}),
  async execute(_params: unknown, ctx: ChatToolContext): Promise<ChatToolResult> {
    const invect = ctx.invect as Invect;
    try {
      const credentials = await invect.listCredentials();
      const summary = credentials.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        authType: c.authType,
        description: c.description ?? '',
        isActive: c.isActive,
      }));
      return {
        success: true,
        data: { credentials: summary, total: summary.length },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to list credentials: ${(error as Error).message}`,
      };
    }
  },
};

// =====================================
// Export
// =====================================

export const credentialTools: ChatToolDefinition[] = [requestCredentialTool, listCredentialsTool];
