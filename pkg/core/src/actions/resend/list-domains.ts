/**
 * resend.list_domains — List verified sending domains
 *
 * Retrieves all domains configured in the Resend account, including
 * their verification status and capabilities.
 *
 * @see https://resend.com/docs/api-reference/domains/list-domains
 */

import { defineAction } from '../define-action';
import { RESEND_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const RESEND_API_BASE = 'https://api.resend.com';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'Resend credential is required'),
  limit: z.number().int().min(1).max(100).optional(),
});

export const resendListDomainsAction = defineAction({
  id: 'resend.list_domains',
  name: 'List Domains',
  description:
    'List all configured sending domains and their verification status (GET /domains). Use when the user wants to check which domains are available for sending emails.\n\n' +
    'Example response:\n' +
    '```json\n' +
    '{"data": [{"id": "d91cd9bd-1176-453e-8fc1-35364d380206", "name": "example.com", "status": "not_started", "region": "us-east-1"}]}\n' +
    '```',
  provider: RESEND_PROVIDER,
  actionCategory: 'read',
  tags: ['resend', 'domains', 'list', 'email', 'configuration'],

  credential: {
    required: true,
    description: 'Resend API key credential',
  },

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'credentialId',
        label: 'Resend Credential',
        type: 'text',
        required: true,
        description: 'Resend API key credential for authentication',
        aiProvided: false,
      },
      {
        name: 'limit',
        label: 'Limit',
        type: 'number',
        required: false,
        description: 'Maximum number of domains to return (1–100)',
        extended: true,
        aiProvided: true,
      },
    ],
  },

  async execute(params, context) {
    const { credentialId, limit } = params;

    let credential = context.credential;
    if (!credential && context.functions?.getCredential) {
      credential = await context.functions.getCredential(credentialId);
    }
    if (!credential) {
      return {
        success: false,
        error: `Credential not found: ${credentialId}. Please create a Resend API key credential.`,
      };
    }

    const apiKey = (credential.config?.apiKey as string) ?? (credential.config?.token as string);
    if (!apiKey) {
      return {
        success: false,
        error: 'No API key found in credential. Please add a Resend API key.',
      };
    }

    const queryParams = new URLSearchParams();
    if (limit) {
      queryParams.set('limit', String(limit));
    }

    const qs = queryParams.toString();
    const url = `${RESEND_API_BASE}/domains${qs ? `?${qs}` : ''}`;

    context.logger.debug('Listing Resend domains', { limit });

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'invect/1.0',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return { success: false, error: `Resend API error ${response.status}: ${errorBody}` };
      }

      const result = (await response.json()) as { data?: unknown[] };

      return {
        success: true,
        output: {
          domains: result.data ?? result,
          count: Array.isArray(result.data) ? result.data.length : 0,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to list Resend domains: ${message}` };
    }
  },
});
