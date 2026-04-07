/**
 * woocommerce.list_customers — List customers from a WooCommerce store
 *
 * Retrieves customers from the WooCommerce REST API.
 * Requires a WooCommerce API key credential (consumer key + consumer secret + site URL).
 */

import { defineAction } from '../define-action';
import { WOOCOMMERCE_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'WooCommerce credential is required'),
  perPage: z.number().int().min(1).max(100).optional().default(10),
});

export const woocommerceListCustomersAction = defineAction({
  id: 'woocommerce.list_customers',
  name: 'List Customers',
  description:
    'List customers from a WooCommerce store (GET /wp-json/wc/v3/customers). Use when you need to look up customer accounts, contact details, or billing/shipping info.\n\n' +
    'Example response:\n' +
    '```json\n' +
    '[{"id": 25, "email": "john@example.com", "first_name": "John", "last_name": "Doe", "billing": {"city": "San Francisco", "state": "CA"}, "orders_count": 3}]\n' +
    '```',
  provider: WOOCOMMERCE_PROVIDER,
  actionCategory: 'read',
  tags: ['woocommerce', 'customers', 'ecommerce', 'list'],

  credential: {
    required: true,
    type: 'api_key',
    description: 'WooCommerce API credential (consumer key + consumer secret + site URL)',
  },

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'credentialId',
        label: 'WooCommerce Credential',
        type: 'text',
        required: true,
        description: 'WooCommerce API credential for authentication',
        aiProvided: false,
      },
      {
        name: 'perPage',
        label: 'Per Page',
        type: 'number',
        defaultValue: 10,
        description: 'Maximum number of customers to return (1–100)',
        extended: true,
        aiProvided: true,
      },
    ],
  },

  async execute(params, context) {
    const { credentialId, perPage } = params;

    let credential = context.credential;
    if (!credential && context.functions?.getCredential) {
      credential = await context.functions.getCredential(credentialId);
    }
    if (!credential) {
      return { success: false, error: `Credential not found: ${credentialId}` };
    }

    const consumerKey = credential.config?.consumerKey as string;
    const consumerSecret = credential.config?.consumerSecret as string;
    const siteUrl = (credential.config?.siteUrl as string) ?? (credential.config?.url as string);

    if (!consumerKey || !consumerSecret) {
      return { success: false, error: 'WooCommerce consumer key and secret are required.' };
    }
    if (!siteUrl) {
      return { success: false, error: 'WooCommerce site URL is required in credential config.' };
    }

    const basicAuth = btoa(`${consumerKey}:${consumerSecret}`);

    context.logger.debug('Executing WooCommerce list customers', { perPage });

    try {
      const response = await fetch(`${siteUrl}/wp-json/wc/v3/customers?per_page=${perPage}`, {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `WooCommerce API error: ${response.status} ${response.statusText} - ${errorText}`,
        };
      }

      const data = (await response.json()) as unknown[];

      return {
        success: true,
        output: data,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list WooCommerce customers: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
