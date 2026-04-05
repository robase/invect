/**
 * stripe.list_subscriptions — List Stripe subscriptions
 *
 * Retrieves a paginated list of subscriptions from the Stripe account.
 * Supports filtering by customer ID and subscription status.
 * Requires a Stripe credential with a secret key or access token.
 */

import { defineAction } from '../define-action';
import { STRIPE_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const STRIPE_API = 'https://api.stripe.com';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'Stripe credential is required'),
  limit: z.number().int().min(1).max(100).optional().default(10),
  customer: z.string().optional().default(''),
  status: z.enum(['active', 'past_due', 'canceled', 'all']).optional().default('all'),
});

export const stripeListSubscriptionsAction = defineAction({
  id: 'stripe.list_subscriptions',
  name: 'List Subscriptions',
  description:
    'List subscriptions from a Stripe account. Optionally filter by customer ID and subscription status.',
  provider: STRIPE_PROVIDER,
  actionCategory: 'read',

  credential: {
    required: true,
    type: 'oauth2',
    oauth2Provider: 'stripe',
    description: 'Stripe credential with API key or OAuth access token',
  },

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'credentialId',
        label: 'Stripe Credential',
        type: 'text',
        required: true,
        description: 'Stripe credential for authentication',
        aiProvided: false,
      },
      {
        name: 'limit',
        label: 'Limit',
        type: 'number',
        defaultValue: 10,
        description: 'Maximum number of subscriptions to return (1–100)',
        extended: true,
        aiProvided: true,
      },
      {
        name: 'customer',
        label: 'Customer ID',
        type: 'text',
        placeholder: 'cus_abc123',
        description: 'Filter subscriptions by Stripe customer ID',
        aiProvided: true,
      },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        defaultValue: 'all',
        options: [
          { label: 'All', value: 'all' },
          { label: 'Active', value: 'active' },
          { label: 'Past Due', value: 'past_due' },
          { label: 'Canceled', value: 'canceled' },
        ],
        description: 'Filter subscriptions by status',
        extended: true,
        aiProvided: true,
      },
    ],
  },

  tags: ['stripe', 'subscriptions', 'list', 'recurring', 'payments'],

  async execute(params, context) {
    const { credentialId, limit, customer, status } = params;

    let credential = context.credential;
    if (!credential && context.functions?.getCredential) {
      credential = await context.functions.getCredential(credentialId);
    }
    if (!credential) {
      return {
        success: false,
        error: `Credential not found: ${credentialId}. Please create a Stripe credential.`,
      };
    }

    const apiKey =
      (credential.config?.secretKey as string) ??
      (credential.config?.apiKey as string) ??
      (credential.config?.accessToken as string) ??
      (credential.config?.token as string);
    if (!apiKey) {
      return { success: false, error: 'No API key or access token found in credential.' };
    }

    context.logger.debug('Listing Stripe subscriptions', {
      limit,
      customer: customer || '(all)',
      status,
    });

    try {
      const url = new URL(`${STRIPE_API}/v1/subscriptions`);
      url.searchParams.set('limit', String(Math.min(Math.max(1, limit), 100)));
      if (customer) {
        url.searchParams.set('customer', customer);
      }
      if (status && status !== 'all') {
        url.searchParams.set('status', status);
      }

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Stripe API error: ${response.status} ${response.statusText} - ${errorText}`,
        };
      }

      const data = (await response.json()) as {
        data: Array<Record<string, unknown>>;
        has_more: boolean;
      };

      return {
        success: true,
        output: {
          subscriptions: data.data,
          count: data.data.length,
          hasMore: data.has_more,
        },
        metadata: { count: data.data.length, hasMore: data.has_more },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Stripe list subscriptions failed: ${msg}` };
    }
  },
});
