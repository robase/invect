/**
 * freshdesk.get_ticket — Get a single Freshdesk ticket by ID
 *
 * Retrieves full ticket details including conversations from a Freshdesk domain.
 * Supports OAuth2 Bearer token or API key (Basic) authentication.
 */

import { defineAction } from '../define-action';
import { FRESHDESK_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'Freshdesk credential is required'),
  domain: z.string().min(1, 'Freshdesk domain is required'),
  ticketId: z.string().min(1, 'Ticket ID is required'),
});

export const freshdeskGetTicketAction = defineAction({
  id: 'freshdesk.get_ticket',
  name: 'Get Ticket',
  description:
    'Get a Freshdesk ticket by ID, including its conversations. Use this to retrieve full details of a specific support ticket.',
  provider: FRESHDESK_PROVIDER,
  actionCategory: 'read',
  tags: ['freshdesk', 'support', 'ticket', 'helpdesk', 'get', 'oauth2'],

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
        name: 'ticketId',
        label: 'Ticket ID',
        type: 'text',
        required: true,
        placeholder: '12345',
        description: 'The numeric ID of the Freshdesk ticket',
        aiProvided: true,
      },
    ],
  },

  async execute(params, context) {
    const { credentialId, domain, ticketId } = params;

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

    context.logger.debug('Getting Freshdesk ticket', { domain, ticketId });

    try {
      const response = await fetch(
        `${baseUrl}/api/v2/tickets/${encodeURIComponent(ticketId)}?include=conversations`,
        {
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Freshdesk API error (${response.status}): ${errorText}`,
        };
      }

      const ticket = await response.json();

      return { success: true, output: ticket };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get Freshdesk ticket: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
