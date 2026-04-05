/**
 * woocommerce.list_orders — List orders from a WooCommerce store
 *
 * Retrieves orders from the WooCommerce REST API with optional status filtering.
 * Requires a WooCommerce API key credential (consumer key + consumer secret + site URL).
 */

import { defineAction } from '../define-action';
import { WOOCOMMERCE_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'WooCommerce credential is required'),
  perPage: z.number().int().min(1).max(100).optional().default(10),
  status: z
    .enum(['any', 'pending', 'processing', 'completed', 'cancelled'])
    .optional()
    .default('any'),
});

export const woocommerceListOrdersAction = defineAction({
  id: 'woocommerce.list_orders',
  name: 'List Orders',
  description:
    'List orders from a WooCommerce store. Filter by status: any, pending, processing, completed, or cancelled.',
  provider: WOOCOMMERCE_PROVIDER,
  actionCategory: 'read',
  tags: ['woocommerce', 'orders', 'ecommerce', 'list'],

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
        description: 'Maximum number of orders to return (1–100)',
      },
      {
        name: 'status',
        label: 'Order Status',
        type: 'select',
        defaultValue: 'any',
        description: 'Filter orders by status',
        options: [
          { label: 'Any', value: 'any' },
          { label: 'Pending', value: 'pending' },
          { label: 'Processing', value: 'processing' },
          { label: 'Completed', value: 'completed' },
          { label: 'Cancelled', value: 'cancelled' },
        ],
      },
    ],
  },

  async execute(params, context) {
    const { credentialId, perPage, status } = params;

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

    context.logger.debug('Executing WooCommerce list orders', { perPage, status });

    try {
      const url = new URL(`${siteUrl}/wp-json/wc/v3/orders`);
      url.searchParams.set('per_page', String(perPage));
      if (status !== 'any') {
        url.searchParams.set('status', status);
      }

      const response = await fetch(url.toString(), {
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
        error: `Failed to list WooCommerce orders: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
