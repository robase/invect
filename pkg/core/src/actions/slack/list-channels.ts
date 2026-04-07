/**
 * slack.list_channels — List channels in a Slack workspace
 *
 * Lists public and/or private channels the bot is a member of.
 * Useful for discovering channel IDs before sending messages.
 * Requires a Slack OAuth2 credential with channels:read scope.
 */

import { defineAction } from '../define-action';
import { SLACK_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const SLACK_API_BASE = 'https://slack.com/api';

interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_private: boolean;
  is_archived: boolean;
  is_member: boolean;
  num_members?: number;
  topic?: { value: string };
  purpose?: { value: string };
}

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'Slack credential is required'),
  types: z.string().optional().default('public_channel'),
  excludeArchived: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(1000).optional().default(100),
});

export const slackListChannelsAction = defineAction({
  id: 'slack.list_channels',
  name: 'List Channels',
  description:
    'List channels in a Slack workspace (conversations.list). Use when you need to discover channel IDs, browse available channels, or find a channel to post to.\n\n' +
    'Example response:\n' +
    '```json\n' +
    '{"channels": [{"id": "C01ABC23DEF", "name": "general", "isPrivate": false, "numMembers": 42, "topic": "Company-wide"}], "count": 1}\n' +
    '```',
  provider: SLACK_PROVIDER,
  actionCategory: 'read',

  credential: {
    required: true,
    type: 'oauth2',
    oauth2Provider: 'slack',
    description: 'Slack OAuth2 credential with channels:read scope',
  },

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'credentialId',
        label: 'Slack Credential',
        type: 'text',
        required: true,
        description: 'Slack OAuth2 credential for authentication',
        aiProvided: false,
      },
      {
        name: 'types',
        label: 'Channel Types',
        type: 'select',
        defaultValue: 'public_channel',
        options: [
          { label: 'Public channels', value: 'public_channel' },
          { label: 'Private channels', value: 'private_channel' },
          { label: 'Both public & private', value: 'public_channel,private_channel' },
        ],
        description: 'Types of channels to list',
        aiProvided: true,
      },
      {
        name: 'excludeArchived',
        label: 'Exclude Archived',
        type: 'boolean',
        defaultValue: true,
        description: 'Exclude archived channels from the list',
        extended: true,
        aiProvided: true,
      },
      {
        name: 'limit',
        label: 'Limit',
        type: 'number',
        defaultValue: 100,
        description: 'Maximum number of channels to return (1–1000)',
        extended: true,
        aiProvided: true,
      },
    ],
  },

  tags: ['slack', 'messaging', 'channels', 'list', 'communication', 'oauth2'],

  async execute(params, context) {
    const { credentialId, types, excludeArchived, limit } = params;

    // Resolve credential
    let credential = context.credential;
    if (!credential && context.functions?.getCredential) {
      credential = await context.functions.getCredential(credentialId);
    }
    if (!credential) {
      return {
        success: false,
        error: `Credential not found: ${credentialId}. Please create a Slack OAuth2 credential.`,
      };
    }

    const accessToken =
      (credential.config?.accessToken as string) ?? (credential.config?.token as string);
    if (!accessToken) {
      return {
        success: false,
        error: 'No valid access token in credential. Please re-authorize the Slack credential.',
      };
    }

    context.logger.debug('Listing Slack channels', { types, excludeArchived, limit });

    try {
      const url = new URL(`${SLACK_API_BASE}/conversations.list`);
      url.searchParams.set('types', types);
      url.searchParams.set('exclude_archived', String(excludeArchived));
      url.searchParams.set('limit', String(Math.min(Math.max(1, limit), 1000)));

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        channels?: SlackChannel[];
        response_metadata?: { next_cursor?: string };
      };

      if (!data.ok) {
        return {
          success: false,
          error: `Slack API error: ${data.error ?? 'unknown error'}`,
        };
      }

      const channels = (data.channels ?? []).map((ch) => ({
        id: ch.id,
        name: ch.name,
        isPrivate: ch.is_private,
        isArchived: ch.is_archived,
        isMember: ch.is_member,
        numMembers: ch.num_members ?? 0,
        topic: ch.topic?.value ?? '',
        purpose: ch.purpose?.value ?? '',
      }));

      return {
        success: true,
        output: {
          channels,
          count: channels.length,
          hasMore: !!data.response_metadata?.next_cursor,
        },
        metadata: {
          channelCount: channels.length,
          types,
          hasMore: !!data.response_metadata?.next_cursor,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Slack list channels failed: ${msg}` };
    }
  },
});
