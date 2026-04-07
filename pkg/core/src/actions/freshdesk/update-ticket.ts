/**
 * freshdesk.update_ticket — Update an existing Freshdesk ticket
 *
 * Updates fields on a Freshdesk ticket (status, priority, subject, description).
 * Supports OAuth2 Bearer token or API key (Basic) authentication.
 */

import { defineAction } from '../define-action';
import { FRESHDESK_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'Freshdesk credential is required'),
  domain: z.string().min(1, 'Freshdesk domain is required'),
  ticketId: z.string().min(1, 'Ticket ID is required'),
  status: z.number().int().min(2).max(5).optional(),
  priority: z.number().int().min(1).max(4).optional(),
  subject: z.string().optional(),
});

export const freshdeskUpdateTicketAction = defineAction({
  id: 'freshdesk.update_ticket',
  name: 'Update Ticket',
  description:
    'Update an existing Freshdesk ticket (PUT /api/v2/tickets/{ticketId}). Use when the user wants to change a ticket\u2019s status, priority, or subject.\n\n' +
    'Example response:\n' +
    '```json\n' +
    '{"id": 1, "subject": "Issue", "status": 4, "priority": 3}\n' +
    '```',
  provider: FRESHDESK_PROVIDER,
  actionCategory: 'write',
  tags: ['freshdesk', 'support', 'ticket', 'helpdesk', 'update', 'oauth2'],

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
        description: 'The numeric ID of the ticket to update',
        aiProvided: true,
      },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        description: 'New ticket status (leave empty to keep current)',
        aiProvided: true,
        extended: true,
        options: [
          { label: 'Open', value: 2 },
          { label: 'Pending', value: 3 },
          { label: 'Resolved', value: 4 },
          { label: 'Closed', value: 5 },
        ],
      },
      {
        name: 'priority',
        label: 'Priority',
        type: 'select',
        description: 'New ticket priority (leave empty to keep current)',
        aiProvided: true,
        extended: true,
        options: [
          { label: 'Low', value: 1 },
          { label: 'Medium', value: 2 },
          { label: 'High', value: 3 },
          { label: 'Urgent', value: 4 },
        ],
      },
      {
        name: 'subject',
        label: 'Subject',
        type: 'text',
        description: 'New ticket subject (leave empty to keep current)',
        aiProvided: true,
        extended: true,
      },
    ],
  },

  async execute(params, context) {
    const { credentialId, domain, ticketId, status, priority, subject } = params;

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

    const body: Record<string, unknown> = {};
    if (status !== undefined) {
      body.status = status;
    }
    if (priority !== undefined) {
      body.priority = priority;
    }
    if (subject !== undefined && subject !== '') {
      body.subject = subject;
    }

    if (Object.keys(body).length === 0) {
      return {
        success: false,
        error: 'No fields to update. Provide at least one of status, priority, or subject.',
      };
    }

    context.logger.debug('Updating Freshdesk ticket', {
      domain,
      ticketId,
      fields: Object.keys(body),
    });

    try {
      const response = await fetch(`${baseUrl}/api/v2/tickets/${encodeURIComponent(ticketId)}`, {
        method: 'PUT',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

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
        error: `Failed to update Freshdesk ticket: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
