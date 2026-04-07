/**
 * freshdesk.list_tickets — List tickets from Freshdesk
 *
 * Retrieves a paginated list of tickets from a Freshdesk domain.
 * Supports OAuth2 Bearer token or API key (Basic) authentication.
 */

import { defineAction } from '../define-action';
import { FRESHDESK_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'Freshdesk credential is required'),
  domain: z.string().min(1, 'Freshdesk domain is required'),
  perPage: z.number().int().min(1).max(100).optional().default(30),
});

export const freshdeskListTicketsAction = defineAction({
  id: 'freshdesk.list_tickets',
  name: 'List Tickets',
  description:
    'List tickets from a Freshdesk helpdesk (GET /api/v2/tickets). Use when the user wants to retrieve a paginated list of support tickets.\n\n' +
    'Example response:\n' +
    '```json\n' +
    '[{"id": 1, "subject": "Issue", "status": 2, "priority": 1, "requester_id": 123}]\n' +
    '```',
  provider: FRESHDESK_PROVIDER,
  actionCategory: 'read',
  tags: ['freshdesk', 'support', 'tickets', 'helpdesk', 'list', 'oauth2'],

  credential: {
    required: true,
    type: 'oauth2',
    oauth2Provider: 'freshdesk',
    description: 'Freshdesk OAuth2 credential or API key credential',
  },

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'credentialId',
        label: 'Freshdesk Credential',
        type: 'text',
        required: true,
        description: 'Freshdesk OAuth2 or API key credential',
        aiProvided: false,
      },
      {
        name: 'domain',
        label: 'Domain',
        type: 'text',
        required: true,
        placeholder: 'mycompany',
        description: 'Your Freshdesk subdomain (e.g. "mycompany" for mycompany.freshdesk.com)',
        aiProvided: false,
      },
      {
        name: 'perPage',
        label: 'Per Page',
        type: 'number',
        defaultValue: 30,
        description: 'Number of tickets to return per page (1–100)',
        aiProvided: true,
        extended: true,
      },
    ],
  },

  async execute(params, context) {
    const { credentialId, domain, perPage } = params;

    let credential = context.credential;
    if (!credential && context.functions?.getCredential) {
      credential = await context.functions.getCredential(credentialId);
    }
    if (!credential) {
      return {
        success: false,
        error: `Credential not found: ${credentialId}. Please create a Freshdesk credential.`,
      };
    }

    const accessToken =
      (credential.config?.accessToken as string) ?? (credential.config?.token as string);
    const apiKey = credential.config?.apiKey as string;

    let authHeader: string;
    if (accessToken) {
      authHeader = `Bearer ${accessToken}`;
    } else if (apiKey) {
      authHeader = `Basic ${btoa(`${apiKey}:X`)}`;
    } else {
      return { success: false, error: 'No access token or API key found in credential.' };
    }

    const baseUrl = `https://${encodeURIComponent(domain)}.freshdesk.com`;

    context.logger.debug('Listing Freshdesk tickets', { domain, perPage });

    try {
      const response = await fetch(`${baseUrl}/api/v2/tickets?per_page=${perPage}`, {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Freshdesk API error (${response.status}): ${errorText}`,
        };
      }

      const tickets = await response.json();

      return {
        success: true,
        output: { tickets, count: Array.isArray(tickets) ? tickets.length : 0 },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list Freshdesk tickets: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
