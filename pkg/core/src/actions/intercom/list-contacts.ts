/**
 * intercom.list_contacts — List contacts in Intercom
 *
 * Searches/lists contacts using the Intercom Search API.
 * An empty query returns all contacts with pagination support.
 * Requires an Intercom OAuth2 credential.
 */

import { defineAction } from '../define-action';
import { INTERCOM_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const INTERCOM_API = 'https://api.intercom.io';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'Intercom credential is required'),
  limit: z.number().int().min(1).max(150).optional().default(25),
});

export const intercomListContactsAction = defineAction({
  id: 'intercom.list_contacts',
  name: 'List Contacts',
  description:
    'List contacts in Intercom (POST /contacts/search). Use when the user wants to browse their Intercom contact list with pagination.\n\n' +
    'Example response:\n' +
    '```json\n' +
    '{"type": "list", "data": [{"id": "abc123", "role": "user", "email": "jane@example.com"}], "total_count": 50}\n' +
    '```',
  provider: INTERCOM_PROVIDER,
  actionCategory: 'read',

  credential: {
    required: true,
    type: 'oauth2',
    oauth2Provider: 'intercom',
    description: 'Intercom OAuth2 credential',
  },

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'credentialId',
        label: 'Intercom Credential',
        type: 'text',
        required: true,
        description: 'Intercom OAuth2 credential for authentication',
        aiProvided: false,
      },
      {
        name: 'limit',
        label: 'Limit',
        type: 'number',
        defaultValue: 25,
        description: 'Maximum number of contacts to return (1–150)',
        extended: true,
        aiProvided: true,
      },
    ],
  },

  tags: ['intercom', 'contacts', 'list', 'crm', 'oauth2'],

  async execute(params, context) {
    const { credentialId, limit } = params;

    let credential = context.credential;
    if (!credential && context.functions?.getCredential) {
      credential = await context.functions.getCredential(credentialId);
    }
    if (!credential) {
      return {
        success: false,
        error: `Credential not found: ${credentialId}. Please create an Intercom OAuth2 credential.`,
      };
    }

    const accessToken =
      (credential.config?.accessToken as string) ?? (credential.config?.token as string);
    if (!accessToken) {
      return {
        success: false,
        error: 'No valid access token in credential. Please re-authorize the Intercom credential.',
      };
    }

    context.logger.debug('Listing Intercom contacts', { limit });

    try {
      const response = await fetch(`${INTERCOM_API}/contacts/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Intercom-Version': '2.11',
        },
        body: JSON.stringify({
          query: { operator: 'AND', value: [] },
          pagination: { per_page: Math.min(Math.max(1, limit), 150) },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `Intercom API error (${response.status}): ${errorBody}`,
        };
      }

      const data = (await response.json()) as {
        type: string;
        data: Array<{
          id: string;
          type: string;
          role: string;
          email: string | null;
          name: string | null;
          phone: string | null;
          external_id: string | null;
          created_at: number;
          updated_at: number;
        }>;
        total_count: number;
        pages?: { next?: { starting_after?: string }; total_pages?: number };
      };

      const contacts = (data.data ?? []).map((c) => ({
        id: c.id,
        role: c.role,
        email: c.email,
        name: c.name,
        phone: c.phone,
        externalId: c.external_id,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      }));

      return {
        success: true,
        output: {
          contacts,
          count: contacts.length,
          totalCount: data.total_count,
          hasMore: !!data.pages?.next?.starting_after,
        },
        metadata: {
          contactCount: contacts.length,
          totalCount: data.total_count,
          hasMore: !!data.pages?.next?.starting_after,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Intercom list contacts failed: ${msg}` };
    }
  },
});
