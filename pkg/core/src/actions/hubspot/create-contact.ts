/**
 * hubspot.create_contact — Create a new contact in HubSpot CRM
 *
 * Creates a contact record with the supplied properties (email, name, phone, etc.).
 * Requires a HubSpot OAuth2 credential with crm.objects.contacts.write scope.
 */

import { defineAction } from '../define-action';
import { HUBSPOT_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const HUBSPOT_API = 'https://api.hubapi.com';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'HubSpot credential is required'),
  email: z.string().min(1, 'Email is required'),
  firstname: z.string().optional().default(''),
  lastname: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  company: z.string().optional().default(''),
});

export const hubspotCreateContactAction = defineAction({
  id: 'hubspot.create_contact',
  name: 'Create Contact',
  description:
    'Create a new contact in HubSpot CRM with email, name, phone, and company properties.',
  provider: HUBSPOT_PROVIDER,
  actionCategory: 'write',

  credential: {
    required: true,
    type: 'oauth2',
    oauth2Provider: 'hubspot',
    description: 'HubSpot OAuth2 credential',
  },

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'credentialId',
        label: 'HubSpot Credential',
        type: 'text',
        required: true,
        description: 'HubSpot OAuth2 credential for authentication',
        aiProvided: false,
      },
      {
        name: 'email',
        label: 'Email',
        type: 'text',
        required: true,
        placeholder: 'jane@example.com',
        description: 'Contact email address (required)',
        aiProvided: true,
      },
      {
        name: 'firstname',
        label: 'First Name',
        type: 'text',
        placeholder: 'Jane',
        description: 'Contact first name',
        aiProvided: true,
      },
      {
        name: 'lastname',
        label: 'Last Name',
        type: 'text',
        placeholder: 'Doe',
        description: 'Contact last name',
        aiProvided: true,
      },
      {
        name: 'phone',
        label: 'Phone',
        type: 'text',
        placeholder: '+1-555-0100',
        description: 'Contact phone number',
        aiProvided: true,
      },
      {
        name: 'company',
        label: 'Company',
        type: 'text',
        placeholder: 'Acme Inc.',
        description: 'Contact company name',
        aiProvided: true,
      },
    ],
  },

  tags: ['hubspot', 'crm', 'contacts', 'create', 'oauth2'],

  async execute(params, context) {
    const { credentialId, email, firstname, lastname, phone, company } = params;

    let credential = context.credential;
    if (!credential && context.functions?.getCredential) {
      credential = await context.functions.getCredential(credentialId);
    }
    if (!credential) {
      return {
        success: false,
        error: `Credential not found: ${credentialId}. Please create a HubSpot OAuth2 credential.`,
      };
    }

    const accessToken =
      (credential.config?.accessToken as string) ?? (credential.config?.token as string);
    if (!accessToken) {
      return {
        success: false,
        error: 'No valid access token in credential. Please re-authorize the HubSpot credential.',
      };
    }

    const properties: Record<string, string> = { email };
    if (firstname) {
      properties.firstname = firstname;
    }
    if (lastname) {
      properties.lastname = lastname;
    }
    if (phone) {
      properties.phone = phone;
    }
    if (company) {
      properties.company = company;
    }

    context.logger.debug('Creating HubSpot contact', { email });

    try {
      const response = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          success: false,
          error: `HubSpot API error (${response.status}): ${errText}`,
        };
      }

      const data = await response.json();
      return { success: true, output: data };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `HubSpot create contact failed: ${msg}` };
    }
  },
});
